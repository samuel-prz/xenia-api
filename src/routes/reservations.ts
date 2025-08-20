import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/index.js";
import { reservations, properties, memberships, organizations } from "../db/schema.js";
import { and, eq, gte, lte } from "drizzle-orm";
import { ReservationCreateSchema, ReservationUpdateSchema } from "../schemas/reservations.js";
import { requireSession, requireOrg, requireRole } from "../middleware/auth.js";

export const reservationRoutes: FastifyPluginAsync = async (app) => {
  // List (con filtros básicos)
  app.get("/orgs/:orgId/reservations", { preHandler: [requireSession(), requireOrg()] }, async (req, reply) => {
    const { orgId } = req.params as any;
    const { propertyId, from, to, status } = req.query as any;

    let where = and(eq(reservations.orgId, orgId));
    if (propertyId) where = and(where, eq(reservations.propertyId, propertyId));
    if (from) where = and(where, gte(reservations.checkinDate, from));
    if (to) where = and(where, lte(reservations.checkoutDate, to));
    if (status) where = and(where, eq(reservations.status, status));

    const rows = await db.select().from(reservations).where(where);
    reply.send({ ok: true, data: rows });
  });

  // Create
  app.post("/orgs/:orgId/reservations", { preHandler: [requireSession(), requireOrg(), requireRole("admin")] }, async (req, reply) => {
    const { orgId } = req.params as any;
    const body = ReservationCreateSchema.parse(req.body);
    const inserted = await db.insert(reservations).values({
      orgId,
      propertyId: body.propertyId,
      guestName: body.guestName,
      checkinDate: body.checkinDate as any,
      checkoutDate: body.checkoutDate as any,
      totalAmountCents: body.totalAmountCents,
      currency: body.currency,
      status: body.status,
      channel: body.channel,
      createdBy: (req as any).auth?.userId,
    }).returning();
    if (!inserted[0]) return reply.code(500).send({ ok: false, error: "Failed to create reservation" });
    reply.send({ ok: true, data: inserted[0] });
  });

  // Detail
  app.get("/orgs/:orgId/reservations/:id", { preHandler: [requireSession(), requireOrg()] }, async (req, reply) => {
    const { orgId, id } = req.params as any;
    const row = (await db.select().from(reservations)
      .where(and(eq(reservations.orgId, orgId), eq(reservations.id, id)))
      .limit(1))[0];
    if (!row) return reply.code(404).send({ ok: false, error: "Not found" });
    reply.send({ ok: true, data: row });
  });

  // Update
  app.put("/orgs/:orgId/reservations/:id", { preHandler: [requireSession(), requireOrg(), requireRole("admin")] }, async (req, reply) => {
    const { orgId, id } = req.params as any;
    const body = ReservationUpdateSchema.parse(req.body);
    const updated = await db.update(reservations).set(body)
      .where(and(eq(reservations.orgId, orgId), eq(reservations.id, id)))
      .returning();
    if (!updated[0]) return reply.code(404).send({ ok: false, error: "Not found" });
    reply.send({ ok: true, data: updated[0] });
  });

  // Delete
  app.delete("/orgs/:orgId/reservations/:id", { preHandler: [requireSession(), requireOrg(), requireRole("owner")] }, async (req, reply) => {
    const { orgId, id } = req.params as any;
    const deleted = await db.delete(reservations)
      .where(and(eq(reservations.orgId, orgId), eq(reservations.id, id)))
      .returning();
    if (!deleted[0]) return reply.code(404).send({ ok: false, error: "Not found" });
    reply.send({ ok: true });
  });

  // Calendar (por propiedad) – formato básico
  app.get("/orgs/:orgId/properties/:propertyId/calendar", { preHandler: [requireSession(), requireOrg()] }, async (req, reply) => {
    const { orgId, propertyId } = req.params as any;
    const { from, to } = req.query as any;

    let where = and(eq(reservations.orgId, orgId), eq(reservations.propertyId, propertyId));
    if (from) where = and(where, gte(reservations.checkinDate, from));
    if (to) where = and(where, lte(reservations.checkoutDate, to));

    const rows = await db.select({
      id: reservations.id,
      propertyId: reservations.propertyId,
      title: reservations.guestName,
      start: reservations.checkinDate,
      end: reservations.checkoutDate,
      status: reservations.status,
      amountCents: reservations.totalAmountCents,
    }).from(reservations).where(where);

    reply.send({ ok: true, data: rows });
  });

  // Summary (dueño simple) – lista plana para la tabla
  app.get("/orgs/:orgId/owners/:userId/summary", { preHandler: [requireSession(), requireOrg()] }, async (req, reply) => {
    const { orgId, userId } = req.params as any;
    const { from, to, propertyId } = req.query as any;

    // Para simplificar, devolvemos todas las reservas del org (filtrables).
    // Si luego usas property_access por dueño, puedes join/filtrar allí.
    let where = and(eq(reservations.orgId, orgId));
    if (propertyId) where = and(where, eq(reservations.propertyId, propertyId));
    if (from) where = and(where, gte(reservations.checkinDate, from));
    if (to) where = and(where, lte(reservations.checkoutDate, to));

    const rows = await db
      .select({
        propertyName: properties.name,
        nights: (reservations.checkoutDate as any), // lo calculas en front (diff fechas) o luego con view
        checkinDate: reservations.checkinDate,
        checkoutDate: reservations.checkoutDate,
        totalAmountCents: reservations.totalAmountCents,
        status: reservations.status,
      })
      .from(reservations)
      .innerJoin(properties, eq(properties.id, reservations.propertyId))
      .where(where);

    reply.send({ ok: true, data: rows });
  });
};
