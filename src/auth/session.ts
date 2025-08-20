import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../env.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.nodeEnv === "production",
    path: "/",
  };
}

export async function createSession(userId: string, orgId: string, meta?: { ip?: string; ua?: string }) {
  const expiresAt = new Date(Date.now() + WEEK);
  const [{ id }] = await db
    .insert(sessions)
    .values({
      userId,
      orgId,
      expiresAt,
      ip: meta?.ip as any,
      userAgent: meta?.ua,
    })
    .returning({ id: sessions.id });
  return { id, expiresAt };
}

export async function destroySession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
