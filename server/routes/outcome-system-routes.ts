import { and, asc, count, desc, eq, inArray, lt, ne } from "drizzle-orm"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"

import { db } from "../db/client.ts"
import {
  achievements, assessmentOutcomeMappings, calculationRuns, classSections, courseOutcomeMappings, courseOutcomes, courses,
  cqiFindings, curricula, curriculumCourses, curriculumOutcomes, curriculumProposals, periods, programs, rpsDocuments, subOutcomes,
} from "../db/schema.ts"
import { accessibleProgramIds, getAccessContext, hasRole, HttpError, requireRole, type AccessContext } from "../lib/access.ts"
import { writeAudit } from "../lib/audit.ts"

const uuid = z.string().uuid()
const outcomeInput = z.object({ code: z.string().trim().min(2).max(30), name: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).default(""), target: z.number().min(0).max(100).default(70), sortOrder: z.number().int().min(0).default(0), active: z.boolean().default(true) })
const courseOutcomeInput = z.object({ code: z.string().trim().min(2).max(30), description: z.string().trim().min(5).max(2000), descriptionEn: z.string().trim().max(2000).default(""), weight: z.number().min(0).max(100).default(0), target: z.number().min(0).max(100).default(70), sortOrder: z.number().int().min(0).default(0) })
const subOutcomeInput = z.object({ code: z.string().trim().min(2).max(40), description: z.string().trim().min(5).max(2000), weight: z.number().min(0).max(100).default(0), sortOrder: z.number().int().min(0).default(0) })

function assertProgram(access: AccessContext, programId: string, allowedRoles?: string[]) {
  if (hasRole(access, ["SUPERADMIN"])) return
  if (!accessibleProgramIds(access)?.includes(programId)) throw new HttpError(403, "Data berada di luar scope program Anda.")
  if (allowedRoles && !access.roles.some(role => role.programId === programId && allowedRoles.includes(role.code))) throw new HttpError(403, "Peran Anda tidak dapat mengubah outcome ini.")
}

async function curriculumContext(id: string) {
  const [row] = await db.select({ id: curricula.id, code: curricula.code, name: curricula.name, version: curricula.version, status: curricula.status, programId: programs.id, programName: programs.name }).from(curricula).innerJoin(programs, eq(programs.id, curricula.programId)).where(eq(curricula.id, id)).limit(1)
  if (!row) throw new HttpError(404, "Kurikulum tidak ditemukan.")
  return row
}

async function courseContext(id: string) {
  const [row] = await db.select({ id: curriculumCourses.id, courseId: courses.id, courseCode: courses.code, courseName: courses.name, credits: courses.credits, semester: curriculumCourses.semester, curriculumId: curricula.id, curriculumName: curricula.name, programId: programs.id, programName: programs.name }).from(curriculumCourses).innerJoin(courses, eq(courses.id, curriculumCourses.courseId)).innerJoin(curricula, eq(curricula.id, curriculumCourses.curriculumId)).innerJoin(programs, eq(programs.id, courses.programId)).where(eq(curriculumCourses.id, id)).limit(1)
  if (!row) throw new HttpError(404, "Mata kuliah kurikulum tidak ditemukan.")
  return row
}

async function mutableCourseOutcome(request: FastifyRequest, id: string) {
  const access = await getAccessContext(request)
  requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU"])
  const [row] = await db.select({ id: courseOutcomes.id, programId: courses.programId }).from(courseOutcomes).innerJoin(curriculumCourses, eq(curriculumCourses.id, courseOutcomes.curriculumCourseId)).innerJoin(courses, eq(courses.id, curriculumCourses.courseId)).where(eq(courseOutcomes.id, id)).limit(1)
  if (!row) throw new HttpError(404, "CPMK tidak ditemukan.")
  assertProgram(access, row.programId, ["ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU"])
  return { access, row }
}

export async function registerOutcomeSystemRoutes(app: FastifyInstance) {
  app.get("/api/curricula/:id/workspace", async request => {
    const access = await getAccessContext(request); const { id } = z.object({ id: uuid }).parse(request.params)
    const curriculum = await curriculumContext(id); assertProgram(access, curriculum.programId)
    const [cplRows, placementRows, mapRows, attainmentRows, proposalRows] = await Promise.all([
      db.select().from(curriculumOutcomes).where(eq(curriculumOutcomes.curriculumId, id)).orderBy(asc(curriculumOutcomes.sortOrder), asc(curriculumOutcomes.code)),
      db.select({ id: curriculumCourses.id, code: courses.code, name: courses.name, semester: curriculumCourses.semester, required: curriculumCourses.required }).from(curriculumCourses).innerJoin(courses, eq(courses.id, curriculumCourses.courseId)).where(eq(curriculumCourses.curriculumId, id)).orderBy(asc(curriculumCourses.semester), asc(courses.code)),
      db.select({ curriculumCourseId: courseOutcomes.curriculumCourseId, cpmkCode: courseOutcomes.code, cplId: curriculumOutcomes.id, cplCode: curriculumOutcomes.code, level: courseOutcomeMappings.level }).from(courseOutcomeMappings).innerJoin(courseOutcomes, eq(courseOutcomes.id, courseOutcomeMappings.courseOutcomeId)).innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, courseOutcomeMappings.curriculumOutcomeId)).where(eq(curriculumOutcomes.curriculumId, id)),
      db.select({ classId: classSections.id, className: classSections.name, courseId: curriculumCourses.id, code: achievements.outcomeCode, value: achievements.value, target: achievements.target, createdAt: calculationRuns.createdAt }).from(achievements).innerJoin(calculationRuns, eq(calculationRuns.id, achievements.runId)).innerJoin(classSections, eq(classSections.id, calculationRuns.classId)).innerJoin(curriculumCourses, eq(curriculumCourses.id, classSections.curriculumCourseId)).where(and(eq(curriculumCourses.curriculumId, id), eq(achievements.scope, "class-cpl"))).orderBy(desc(calculationRuns.createdAt)),
      db.select().from(curriculumProposals).innerJoin(curriculumCourses, eq(curriculumCourses.id, curriculumProposals.curriculumCourseId)).where(eq(curriculumCourses.curriculumId, id)).orderBy(desc(curriculumProposals.createdAt)),
    ])
    return { curriculum, outcomes: cplRows, courses: placementRows, mappings: mapRows, attainments: attainmentRows, proposals: proposalRows.map(row => row.curriculum_proposal) }
  })

  app.get("/api/course-workspaces/:id", async request => {
    const access = await getAccessContext(request); const { id } = z.object({ id: uuid }).parse(request.params)
    const course = await courseContext(id); assertProgram(access, course.programId)
    const [outcomes, subs, mappings, classes, rps, attainments, proposals, cqi] = await Promise.all([
      db.select().from(courseOutcomes).where(eq(courseOutcomes.curriculumCourseId, id)).orderBy(asc(courseOutcomes.sortOrder), asc(courseOutcomes.code)),
      db.select({ id: subOutcomes.id, courseOutcomeId: subOutcomes.courseOutcomeId, code: subOutcomes.code, description: subOutcomes.description, weight: subOutcomes.weight, sortOrder: subOutcomes.sortOrder }).from(subOutcomes).innerJoin(courseOutcomes, eq(courseOutcomes.id, subOutcomes.courseOutcomeId)).where(eq(courseOutcomes.curriculumCourseId, id)).orderBy(asc(subOutcomes.sortOrder)),
      db.select({ courseOutcomeId: courseOutcomeMappings.courseOutcomeId, curriculumOutcomeId: curriculumOutcomes.id, cplCode: curriculumOutcomes.code, cplName: curriculumOutcomes.name, level: courseOutcomeMappings.level, contribution: courseOutcomeMappings.contribution }).from(courseOutcomeMappings).innerJoin(curriculumOutcomes, eq(curriculumOutcomes.id, courseOutcomeMappings.curriculumOutcomeId)).innerJoin(courseOutcomes, eq(courseOutcomes.id, courseOutcomeMappings.courseOutcomeId)).where(eq(courseOutcomes.curriculumCourseId, id)),
      db.select({ id: classSections.id, code: classSections.code, name: classSections.name, status: classSections.status, periodName: periods.name }).from(classSections).innerJoin(periods, eq(periods.id, classSections.periodId)).where(eq(classSections.curriculumCourseId, id)).orderBy(desc(periods.startsOn)),
      db.select({ id: rpsDocuments.id, classId: rpsDocuments.classId, title: rpsDocuments.title, version: rpsDocuments.version, status: rpsDocuments.status, updatedAt: rpsDocuments.updatedAt }).from(rpsDocuments).innerJoin(classSections, eq(classSections.id, rpsDocuments.classId)).where(eq(classSections.curriculumCourseId, id)).orderBy(desc(rpsDocuments.updatedAt)),
      db.select({ classId: classSections.id, className: classSections.name, periodName: periods.name, scope: achievements.scope, code: achievements.outcomeCode, value: achievements.value, target: achievements.target, createdAt: calculationRuns.createdAt, parameters: calculationRuns.parameters }).from(achievements).innerJoin(calculationRuns, eq(calculationRuns.id, achievements.runId)).innerJoin(classSections, eq(classSections.id, calculationRuns.classId)).innerJoin(periods, eq(periods.id, classSections.periodId)).where(and(eq(classSections.curriculumCourseId, id), inArray(achievements.scope, ["class", "class-cpl"]))).orderBy(desc(calculationRuns.createdAt)),
      db.select().from(curriculumProposals).where(eq(curriculumProposals.curriculumCourseId, id)).orderBy(desc(curriculumProposals.createdAt)),
      db.select({ id: cqiFindings.id, classId: classSections.id, className: classSections.name, periodName: periods.name, outcomeCode: achievements.outcomeCode, value: achievements.value, target: achievements.target, title: cqiFindings.title, analysis: cqiFindings.analysis, actionPlan: cqiFindings.actionPlan, ownerProfileId: cqiFindings.ownerProfileId, status: cqiFindings.status, dueOn: cqiFindings.dueOn, updatedAt: cqiFindings.updatedAt }).from(cqiFindings).innerJoin(achievements, eq(achievements.id, cqiFindings.achievementId)).innerJoin(calculationRuns, eq(calculationRuns.id, achievements.runId)).innerJoin(classSections, eq(classSections.id, calculationRuns.classId)).innerJoin(periods, eq(periods.id, classSections.periodId)).where(eq(classSections.curriculumCourseId, id)).orderBy(desc(cqiFindings.updatedAt)),
    ])
    return { course, outcomes, subOutcomes: subs, mappings, classes, rps, attainments, proposals, cqi }
  })

  app.post("/api/curricula/:id/outcomes", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "KAPRODI", "GPM"])
    const { id } = z.object({ id: uuid }).parse(request.params); const context = await curriculumContext(id); assertProgram(access, context.programId, ["ADMIN_PRODI", "KAPRODI", "GPM"])
    const input = outcomeInput.parse(request.body); const [created] = await db.insert(curriculumOutcomes).values({ ...input, curriculumId: id, target: String(input.target) }).returning()
    await writeAudit(db, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "CPL_CREATED", entityType: "curriculum_outcome", entityId: created!.id, after: input })
    return reply.status(201).send(created)
  })

  app.patch("/api/curriculum-outcomes/:id", async request => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "KAPRODI", "GPM"])
    const { id } = z.object({ id: uuid }).parse(request.params); const [old] = await db.select({ outcome: curriculumOutcomes, programId: curricula.programId }).from(curriculumOutcomes).innerJoin(curricula, eq(curricula.id, curriculumOutcomes.curriculumId)).where(eq(curriculumOutcomes.id, id)).limit(1)
    if (!old) throw new HttpError(404, "CPL tidak ditemukan."); assertProgram(access, old.programId, ["ADMIN_PRODI", "KAPRODI", "GPM"])
    const input = outcomeInput.parse(request.body); const [updated] = await db.update(curriculumOutcomes).set({ ...input, target: String(input.target), updatedAt: new Date() }).where(eq(curriculumOutcomes.id, id)).returning(); return updated
  })

  app.post("/api/course-workspaces/:id/outcomes", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU"])
    const { id } = z.object({ id: uuid }).parse(request.params); const course = await courseContext(id); assertProgram(access, course.programId, ["ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU"])
    const input = courseOutcomeInput.parse(request.body); const [created] = await db.insert(courseOutcomes).values({ ...input, curriculumCourseId: id, weight: String(input.weight), target: String(input.target) }).returning(); return reply.status(201).send(created)
  })

  app.patch("/api/course-outcomes/:id", async request => {
    const { id } = z.object({ id: uuid }).parse(request.params); await mutableCourseOutcome(request, id); const input = courseOutcomeInput.parse(request.body)
    const [updated] = await db.update(courseOutcomes).set({ ...input, weight: String(input.weight), target: String(input.target), updatedAt: new Date() }).where(eq(courseOutcomes.id, id)).returning(); return updated
  })

  app.post("/api/course-outcomes/:id/sub-outcomes", async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); await mutableCourseOutcome(request, id); const input = subOutcomeInput.parse(request.body)
    const [created] = await db.insert(subOutcomes).values({ ...input, courseOutcomeId: id, weight: String(input.weight) }).returning(); return reply.status(201).send(created)
  })

  app.put("/api/course-outcomes/:id/mappings", async request => {
    const { id } = z.object({ id: uuid }).parse(request.params); const { access, row } = await mutableCourseOutcome(request, id)
    const input = z.object({ mappings: z.array(z.object({ curriculumOutcomeId: uuid, level: z.number().int().min(1).max(3), contribution: z.number().positive().max(100).default(1) })).max(30) }).parse(request.body)
    const valid = input.mappings.length ? await db.select({ id: curriculumOutcomes.id, programId: curricula.programId }).from(curriculumOutcomes).innerJoin(curricula, eq(curricula.id, curriculumOutcomes.curriculumId)).where(inArray(curriculumOutcomes.id, input.mappings.map(item => item.curriculumOutcomeId))) : []
    if (valid.length !== new Set(input.mappings.map(item => item.curriculumOutcomeId)).size || valid.some(item => item.programId !== row.programId)) throw new HttpError(400, "CPL mapping tidak valid.")
    await db.transaction(async tx => { await tx.delete(courseOutcomeMappings).where(eq(courseOutcomeMappings.courseOutcomeId, id)); if (input.mappings.length) await tx.insert(courseOutcomeMappings).values(input.mappings.map(item => ({ ...item, contribution: String(item.contribution), courseOutcomeId: id }))); await writeAudit(tx, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "CPMK_MAPPING_UPDATED", entityType: "course_outcome", entityId: id, after: { mappings: input.mappings } }) })
    return { ok: true }
  })

  app.post("/api/course-workspaces/:id/proposals", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU"])
    const { id } = z.object({ id: uuid }).parse(request.params); const course = await courseContext(id); assertProgram(access, course.programId)
    const input = z.object({ title: z.string().trim().min(5).max(180), rationale: z.string().trim().min(10).max(4000), changes: z.record(z.string(), z.unknown()).default({}) }).parse(request.body)
    const [[activeClasses], [rpsCount], [mappingCount]] = await Promise.all([db.select({ value: count() }).from(classSections).where(and(eq(classSections.curriculumCourseId, id), ne(classSections.status, "closed"))), db.select({ value: count() }).from(rpsDocuments).innerJoin(classSections, eq(classSections.id, rpsDocuments.classId)).where(eq(classSections.curriculumCourseId, id)), db.select({ value: count() }).from(assessmentOutcomeMappings).innerJoin(courseOutcomes, eq(courseOutcomes.id, assessmentOutcomeMappings.courseOutcomeId)).where(eq(courseOutcomes.curriculumCourseId, id))])
    const impact = { activeClasses: Number(activeClasses?.value ?? 0), rps: Number(rpsCount?.value ?? 0), assessmentMappings: Number(mappingCount?.value ?? 0) }
    const [created] = await db.insert(curriculumProposals).values({ curriculumCourseId: id, proposedByProfileId: access.profile.id, title: input.title, rationale: input.rationale, changes: input.changes, impact, status: "pending" }).returning()
    return reply.status(201).send(created)
  })

  app.post("/api/curriculum-proposals/:id/decision", async request => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "KAPRODI", "GPM"])
    const { id } = z.object({ id: uuid }).parse(request.params); const input = z.object({ decision: z.enum(["approved", "rejected", "implemented"]), comment: z.string().trim().min(5).max(2000) }).parse(request.body)
    const [proposal] = await db.select({ proposal: curriculumProposals, programId: courses.programId }).from(curriculumProposals).innerJoin(curriculumCourses, eq(curriculumCourses.id, curriculumProposals.curriculumCourseId)).innerJoin(courses, eq(courses.id, curriculumCourses.courseId)).where(eq(curriculumProposals.id, id)).limit(1)
    if (!proposal) throw new HttpError(404, "Proposal tidak ditemukan."); assertProgram(access, proposal.programId, ["KAPRODI", "GPM"])
    if (proposal.proposal.proposedByProfileId === access.profile.id) throw new HttpError(403, "Pengusul tidak dapat menyetujui proposalnya sendiri.")
    if (input.decision === "implemented" && proposal.proposal.status !== "approved") throw new HttpError(409, "Hanya proposal approved yang dapat ditandai implemented.")
    const [updated] = await db.update(curriculumProposals).set({ status: input.decision, decisionComment: input.comment, decidedByProfileId: access.profile.id, decidedAt: new Date(), updatedAt: new Date() }).where(and(eq(curriculumProposals.id, id), eq(curriculumProposals.status, proposal.proposal.status))).returning()
    if (!updated) throw new HttpError(409, "Proposal sudah diproses oleh pengguna lain."); return updated
  })

  app.post("/api/classes/:id/rps/carry-forward", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const { id } = z.object({ id: uuid }).parse(request.params)
    const [target] = await db.select({ classId: classSections.id, curriculumCourseId: classSections.curriculumCourseId, periodStart: periods.startsOn, programId: courses.programId }).from(classSections).innerJoin(periods, eq(periods.id, classSections.periodId)).innerJoin(curriculumCourses, eq(curriculumCourses.id, classSections.curriculumCourseId)).innerJoin(courses, eq(courses.id, curriculumCourses.courseId)).where(eq(classSections.id, id)).limit(1)
    if (!target) throw new HttpError(404, "Kelas tidak ditemukan."); assertProgram(access, target.programId)
    const [source] = await db.select({ rps: rpsDocuments }).from(rpsDocuments).innerJoin(classSections, eq(classSections.id, rpsDocuments.classId)).innerJoin(periods, eq(periods.id, classSections.periodId)).where(and(eq(classSections.curriculumCourseId, target.curriculumCourseId), lt(periods.startsOn, target.periodStart), eq(rpsDocuments.status, "verified"))).orderBy(desc(periods.startsOn), desc(rpsDocuments.version)).limit(1)
    if (!source) throw new HttpError(409, "Belum ada RPS verified dari periode sebelumnya.")
    const [latest] = await db.select({ version: rpsDocuments.version }).from(rpsDocuments).where(eq(rpsDocuments.classId, id)).orderBy(desc(rpsDocuments.version)).limit(1)
    const data = structuredClone(source.rps.data); data.updatedAt = new Date().toISOString(); data.validation = { ...data.validation, date: "" }
    const [created] = await db.insert(rpsDocuments).values({ classId: id, version: (latest?.version ?? 0) + 1, title: source.rps.title, data, authorProfileId: access.profile.id }).returning()
    await writeAudit(db, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "RPS_CARRIED_FORWARD", entityType: "rps", entityId: created!.id, after: { sourceRpsId: source.rps.id } })
    return reply.status(201).send(created)
  })
}
