import { asc, count, countDistinct, eq, inArray } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { db } from "../db/client.ts"
import {
  achievements,
  calculationRuns,
  classSections,
  cohorts,
  courses,
  curricula,
  curriculumCourses,
  enrollments,
  periods,
  programs,
  rpsDocuments,
  students,
  teachingAssignments,
  user,
  userRoles,
} from "../db/schema.ts"
import { env } from "../env.ts"
import { accessibleProgramIds, getAccessContext, hasRole, HttpError, requireRole, type AccessContext } from "../lib/access.ts"

const programInput = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(3), faculty: z.string().trim().min(3) })
const periodInput = z.object({ code: z.string().trim().min(3), name: z.string().trim().min(3), startsOn: z.string().date(), endsOn: z.string().date() })
const curriculumInput = z.object({ programId: z.string().uuid(), code: z.string().trim().min(2), name: z.string().trim().min(3), version: z.number().int().positive().default(1) })
const cohortInput = z.object({ programId: z.string().uuid(), curriculumId: z.string().uuid(), entryYear: z.number().int().min(2000).max(2200), name: z.string().trim().min(3) })
const courseInput = z.object({ programId: z.string().uuid(), curriculumId: z.string().uuid(), code: z.string().trim().min(2), name: z.string().trim().min(3), nameEn: z.string().trim().default(""), credits: z.number().int().min(1).max(12), semester: z.number().int().min(1).max(14) })
const classInput = z.object({ curriculumCourseId: z.string().uuid(), cohortId: z.string().uuid(), periodId: z.string().uuid(), code: z.string().trim().min(2), name: z.string().trim().min(3), capacity: z.number().int().min(1).max(1000).default(40) })

const adminRoles = ["SUPERADMIN", "ADMIN_PRODI"]

function assertAdminProgram(access: AccessContext, programId: string) {
  if (hasRole(access, ["SUPERADMIN"])) return
  if (!accessibleProgramIds(access)?.includes(programId)) throw new HttpError(403, "Program studi berada di luar scope Anda.")
}

async function curriculumProgram(curriculumId: string) {
  const [row] = await db.select({ programId: curricula.programId }).from(curricula).where(eq(curricula.id, curriculumId)).limit(1)
  if (!row) throw new HttpError(404, "Kurikulum tidak ditemukan.")
  return row.programId
}

export async function registerPlatformRoutes(app: FastifyInstance) {
  app.patch("/api/admin/:entity/:id", async request => {
    const access = await getAccessContext(request); requireRole(access, adminRoles)
    const { entity, id } = z.object({ entity: z.enum(["programs", "periods", "curricula", "cohorts", "courses"]), id: z.string().uuid() }).parse(request.params)
    const named = z.object({ name: z.string().trim().min(3) })
    if (entity === "programs") {
      requireRole(access, ["SUPERADMIN"])
      const input = programInput.parse(request.body)
      const [row] = await db.update(programs).set({ ...input, updatedAt: new Date() }).where(eq(programs.id, id)).returning(); if (!row) throw new HttpError(404, "Program tidak ditemukan."); return row
    }
    if (entity === "periods") {
      requireRole(access, ["SUPERADMIN"])
      const input = periodInput.refine(value => value.endsOn >= value.startsOn, "Tanggal tidak valid.").parse(request.body)
      const [row] = await db.update(periods).set({ ...input, updatedAt: new Date() }).where(eq(periods.id, id)).returning(); if (!row) throw new HttpError(404, "Periode tidak ditemukan."); return row
    }
    if (entity === "curricula") {
      const [old] = await db.select().from(curricula).where(eq(curricula.id, id)); if (!old) throw new HttpError(404, "Kurikulum tidak ditemukan."); assertAdminProgram(access, old.programId)
      const input = named.extend({ code: z.string().min(2), status: z.enum(["draft", "active", "archived"]) }).parse(request.body)
      const [row] = await db.update(curricula).set({ ...input, updatedAt: new Date() }).where(eq(curricula.id, id)).returning(); return row
    }
    if (entity === "cohorts") {
      const [old] = await db.select().from(cohorts).where(eq(cohorts.id, id)); if (!old) throw new HttpError(404, "Angkatan tidak ditemukan."); assertAdminProgram(access, old.programId)
      const input = named.extend({ status: z.enum(["active", "inactive"]) }).parse(request.body)
      const [row] = await db.update(cohorts).set({ ...input, updatedAt: new Date() }).where(eq(cohorts.id, id)).returning(); return row
    }
    const [old] = await db.select().from(courses).where(eq(courses.id, id)); if (!old) throw new HttpError(404, "Mata kuliah tidak ditemukan."); assertAdminProgram(access, old.programId)
    const input = named.extend({ code: z.string().min(2), nameEn: z.string(), credits: z.number().int().min(1).max(12) }).parse(request.body)
    const [row] = await db.update(courses).set({ ...input, updatedAt: new Date() }).where(eq(courses.id, id)).returning(); return row
  })
  app.get("/api/platform", async (request) => {
    const access = await getAccessContext(request)
    const programIds = accessibleProgramIds(access)
    const programFilter = programIds ? inArray(programs.id, programIds) : undefined

    const [programRows, periodRows, curriculumRows, cohortRows, courseRows, curriculumCourseRows, classRows, rpsRows, totals] = await Promise.all([
      db.select().from(programs).where(programFilter).orderBy(asc(programs.code)),
      db.select().from(periods).orderBy(asc(periods.startsOn)),
      db.select({ id: curricula.id, programId: curricula.programId, code: curricula.code, name: curricula.name, version: curricula.version, status: curricula.status, programName: programs.name })
        .from(curricula).innerJoin(programs, eq(curricula.programId, programs.id)).where(programFilter).orderBy(asc(curricula.code)),
      db.select({ id: cohorts.id, programId: cohorts.programId, curriculumId: cohorts.curriculumId, entryYear: cohorts.entryYear, name: cohorts.name, status: cohorts.status, programName: programs.name, curriculumName: curricula.name })
        .from(cohorts).innerJoin(programs, eq(cohorts.programId, programs.id)).innerJoin(curricula, eq(cohorts.curriculumId, curricula.id)).where(programFilter).orderBy(asc(cohorts.entryYear)),
      db.select({ id: courses.id, programId: courses.programId, code: courses.code, name: courses.name, nameEn: courses.nameEn, credits: courses.credits, programName: programs.name })
        .from(courses).innerJoin(programs, eq(courses.programId, programs.id)).where(programFilter).orderBy(asc(courses.code)),
      db.select({ id: curriculumCourses.id, curriculumId: curriculumCourses.curriculumId, courseId: curriculumCourses.courseId, semester: curriculumCourses.semester, required: curriculumCourses.required, courseCode: courses.code, courseName: courses.name, curriculumName: curricula.name, programId: programs.id })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .innerJoin(curricula, eq(curriculumCourses.curriculumId, curricula.id))
        .innerJoin(programs, eq(courses.programId, programs.id))
        .where(programFilter).orderBy(asc(curriculumCourses.semester), asc(courses.code)),
      db.select({ id: classSections.id, code: classSections.code, name: classSections.name, status: classSections.status, capacity: classSections.capacity, cohortId: classSections.cohortId, periodId: classSections.periodId, curriculumCourseId: classSections.curriculumCourseId, courseName: courses.name, courseCode: courses.code, cohortName: cohorts.name, periodName: periods.name, programId: programs.id })
        .from(classSections)
        .innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id))
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .innerJoin(programs, eq(courses.programId, programs.id))
        .innerJoin(cohorts, eq(classSections.cohortId, cohorts.id))
        .innerJoin(periods, eq(classSections.periodId, periods.id))
        .where(programFilter).orderBy(asc(classSections.code)),
      db.select({ id: rpsDocuments.id, classId: rpsDocuments.classId, title: rpsDocuments.title, version: rpsDocuments.version, status: rpsDocuments.status, updatedAt: rpsDocuments.updatedAt })
        .from(rpsDocuments)
        .innerJoin(classSections, eq(rpsDocuments.classId, classSections.id))
        .innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id))
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .innerJoin(programs, eq(courses.programId, programs.id))
        .where(programFilter).orderBy(asc(rpsDocuments.title)),
      Promise.all([
        programIds
          ? db.select({ value: countDistinct(userRoles.profileId) }).from(userRoles).where(inArray(userRoles.programId, programIds))
          : db.select({ value: count() }).from(user),
        db.select({ value: count() }).from(students).innerJoin(cohorts, eq(students.cohortId, cohorts.id)).innerJoin(programs, eq(cohorts.programId, programs.id)).where(programFilter),
        db.select({ value: count() }).from(rpsDocuments)
          .innerJoin(classSections, eq(rpsDocuments.classId, classSections.id))
          .innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id))
          .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
          .innerJoin(programs, eq(courses.programId, programs.id)).where(programFilter),
        db.select({ value: count() }).from(achievements)
          .innerJoin(calculationRuns, eq(achievements.runId, calculationRuns.id))
          .innerJoin(classSections, eq(calculationRuns.classId, classSections.id))
          .innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id))
          .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
          .innerJoin(programs, eq(courses.programId, programs.id)).where(programFilter),
      ]),
    ])

    let visibleClassIds: Set<string> | null = null
    const writableClassIds = new Set<string>()
    if (!hasRole(access, ["SUPERADMIN"])) {
      const scopedIds = new Set<string>()
      for (const row of classRows) if (access.roles.some(role => role.programId === row.programId && ["ADMIN_PRODI", "KAPRODI", "GPM"].includes(role.code))) { scopedIds.add(row.id); writableClassIds.add(row.id) }
      if (hasRole(access, ["DOSEN_PENGAMPU"])) {
        const rows = await db.select({ classId: teachingAssignments.classId }).from(teachingAssignments).where(eq(teachingAssignments.profileId, access.profile.id))
        rows.forEach((row) => { scopedIds.add(row.classId); writableClassIds.add(row.classId) })
      }
      if (hasRole(access, ["MAHASISWA"])) {
        const rows = await db.select({ classId: classSections.id }).from(classSections).innerJoin(enrollments, eq(classSections.id, enrollments.classId)).innerJoin(students, eq(enrollments.studentId, students.id)).where(eq(students.profileId, access.profile.id))
        rows.forEach((row) => scopedIds.add(row.classId))
      }
      visibleClassIds = scopedIds
    }

    return {
      access,
      ai: { configured: Boolean(env.openRouterApiKey), model: env.openRouterModel },
      programs: programRows,
      periods: periodRows,
      curricula: curriculumRows,
      cohorts: cohortRows,
      courses: courseRows,
      curriculumCourses: curriculumCourseRows,
      classes: visibleClassIds ? classRows.filter((row) => visibleClassIds.has(row.id)) : classRows,
      rps: visibleClassIds ? rpsRows.filter((row) => visibleClassIds.has(row.classId) && (writableClassIds.has(row.classId) || row.status === "verified")) : rpsRows,
      totals: { users: totals[0][0]?.value ?? 0, students: totals[1][0]?.value ?? 0, rps: totals[2][0]?.value ?? 0, achievements: totals[3][0]?.value ?? 0 },
    }
  })

  app.post("/api/admin/programs", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN"])
    const input = programInput.parse(request.body)
    const [created] = await db.insert(programs).values(input).returning()
    return reply.status(201).send(created)
  })

  app.post("/api/admin/periods", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN"])
    const input = periodInput.refine((value) => value.endsOn >= value.startsOn, "Tanggal selesai harus setelah tanggal mulai.").parse(request.body)
    const [created] = await db.insert(periods).values(input).returning()
    return reply.status(201).send(created)
  })

  app.post("/api/admin/curricula", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, adminRoles)
    const input = curriculumInput.parse(request.body)
    assertAdminProgram(access, input.programId)
    const [created] = await db.insert(curricula).values(input).returning()
    return reply.status(201).send(created)
  })

  app.post("/api/admin/cohorts", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, adminRoles)
    const input = cohortInput.parse(request.body)
    assertAdminProgram(access, input.programId)
    if (await curriculumProgram(input.curriculumId) !== input.programId) throw new HttpError(400, "Kurikulum dan angkatan harus berada pada program studi yang sama.")
    const [created] = await db.insert(cohorts).values(input).returning()
    return reply.status(201).send(created)
  })

  app.post("/api/admin/courses", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, adminRoles)
    const input = courseInput.parse(request.body)
    assertAdminProgram(access, input.programId)
    if (await curriculumProgram(input.curriculumId) !== input.programId) throw new HttpError(400, "Kurikulum dan mata kuliah harus berada pada program studi yang sama.")
    const created = await db.transaction(async (tx) => {
      const [course] = await tx.insert(courses).values({ programId: input.programId, code: input.code, name: input.name, nameEn: input.nameEn, credits: input.credits }).returning()
      if (!course) throw new Error("Mata kuliah gagal dibuat.")
      const [placement] = await tx.insert(curriculumCourses).values({ curriculumId: input.curriculumId, courseId: course.id, semester: input.semester }).returning()
      return { ...course, curriculumCourseId: placement?.id }
    })
    return reply.status(201).send(created)
  })

  app.post("/api/admin/classes", async (request, reply) => {
    const access = await getAccessContext(request); requireRole(access, adminRoles)
    const input = classInput.parse(request.body)
    const [placement] = await db.select({ programId: courses.programId, curriculumId: curriculumCourses.curriculumId }).from(curriculumCourses).innerJoin(courses, eq(curriculumCourses.courseId, courses.id)).where(eq(curriculumCourses.id, input.curriculumCourseId)).limit(1)
    const [cohort] = await db.select({ programId: cohorts.programId, curriculumId: cohorts.curriculumId }).from(cohorts).where(eq(cohorts.id, input.cohortId)).limit(1)
    if (!placement || !cohort) throw new HttpError(404, "Mata kuliah kurikulum atau angkatan tidak ditemukan.")
    assertAdminProgram(access, placement.programId)
    if (placement.programId !== cohort.programId) throw new HttpError(400, "Kelas, mata kuliah, dan angkatan harus berada pada program studi yang sama.")
    if (placement.curriculumId !== cohort.curriculumId) throw new HttpError(400, "Kurikulum mata kuliah dan angkatan harus sama.")
    const [created] = await db.insert(classSections).values(input).returning()
    return reply.status(201).send(created)
  })
}
