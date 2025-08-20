import { AcceptInviteSchema, LoginSchema } from "../schemas/auth.js";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/index.js";
import {
  invitations,
  memberships,
  organizations,
  users,
  sessions as sessionsTable,
} from "../db/schema.js";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../auth/crypto.js";
import { createSession, destroySession, sessionCookieOpts } from "../auth/session.js";
import { env } from "../env.js";

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/accept-invite
  app.post("/accept-invite", async (req, reply) => {
    const body = AcceptInviteSchema.parse(req.body);

    // Search for valid invitation
    // (not used, not expired)
    const invRows = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, body.token))
      .limit(1);

    // Validate invitation
    const inv = invRows[0];
    // If no invitation found or already used or expired
    if (!inv || inv.usedAt || new Date(inv.expiresAt).getTime() < Date.now()) {
      return reply.code(400).send({ ok: false, error: "Invalid or expired invite" });
    }

    // Create a user if it doesn't exist or update password if it does
    const userRows = await db.select().from(users).where(eq(users.email, inv.email)).limit(1);
    const pwdHash = await hashPassword(body.password);

    // ID of the user to create or update
    let userId: string;
    if (!userRows[0]) {
      const inserted = await db
        .insert(users)
        .values({ email: inv.email, passwordHash: pwdHash, isActive: true })
        .returning({ id: users.id });
        //  It must return the ID of the newly created user, can not be undefined
        if (inserted[0] === undefined) {
            return reply.code(500).send({ ok: false, error: "Failed to create user" });
        }
        userId = inserted[0].id;
    } else {
      userId = userRows[0].id;
      // Update password if the user already exists
      await db.update(users).set({ passwordHash: pwdHash, isActive: true }).where(eq(users.id, userId));
    }
    /** If the user already has an active membership in the organization, 
      do nothing (this prevents a user from accepting an invitation to an organization where they are already a member)
      This is done to avoid duplicate memberships and to ensure the user is added to 
      the organization if they are not already a member.
      If the user is already a member, we do not need to create a new membership. **/
    const countRows = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, inv.orgId)));

    if ((countRows[0]?.count ?? 0) === 0) {
      await db.insert(memberships).values({
        userId,
        orgId: inv.orgId,
        role: inv.role,
      });
    }

    // Mark the invitation as used (to prevent reuse)
    await db.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, inv.id));

    // Create a session for the user. Session includes IP and user-agent for security
    const meta: { ip?: string; ua?: string } = { ip: req.ip };
    const ua = req.headers["user-agent"];
    if (typeof ua === "string") meta.ua = ua;

    const sess = await createSession(userId, inv.orgId, meta);
    // Set the session cookie and respond with user and organization info, This cookie will be used for authentication in subsequent requests
    // The cookie will be set with the session ID and will expire at the session's expiration
    reply
      .setCookie(env.cookieName, sess.id, { ...sessionCookieOpts(), expires: sess.expiresAt })
      .send({ ok: true, userId, orgId: inv.orgId });
  });

  // POST - To log in a user
  // It checks the user's credentials and creates a session if valid
  app.post("/login", async (req, reply) => {
    const body = LoginSchema.parse(req.body);

    const userRows = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    const thisUser = userRows[0];
    if (!thisUser || !thisUser.isActive) return reply.code(401).send({ ok: false, error: "Invalid credentials" });

    const passCheck = await verifyPassword(thisUser.passwordHash, body.password);
    if (!passCheck) return reply.code(401).send({ ok: false, error: "Invalid credentials" });

    // Check if the user has any organizations assigned
    // If the user has multiple organizations, they can choose one to see the information
    const orgRows = await db
      .select({
        orgId: memberships.orgId,
        role: memberships.role,
        orgName: organizations.name,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, thisUser.id));

    if (orgRows.length === 0) {
      return reply.code(403).send({ ok: false, error: "No organizations assigned" });
    }

    const selectedOrg = body.orgId
      ? orgRows.find((o) => o.orgId === body.orgId)
      : orgRows[0];

    if (!selectedOrg) return reply.code(403).send({ ok: false, error: "Organization not allowed" });

    // Create a session for the user in the selected organization
    const meta: { ip?: string; ua?: string } = { ip: req.ip };
    const ua = req.headers["user-agent"];
    if (typeof ua === "string") meta.ua = ua;

    const sess = await createSession(thisUser.id, selectedOrg.orgId, meta);

    reply
      .setCookie(env.cookieName, sess.id, { ...sessionCookieOpts(), expires: sess.expiresAt })
      .send({
        ok: true,
        user: { id: thisUser.id, email: thisUser.email },
        org: { id: selectedOrg.orgId, name: selectedOrg.orgName, role: selectedOrg.role },
      });
  });

  // GET /auth/me - This endpoint retrieves the current user's session and organization information
  // It checks the session cookie and returns user details if valid.
  app.get("/me", async (req, reply) => {
    const sid = req.cookies[env.cookieName];
    if (!sid) return reply.code(401).send({ ok: false, error: "No session" });

    const sRows = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sid)).limit(1);
    const actualSession = sRows[0];
    if (!actualSession || new Date(actualSession.expiresAt).getTime() < Date.now()) {
      return reply.code(401).send({ ok: false, error: "Session expired" });
    }

    const userRows = await db.select().from(users).where(eq(users.id, actualSession.userId)).limit(1);
    const u = userRows[0];
    if (!u) return reply.code(401).send({ ok: false, error: "User not found" });

    const orgRows = await db
      .select({
        orgId: memberships.orgId,
        role: memberships.role,
        orgName: organizations.name,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, u.id));

    reply.send({
      ok: true,
      user: { id: u.id, email: u.email },
      session: { id: actualSession.id, orgId: actualSession.orgId, expiresAt: actualSession.expiresAt },
      orgs: orgRows,
    });
  });

  // POST /auth/logout
  app.post("/logout", async (req, reply) => {
    const sid = req.cookies[env.cookieName];
    if (sid) await destroySession(sid);
    reply.clearCookie(env.cookieName, sessionCookieOpts()).send({ ok: true });
  });
};
