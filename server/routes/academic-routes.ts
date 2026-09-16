import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { and, desc, eq, inArray } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { db } from "../db/client.ts"
import { achievements, approvals, calculationRuns, classSections, courses, cqiAttachments, cqiFindings, cqiHistory, curriculumCourses, enrollments, profiles, roles, rpsDocuments, students, teachingAssignments, user, userRoles } from "../db/schema.ts"
import { accessibleProgramIds, getAccessContext, hasRole, HttpError, requireRole, type AccessContext } from "../lib/access.ts"
import { classScope, isClassStaff, requireProgramRole } from "../lib/class-scope.ts"
import { writeAudit } from "../lib/audit.ts"

const params = z.object({ id: z.string().uuid() })
const storage = resolve(".data/cqi-evidence")
async function staff(programId: string) {
  return db.selectDistinct({ id: profiles.id, name: user.name, role: roles.code }).from(profiles).innerJoin(user, eq(profiles.userId, user.id)).innerJoin(userRoles, eq(userRoles.profileId, profiles.id)).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(and(eq(userRoles.programId, programId), eq(profiles.status, "active"), inArray(roles.code, ["DOSEN_PENGAMPU", "GPM", "KAPRODI", "ADMIN_PRODI"])))
}
async function findingScope(id: string, access: AccessContext) {
  requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU", "GPM", "KAPRODI"])
  const [row] = await db.select({ finding: cqiFindings, classId: calculationRuns.classId }).from(cqiFindings).innerJoin(achievements, eq(cqiFindings.achievementId, achievements.id)).innerJoin(calculationRuns, eq(achievements.runId, calculationRuns.id)).where(eq(cqiFindings.id, id))
  if (!row) throw new HttpError(404, "Temuan tidak ditemukan.")
  const scope = await classScope(row.classId, access)
  if (!await isClassStaff(access, row.classId, scope.programId)) throw new HttpError(403, "Temuan hanya dapat diakses pengelola kelas.")
  return { ...row, ...scope }
}
export async function registerAcademicRoutes(app: FastifyInstance) {
  app.get("/api/classes/:id", async request => {
    const access = await getAccessContext(request); const { id } = params.parse(request.params)
    const scope = await classScope(id, access)
    const isStudent = !await isClassStaff(access, id, scope.programId)
    const [roster, teachers, candidates] = await Promise.all([
      db.select({ id: enrollments.id, studentId: students.id, nim: students.nim, name: students.name }).from(enrollments).innerJoin(students, eq(enrollments.studentId, students.id)).where(and(eq(enrollments.classId, id), isStudent ? eq(students.profileId, access.profile.id) : undefined)),
      db.select({ id: teachingAssignments.id, profileId: profiles.id, name: user.name }).from(teachingAssignments).innerJoin(profiles, eq(teachingAssignments.profileId, profiles.id)).innerJoin(user, eq(profiles.userId, user.id)).where(eq(teachingAssignments.classId, id)),
      isStudent ? Promise.resolve([]) : staff(scope.programId),
    ])
    return { ...scope.section, roster, teachers, candidates }
  })
  app.patch("/api/classes/:id", async request => {
    const access = await getAccessContext(request); const { id } = params.parse(request.params)
    const scope = await classScope(id, access); requireProgramRole(access, scope.programId, ["ADMIN_PRODI"])
    const input = z.object({ name: z.string().trim().min(3), code: z.string().trim().min(2), capacity: z.number().int().min(1).max(1000), status: z.enum(["planned", "active", "closed"]) }).parse(request.body)
    return db.transaction(async tx => {
      await tx.select().from(classSections).where(eq(classSections.id, id)).for("update")
      const roster = await tx.select().from(enrollments).where(eq(enrollments.classId, id))
      if (input.capacity < roster.length) throw new HttpError(409, "Kapasitas lebih kecil dari jumlah peserta.")
      const [updated] = await tx.update(classSections).set({ ...input, updatedAt: new Date() }).where(eq(classSections.id, id)).returning()
      await writeAudit(tx, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "CLASS_UPDATED", entityType: "class", entityId: id, after: input }); return updated
    })
  })
  app.post("/api/classes/:id/teachers", async request => {
    const access = await getAccessContext(request); const { id } = params.parse(request.params)
    const scope = await classScope(id, access); requireProgramRole(access, scope.programId, ["ADMIN_PRODI"])
    const { profileId } = z.object({ profileId: z.string().uuid() }).parse(request.body)
    if (!(await staff(scope.programId)).some(item => item.id === profileId && item.role === "DOSEN_PENGAMPU")) throw new HttpError(400, "Pilih dosen aktif dari program yang sama.")
    const [row] = await db.insert(teachingAssignments).values({ classId: id, profileId }).onConflictDoNothing().returning()
    if (!row) throw new HttpError(409, "Dosen sudah ditugaskan.")
    return row
  })
  app.delete("/api/classes/:id/teachers/:profileId", async request => {
    const access = await getAccessContext(request); const { id, profileId } = params.extend({ profileId: z.string().uuid() }).parse(request.params)
    const scope = await classScope(id, access); requireProgramRole(access, scope.programId, ["ADMIN_PRODI"])
    await db.delete(teachingAssignments).where(and(eq(teachingAssignments.classId, id), eq(teachingAssignments.profileId, profileId)))
    return { ok: true }
  })
  app.get("/api/approvals", async request => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "GPM", "KAPRODI", "DOSEN_PENGAMPU"])
    const ids = accessibleProgramIds(access)
    const rows = await db.select({ approval: approvals, title: rpsDocuments.title, version: rpsDocuments.version, classId: rpsDocuments.classId, programId: courses.programId, periodId: classSections.periodId, authorProfileId: rpsDocuments.authorProfileId }).from(approvals).innerJoin(rpsDocuments, eq(approvals.rpsId, rpsDocuments.id)).innerJoin(classSections, eq(rpsDocuments.classId, classSections.id)).innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id)).innerJoin(courses, eq(curriculumCourses.courseId, courses.id)).where(ids ? inArray(courses.programId, ids) : undefined).orderBy(desc(approvals.createdAt))
    if (hasRole(access, ["SUPERADMIN"])) return rows
    const assigned = await db.select().from(teachingAssignments).where(eq(teachingAssignments.profileId, access.profile.id))
    return rows.filter(row => access.roles.some(role => role.programId === row.programId && ["ADMIN_PRODI", "GPM", "KAPRODI"].includes(role.code)) || assigned.some(item => item.classId === row.classId))
  })
  app.get("/api/cqi", async request => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "GPM", "KAPRODI", "DOSEN_PENGAMPU"])
    const ids = accessibleProgramIds(access)
    const rows = await db.select({ finding: cqiFindings, outcomeCode: achievements.outcomeCode, value: achievements.value, target: achievements.target, classId: calculationRuns.classId, className: classSections.name, programId: courses.programId, periodId: classSections.periodId }).from(cqiFindings).innerJoin(achievements, eq(cqiFindings.achievementId, achievements.id)).innerJoin(calculationRuns, eq(achievements.runId, calculationRuns.id)).innerJoin(classSections, eq(calculationRuns.classId, classSections.id)).innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id)).innerJoin(courses, eq(curriculumCourses.courseId, courses.id)).where(ids ? inArray(courses.programId, ids) : undefined).orderBy(desc(cqiFindings.createdAt))
    if (hasRole(access, ["SUPERADMIN"])) return rows
    const assigned = await db.select().from(teachingAssignments).where(eq(teachingAssignments.profileId, access.profile.id))
    return rows.filter(row => access.roles.some(role => role.programId === row.programId && ["ADMIN_PRODI", "GPM", "KAPRODI"].includes(role.code)) || assigned.some(item => item.classId === row.classId))
  })
  app.get("/api/cqi/:id", async request => {
    const access = await getAccessContext(request); const { id } = params.parse(request.params); const scope = await findingScope(id, access)
    const [history, attachments, candidates] = await Promise.all([
      db.select().from(cqiHistory).where(eq(cqiHistory.cqiId, id)).orderBy(desc(cqiHistory.createdAt)),
      db.select().from(cqiAttachments).where(eq(cqiAttachments.cqiId, id)), staff(scope.programId),
    ])
    return { ...scope.finding, history, attachments, candidates }
  })
  app.patch("/api/cqi/:id", async request => {
    const access = await getAccessContext(request); const { id } = params.parse(request.params); const scope = await findingScope(id, access)
    const input = z.object({ analysis: z.string().trim().min(3).max(10000), actionPlan: z.string().trim().max(10000), ownerProfileId: z.string().uuid(), dueOn: z.string().date().nullable(), status: z.enum(["open", "in_progress", "pending_review", "closed"]), comment: z.string().trim().max(4000).default("") }).parse(request.body)
    const reviewer = access.roles.some(role => role.code === "SUPERADMIN" || (role.programId === scope.programId && ["GPM", "KAPRODI"].includes(role.code)))
    if (!reviewer && scope.finding.ownerProfileId !== access.profile.id) throw new HttpError(403, "Hanya penanggung jawab atau reviewer dapat memperbarui temuan.")
    if (!(await staff(scope.programId)).some(item => item.id === input.ownerProfileId) && input.ownerProfileId !== scope.finding.ownerProfileId) throw new HttpError(400, "Penanggung jawab di luar program.")
    return db.transaction(async tx => {
      const [current] = await tx.select().from(cqiFindings).where(eq(cqiFindings.id, id)).for("update")
      if (!current || current.updatedAt.toISOString() !== scope.finding.updatedAt.toISOString()) throw new HttpError(409, "Temuan berubah. Muat ulang.")
      if (current.status === "closed") throw new HttpError(409, "Temuan sudah ditutup.")
      if (input.status !== current.status) {
        const allowed: Record<string, string[]> = { open: ["in_progress"], in_progress: ["pending_review"], pending_review: ["closed", "in_progress"] }
        if (!allowed[current.status]?.includes(input.status)) throw new HttpError(409, "Transisi status tidak valid.")
        if (current.status === "pending_review" && (!reviewer || input.comment.length < 3)) throw new HttpError(403, "Keputusan reviewer membutuhkan komentar.")
      }
      if (input.status === "pending_review" && (!input.actionPlan || !input.dueOn)) throw new HttpError(400, "Isi rencana aksi dan tenggat sebelum review.")
      const { comment, ...values } = input
      const [updated] = await tx.update(cqiFindings).set({ ...values, updatedAt: new Date(), closedAt: input.status === "closed" ? new Date() : null }).where(eq(cqiFindings.id, id)).returning()
      await tx.insert(cqiHistory).values({ cqiId: id, actorProfileId: access.profile.id, status: input.status, comment })
      await writeAudit(tx, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "CQI_UPDATED", entityType: "cqi", entityId: id, after: input }); return updated
    })
  })
  app.post("/api/cqi/:id/attachments", async request => {
    const access = await getAccessContext(request); const { id } = params.parse(request.params); const scope = await findingScope(id, access)
    if (scope.finding.status === "closed") throw new HttpError(409, "Temuan sudah ditutup.")
    if (scope.finding.ownerProfileId !== access.profile.id) requireProgramRole(access, scope.programId, ["GPM", "KAPRODI"])
    const file = await request.file(); if (!file) throw new HttpError(400, "Pilih berkas bukti.")
    const buffer = await file.toBuffer()
    const mime = buffer.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? "image/jpeg" : null
    if (!mime || buffer.length > 10 * 1024 * 1024) throw new HttpError(400, "Bukti harus PDF, PNG, atau JPEG maksimal 10 MB.")
    const attachmentId = randomUUID(); await mkdir(storage, { recursive: true })
    await writeFile(join(storage, attachmentId), buffer, { flag: "wx" })
    const [row] = await db.insert(cqiAttachments).values({ id: attachmentId, cqiId: id, uploadedByProfileId: access.profile.id, name: file.filename.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 180), mime, size: buffer.length }).returning()
    return row
  })
  app.get("/api/attachments/:id", async (request, reply) => {
    const access = await getAccessContext(request); const { id } = params.parse(request.params)
    const [row] = await db.select().from(cqiAttachments).where(eq(cqiAttachments.id, id))
    if (!row) throw new HttpError(404, "Bukti tidak ditemukan.")
    await findingScope(row.cqiId, access)
    reply.header("Content-Type", row.mime).header("X-Content-Type-Options", "nosniff").header("Cache-Control", "private, no-store").header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`)
    return reply.send(await readFile(join(storage, row.id)))
  })
}
