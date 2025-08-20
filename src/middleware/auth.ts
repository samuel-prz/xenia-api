import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/index.js";
import { sessions, memberships } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: { userId: string; orgId: string; roles: Array<"owner"|"admin"|"member"> };
  }
}

export const authMiddleware: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    // Solo protegerá rutas que lo usen explícitamente; aquí no rechazamos por defecto
    (req as any).getSession = async () => {
      const sid = req.cookies[env.cookieName];
      if (!sid) return null;
      const s = (await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1))[0];
      if (!s || new Date(s.expiresAt).getTime() < Date.now()) return null;
      return s;
    };
  });
};

// requiere sesión
export function requireSession() {
  return async (req: any, reply: any) => {
    const sid = req.cookies[env.cookieName];
    if (!sid) return reply.code(401).send({ ok: false, error: "No session" });
    const s = (await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1))[0];
    if (!s || new Date(s.expiresAt).getTime() < Date.now()) {
      return reply.code(401).send({ ok: false, error: "Session expired" });
    }
    req.auth = { userId: s.userId, orgId: s.orgId, roles: [] };
  };
}

// requiere membresía en org param
export function requireOrg() {
  return async (req: any, reply: any) => {
    const auth = req.auth;
    const orgId = req.params?.orgId as string;
    if (!auth || !orgId) return reply.code(400).send({ ok: false, error: "Missing orgId" });
    if (auth.orgId !== orgId) return reply.code(403).send({ ok: false, error: "Wrong organization context" });

    const rows = await db.select().from(memberships)
      .where(eq(memberships.userId, auth.userId));
    const roles = rows.filter(r => r.orgId === orgId).map(r => r.role);
    if (roles.length === 0) return reply.code(403).send({ ok: false, error: "No membership" });

    req.auth.roles = roles as any;
  };
}

// requiere rol mínimo
export function requireRole(min: "admin" | "owner") {
  const order = { member: 0, admin: 1, owner: 2 };
  return async (req: any, reply: any) => {
    const roles = req.auth?.roles ?? [];
    const max = roles.reduce((acc, r) => Math.max(acc, order[r]), 0);
    if (max < order[min]) {
      return reply.code(403).send({ ok: false, error: "Insufficient role" });
    }
  };
}
