/** SCHEMAS FOR XENIA API
 * This file defines the database schema for the Xenia API using Drizzle ORM.
 * Schemas are the structure of the database tables, including their fields, types, and relationships.
 *
*/

import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, boolean, timestamp, pgEnum, primaryKey,
  integer, bigserial, bigint as pgBigint, date, inet
} from 'drizzle-orm/pg-core';

// Enums 
// Enums are used to define a set of named values for specific fields in the database
// These are used for roles, reservation statuses, etc.S
export const orgRole = pgEnum('org_role', ['owner', 'admin', 'member']);
export const resStatus = pgEnum('res_status', ['pending','confirmed','checked_in','checked_out','cancelled']);

// Núcleo identidad & tenancy
// Usuarios
// Incluye email, password hash, estado (activo/inactivo), fecha de creación
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(), // si quieres ciText, hazlo por migración manual
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Organizaciones
// Cada usuario puede crear múltiples organizaciones

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Memberships of users in organizations
// This table links users to organizations with a role
export const memberships = pgTable('memberships', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  role: orgRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // primary key on userId + orgId
  // This ensures a user can only have one membership per organization
  primaryKey({ columns: [t.userId, t.orgId] }),
]);

//Sessions management
// This table stores user sessions with organization context, also includes IP address and user agent for security purposes
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
  ip: inet('ip'),
  userAgent: text('user_agent'),
});

// Invitaciones a la organización
// Incluye token de invitación y fecha de expiración
export const invitations = pgTable('invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: orgRole('role').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

// Propiedades & reservas
// Incluye propietarios de propiedades (propertyOwners)
// Permisos de usuarios sobre propiedades (propertyAccess)
export const propertyOwners = pgTable('property_owners', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
});

// Propiedades gestionadas por la organización
// Incluye referencia al propietario (propertyOwner) si aplica
export const properties = pgTable('properties', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').references(() => propertyOwners.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  code: text('code'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Acceso de usuarios a propiedades específicas
// Permite asignar permisos a usuarios para gestionar ciertas propiedades
export const propertyAccess = pgTable('property_access', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.propertyId] }),
}));

// Reservas realizadas en las propiedades
// Incluye detalles como fechas, estado, canal, importe, etc.
export const reservations = pgTable('reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  guestName: text('guest_name'),
  checkinDate: date('checkin_date').notNull(),
  checkoutDate: date('checkout_date').notNull(),
  totalAmountCents: pgBigint('total_amount_cents', { mode: 'number' }).notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  status: resStatus('status').notNull().default('pending'),
  channel: text('channel'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

