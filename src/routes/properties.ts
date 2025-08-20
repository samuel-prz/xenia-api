import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/index.js";
import { properties } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { PropertyCreateSchema, PropertyUpdateSchema } from "../schemas/properties.js";
import { requireSession, requireOrg, requireRole } from "../middleware/auth.js";

export const propertyRoutes: FastifyPluginAsync = async (app) => {
  // List
  app.get("/orgs/:orgId/properties", { preHandler: [requireSession(), requireOrg()] }, async (req, reply) => {
    const { orgId } = req.params as any;
    const rows = await db.select().from(properties).where(eq(properties.orgId, orgId));
    reply.send({ ok: true, data: rows });
  });

  // Create
  app.post("/orgs/:orgId/properties", { preHandler: [requireSession(), requireOrg(), requireRole("admin")] }, async (req, reply) => {
    const { orgId } = req.params as any;
    const body = PropertyCreateSchema.parse(req.body);
    const inserted = await db.insert(properties).values({
      orgId,
      name: body.name,
      ownerId: body.ownerId ?? null,
      code: body.code,
      isActive: body.isActive ?? true,
    }).returning();
    if (!inserted[0]) return reply.code(500).send({ ok: false, error: "Failed to create property" });
    reply.send({ ok: true, data: inserted[0] });
  });

  // Detail
  app.get("/orgs/:orgId/properties/:propertyId", { preHandler: [requireSession(), requireOrg()] }, async (req, reply) => {
    const { orgId, propertyId } = req.params as any;
    const row = (await db.select().from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.id, propertyId)))
      .limit(1))[0];
    if (!row) return reply.code(404).send({ ok: false, error: "Not found" });
    reply.send({ ok: true, data: row });
  });

  // Update
  app.put("/orgs/:orgId/properties/:propertyId", { preHandler: [requireSession(), requireOrg(), requireRole("admin")] }, async (req, reply) => {
    const { orgId, propertyId } = req.params as any;
    const body = PropertyUpdateSchema.parse(req.body);
    const updated = await db.update(properties).set(body)
      .where(and(eq(properties.orgId, orgId), eq(properties.id, propertyId)))
      .returning();
    if (!updated[0]) return reply.code(404).send({ ok: false, error: "Not found" });
    reply.send({ ok: true, data: updated[0] });
  });

  // Delete (soft delete)
  app.delete("/orgs/:orgId/properties/:propertyId", { preHandler: [requireSession(), requireOrg(), requireRole("admin")] }, async (req, reply) => {
    const { orgId, propertyId } = req.params as any;
    const deleted = await db.update(properties)
      .set({ isActive: false }) // Soft delete by setting isActive to false
      .where(and(eq(properties.orgId, orgId), eq(properties.id, propertyId)))
      .returning();

  // app.delete("/orgs/:orgId/properties/:propertyId", { preHandler: [requireSession(), requireOrg(), requireRole("owner")] }, async (req, reply) => {
  //   const { orgId, propertyId } = req.params as any;
  //   const deleted = await db.delete(properties)
  //     .where(and(eq(properties.orgId, orgId), eq(properties.id, propertyId)))
  //     .returning();

    if (!deleted[0]) return reply.code(404).send({ ok: false, error: "Not found" });
    reply.send({ ok: true });
  });
};
