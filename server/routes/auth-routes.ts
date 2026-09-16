import type { FastifyInstance } from "fastify"
import { fromNodeHeaders } from "better-auth/node"

import { auth } from "../auth.ts"
import { db } from "../db/client.ts"
import { profiles, roles, userRoles } from "../db/schema.ts"
import { getAccessContext, HttpError, requireRole } from "../lib/access.ts"
import { writeAudit } from "../lib/audit.ts"
import { eq } from "drizzle-orm"

export async function registerAuthRoutes(app: FastifyInstance) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const isImpersonating = request.url.includes("/admin/impersonate-user")
      const isStopping = request.url.includes("/admin/stop-impersonating")
      const access = isImpersonating || isStopping ? await getAccessContext(request) : null
      let targetUserId = ""
      let reason = ""
      if (isImpersonating) {
        requireRole(access!, ["SUPERADMIN"])
        targetUserId = typeof request.body === "object" && request.body && "userId" in request.body ? String(request.body.userId) : ""
        reason = String(request.headers["x-impersonation-reason"] ?? "").trim()
        if (reason.length < 5) throw new HttpError(400, "Alasan impersonation minimal 5 karakter.")
        if (!targetUserId || targetUserId === access!.user.id) throw new HttpError(400, "Pilih akun lain untuk impersonation.")
        const targetRoles = await db.select({ code: roles.code }).from(profiles).innerJoin(userRoles, eq(userRoles.profileId, profiles.id)).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(profiles.userId, targetUserId))
        if (targetRoles.some(item => ["SUPERADMIN", "ADMIN_PRODI"].includes(item.code))) throw new HttpError(403, "Akun administrator tidak dapat di-impersonate.")
      }
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`)
      const authRequest = new Request(url, {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      })
      const response = await auth.handler(authRequest)
      if (response.ok && isImpersonating) {
        await writeAudit(db, { actorProfileId: access!.profile.id, action: "IMPERSONATION_STARTED", entityType: "user", entityId: targetUserId, after: { reason } })
      }
      if (response.ok && isStopping && access?.impersonation) {
        await writeAudit(db, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation.impersonatedByProfileId, action: "IMPERSONATION_STOPPED", entityType: "user", entityId: access.user.id })
      }
      reply.status(response.status)
      response.headers.forEach((value, key) => reply.header(key, value))
      return reply.send(response.body ? await response.text() : null)
    },
  })

  app.get("/api/me", async (request) => getAccessContext(request))
}
