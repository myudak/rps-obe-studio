import { and, desc, eq, inArray, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { rpsSchema } from "../../src/schemas/rps-schema.ts"
import { validateRps } from "../../src/lib/validation.ts"
import { db } from "../db/client.ts"
import { approvals, classSections, courses, curriculumCourses, programs, rpsDocuments } from "../db/schema.ts"
import { accessibleProgramIds, assertClassAccess, getAccessContext, hasRole, HttpError, requireRole, type AccessContext } from "../lib/access.ts"
import { teachingAssignments, enrollments, students } from "../db/schema.ts"
import { writeAudit } from "../lib/audit.ts"
import { decideRps } from "../lib/workflow.ts"
import { isClassStaff, requireClassRole } from "../lib/class-scope.ts"

const idParams = z.object({ id: z.string().uuid() })
const createInput = z.object({ classId: z.string().uuid(), data: rpsSchema })
const revisionInput = z.object({ comment: z.string().trim().min(3).max(4_000) })

async function classProgram(classId: string) {
  const [row] = await db.select({ programId: programs.id })
    .from(classSections)
    .innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id))
    .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
    .innerJoin(programs, eq(courses.programId, programs.id))
    .where(eq(classSections.id, classId)).limit(1)
  if (!row) throw new HttpError(404, "Kelas tidak ditemukan.")
  return row.programId
}

async function assertProgramAccess(access: AccessContext, classId: string) {
  if (hasRole(access, ["SUPERADMIN"])) return
  const programId = await classProgram(classId)
  await assertClassAccess(access, classId, programId)
}

export async function registerRpsRoutes(app: FastifyInstance) {
  app.get("/api/rps", async (request) => {
    const access = await getAccessContext(request)
    const programIds = accessibleProgramIds(access)
    const rows = await db.select({ programId: courses.programId, id: rpsDocuments.id, classId: rpsDocuments.classId, title: rpsDocuments.title, version: rpsDocuments.version, status: rpsDocuments.status, updatedAt: rpsDocuments.updatedAt, classCode: classSections.code, courseName: courses.name })
      .from(rpsDocuments)
      .innerJoin(classSections, eq(rpsDocuments.classId, classSections.id))
      .innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id))
      .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
      .where(programIds ? inArray(courses.programId, programIds) : undefined)
      .orderBy(desc(rpsDocuments.updatedAt))
    if (hasRole(access, ["SUPERADMIN"])) return rows
    const [assigned, enrolled] = await Promise.all([
      db.select().from(teachingAssignments).where(eq(teachingAssignments.profileId, access.profile.id)),
      db.select({ classId: enrollments.classId }).from(enrollments).innerJoin(students, eq(enrollments.studentId, students.id)).where(eq(students.profileId, access.profile.id)),
    ])
    return rows.filter(row => access.roles.some(role => role.programId === row.programId && ["ADMIN_PRODI", "GPM", "KAPRODI"].includes(role.code)) || assigned.some(item => item.classId === row.classId) || (row.status === "verified" && enrolled.some(item => item.classId === row.classId)))
  })

  app.get("/api/rps/:id", async (request) => {
    const access = await getAccessContext(request)
    const { id } = idParams.parse(request.params)
    const [row] = await db.select().from(rpsDocuments).where(eq(rpsDocuments.id, id)).limit(1)
    if (!row) throw new HttpError(404, "RPS tidak ditemukan.")
    await assertProgramAccess(access, row.classId)
    const programId = await classProgram(row.classId)
    if (row.status !== "verified" && !await isClassStaff(access, row.classId, programId)) throw new HttpError(403, "RPS belum diverifikasi.")
    return row
  })

  app.post("/api/rps", async (request, reply) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const input = createInput.parse(request.body)
    await assertProgramAccess(access, input.classId)
    await requireClassRole(access, input.classId, await classProgram(input.classId), ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const [latest] = await db.select({ version: rpsDocuments.version }).from(rpsDocuments).where(eq(rpsDocuments.classId, input.classId)).orderBy(desc(rpsDocuments.version)).limit(1)
    const [created] = await db.insert(rpsDocuments).values({
      classId: input.classId,
      version: (latest?.version ?? 0) + 1,
      title: input.data.meta.courseName || "RPS tanpa judul",
      data: input.data,
      authorProfileId: access.profile.id,
    }).returning()
    if (!created) throw new Error("RPS gagal dibuat.")
    await writeAudit(db, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "RPS_CREATED", entityType: "rps", entityId: created.id, after: { status: created.status, version: created.version } })
    return reply.status(201).send(created)
  })

  app.put("/api/rps/:id", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const { id } = idParams.parse(request.params)
    const data = rpsSchema.parse(request.body)
    const [existing] = await db.select().from(rpsDocuments).where(eq(rpsDocuments.id, id)).limit(1)
    if (!existing) throw new HttpError(404, "RPS tidak ditemukan.")
    await assertProgramAccess(access, existing.classId)
    await requireClassRole(access, existing.classId, await classProgram(existing.classId), ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    if (!["draft", "needs_revision"].includes(existing.status)) throw new HttpError(409, "Hanya RPS Draft atau Need Revision yang dapat diedit.")
    const expected = request.headers["if-match"]
    if (typeof expected !== "string" || expected !== String(existing.revision)) throw new HttpError(409, "RPS berubah di sesi lain. Muat ulang sebelum melanjutkan.")
    const [updated] = await db.update(rpsDocuments).set({ data, title: data.meta.courseName || existing.title, revision: existing.revision + 1, updatedAt: new Date() }).where(and(eq(rpsDocuments.id, id), eq(rpsDocuments.revision, existing.revision), inArray(rpsDocuments.status, ["draft", "needs_revision"]))).returning()
    if (!updated) throw new HttpError(409, "RPS berubah. Muat ulang sebelum melanjutkan.")
    return updated
  })

  app.post("/api/rps/:id/submit", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const { id } = idParams.parse(request.params)
    const [existing] = await db.select().from(rpsDocuments).where(eq(rpsDocuments.id, id)).limit(1)
    if (!existing) throw new HttpError(404, "RPS tidak ditemukan.")
    await assertProgramAccess(access, existing.classId)
    await requireClassRole(access, existing.classId, await classProgram(existing.classId), ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    if (!["draft", "needs_revision"].includes(existing.status)) throw new HttpError(409, "RPS tidak berada pada status yang dapat diajukan.")
    const blockingIssues = validateRps(existing.data).filter((issue) => issue.level === "error")
    if (blockingIssues.length) throw new HttpError(422, `RPS belum lolos quality check: ${blockingIssues.map((issue) => issue.title).join(", ")}.`)
    return db.transaction(async (tx) => {
      const [updated] = await tx.update(rpsDocuments).set({ status: "submitted", submittedAt: new Date(), revision: sql`${rpsDocuments.revision} + 1`, updatedAt: new Date() }).where(and(eq(rpsDocuments.id, id), eq(rpsDocuments.revision, existing.revision), inArray(rpsDocuments.status, ["draft", "needs_revision"]))).returning()
      if (!updated) throw new HttpError(409, "Status RPS berubah. Muat ulang lalu coba lagi.")
      const [previous] = await tx.select().from(approvals).where(eq(approvals.rpsId, id)).orderBy(desc(approvals.round)).limit(1)
      await tx.insert(approvals).values({ rpsId: id, submittedByProfileId: access.profile.id, round: (previous?.round ?? 0) + 1, stage: "GPM" })
      await writeAudit(tx, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "RPS_SUBMITTED", entityType: "rps", entityId: id, before: { status: existing.status }, after: { status: "submitted" } })
      return updated
    })
  })

  app.post("/api/rps/:id/verify", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "KAPRODI", "GPM"])
    const { id } = idParams.parse(request.params)
    const [existing] = await db.select().from(rpsDocuments).where(eq(rpsDocuments.id, id)).limit(1)
    if (!existing) throw new HttpError(404, "RPS tidak ditemukan.")
    await assertProgramAccess(access, existing.classId)
    if (existing.status !== "submitted") throw new HttpError(409, "Hanya RPS Submitted yang dapat diverifikasi.")
    return decideRps(id, access, await classProgram(existing.classId), "approved")
  })

  app.post("/api/rps/:id/revision", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "KAPRODI", "GPM"])
    const { id } = idParams.parse(request.params)
    const { comment } = revisionInput.parse(request.body)
    const [existing] = await db.select().from(rpsDocuments).where(eq(rpsDocuments.id, id)).limit(1)
    if (!existing) throw new HttpError(404, "RPS tidak ditemukan.")
    await assertProgramAccess(access, existing.classId)
    if (existing.status !== "submitted") throw new HttpError(409, "Hanya RPS Submitted yang dapat dikembalikan untuk revisi.")
    return decideRps(id, access, await classProgram(existing.classId), "rejected", comment)
  })
}
