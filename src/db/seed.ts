// src/seeds/seed.ts
import 'dotenv/config';
import crypto from 'node:crypto';
import { db } from './index.js';
import { users, organizations, memberships, invitations, properties } from './schema.js';
import { sql, and, eq, count } from 'drizzle-orm';
import { hashPassword } from '../auth/crypto.js';

function rndToken(n = 24) {
  return crypto.randomBytes(n).toString('hex');
}

// helpers seguros
function first<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[0] : undefined;
}
function required<T>(val: T | undefined, msg = 'Required value missing'): T {
  if (val === undefined || val === null) throw new Error(msg);
  return val;
}

async function ensureExtensions() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
}

async function ensureOwnerUser(email: string, plainPass: string) {
  const existingArr = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const existing = first(existingArr);
  if (existing) return existing.id;

  const passwordHash = await hashPassword(plainPass);
  const insertedArr = await db
    .insert(users)
    .values({ email, passwordHash, isActive: true })
    .returning({ id: users.id });
  const inserted = required(first(insertedArr), 'Insert user failed');
  return inserted.id;
}

async function ensureOrganization(name: string, createdBy: string) {
  const existingArr = await db.select().from(organizations).where(eq(organizations.name, name)).limit(1);
  const existing = first(existingArr);
  if (existing) return existing.id;

  const insertedArr = await db
    .insert(organizations)
    .values({ name, createdBy })
    .returning({ id: organizations.id });
  const inserted = required(first(insertedArr), 'Insert org failed');
  return inserted.id;
}

async function ensureMembership(userId: string, orgId: string, role: 'owner' | 'admin' | 'member') {
  const countArr = await db
    .select({ c: count() })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
  const { c } = required(first(countArr), 'Count memberships failed');
  if (Number(c) === 0) {
    await db.insert(memberships).values({ userId, orgId, role });
  }
}

async function ensureProperty(orgId: string, name: string) {
  const existingArr = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.name, name)))
    .limit(1);
  const existing = first(existingArr);
  if (!existing) {
    await db.insert(properties).values({ orgId, name, isActive: true });
  }
}

async function getPendingInvite(orgId: string, email: string) {
  const rows = await db
    .select({ token: invitations.token, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(eq(invitations.orgId, orgId), eq(invitations.email, email), sql`${invitations.usedAt} IS NULL`))
    .limit(1);
  return first(rows);
}

async function createInvite(orgId: string, email: string, role: 'owner' | 'admin' | 'member') {
  const token = rndToken(24);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const insertedArr = await db
    .insert(invitations)
    .values({ orgId, email, role, token, expiresAt })
    .returning({ token: invitations.token, expiresAt: invitations.expiresAt });
  return required(first(insertedArr), 'Insert invitation failed');
}

async function main() {
  await ensureExtensions();

  const OWNER_EMAIL = 'owner@xenia.local';
  const OWNER_PASS = 'Owner123!';
  const ORG_NAME = 'XenIA Demo Org';

  const INV_EMAIL = 'admin@xenia.local';
  const INV_ROLE: 'admin' = 'admin';
  const PROP_NAME = 'Villa Demo';

  const ownerId = await ensureOwnerUser(OWNER_EMAIL, OWNER_PASS);
  const orgId = await ensureOrganization(ORG_NAME, ownerId);
  await ensureMembership(ownerId, orgId, 'owner');
  await ensureProperty(orgId, PROP_NAME);

  // invitación pendiente o nueva
  const existingInvite = await getPendingInvite(orgId, INV_EMAIL);
  const invite = existingInvite ?? (await createInvite(orgId, INV_EMAIL, INV_ROLE));

  console.log('✅ Seed listo');
  console.log('Owner login:');
  console.log(`  email: ${OWNER_EMAIL}`);
  console.log(`  pass : ${OWNER_PASS}`);
  console.log('\nInvitación admin:');
  console.log(`  email : ${INV_EMAIL}`);
  console.log(`  token : ${invite.token}`);
  console.log(`  expira: ${new Date(invite.expiresAt as unknown as string).toISOString()}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
