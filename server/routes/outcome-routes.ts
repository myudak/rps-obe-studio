import { and, desc, eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { db } from "../db/client.ts"
import { achievements, assessments, calculationRuns, classSections, courses, cqiFindings, curriculumCourses, enrollments, rpsDocuments, scores, students } from "../db/schema.ts"
import { assertClassAccess, getAccessContext, HttpError, requireRole } from "../lib/access.ts"
import { writeAudit } from "../lib/audit.ts"
import { isClassStaff, requireClassRole } from "../lib/class-scope.ts"

const classParams = z.object({ id: z.string().uuid() })
const scoreParams = z.object({ id: z.string().uuid() })
const scoreInput = z.object({ enrollmentId: z.string().uuid(), assessmentId: z.string().uuid(), rawScore: z.number().min(0).max(100) })

async function classContext(classId: string) {
  const [row] = await db.select({ id: classSections.id, programId: courses.programId, courseName: courses.name, className: classSections.name })
    .from(classSections).innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id)).innerJoin(courses, eq(curriculumCourses.courseId, courses.id)).where(eq(classSections.id, classId)).limit(1)
  if (!row) throw new HttpError(404, "Kelas tidak ditemukan.")
  return row
}

async function latestVerifiedRps(classId: string) {
  const [rps] = await db.select().from(rpsDocuments).where(and(eq(rpsDocuments.classId, classId), eq(rpsDocuments.status, "verified"))).orderBy(desc(rpsDocuments.version)).limit(1)
  if (!rps) throw new HttpError(409, "Kelas belum memiliki RPS Verified.")
  return rps
}

export async function registerOutcomeRoutes(app: FastifyInstance) {
  app.get("/api/classes/:id/outcomes", async (request) => {
    const access = await getAccessContext(request)
    const { id } = classParams.parse(request.params)
    const context = await classContext(id)
    await assertClassAccess(access, id, context.programId)
    const [rps] = await db.select().from(rpsDocuments).where(and(eq(rpsDocuments.classId, id), eq(rpsDocuments.status, "verified"))).orderBy(desc(rpsDocuments.version)).limit(1)
    const enrollmentRows = await db.select({ id: enrollments.id, studentId: students.id, nim: students.nim, name: students.name }).from(enrollments).innerJoin(students, eq(enrollments.studentId, students.id)).where(eq(enrollments.classId, id))
    const assessmentRows = rps ? await db.select().from(assessments).where(eq(assessments.rpsId, rps.id)) : []
    const scoreRows = assessmentRows.length ? await db.select().from(scores).innerJoin(enrollments, eq(scores.enrollmentId, enrollments.id)).where(eq(enrollments.classId, id)) : []
    const [latestRun] = await db.select().from(calculationRuns).where(eq(calculationRuns.classId, id)).orderBy(desc(calculationRuns.createdAt)).limit(1)
    const achievementRows = latestRun ? await db.select().from(achievements).where(eq(achievements.runId, latestRun.id)) : []
    const cqiRows = latestRun ? await db.select({ id: cqiFindings.id, title: cqiFindings.title, analysis: cqiFindings.analysis, actionPlan: cqiFindings.actionPlan, status: cqiFindings.status, outcomeCode: achievements.outcomeCode }).from(cqiFindings).innerJoin(achievements, eq(cqiFindings.achievementId, achievements.id)).where(eq(achievements.runId, latestRun.id)) : []
    const studentOnly = !await isClassStaff(access, id, context.programId)
    const ownStudents = studentOnly ? await db.select().from(students).where(eq(students.profileId, access.profile.id)) : []
    const visibleEnrollments = studentOnly ? enrollmentRows.filter(row => ownStudents.some(student => student.id === row.studentId)) : enrollmentRows
    const visibleScores = scoreRows.map(row => row.score).filter(row => assessmentRows.some(item => item.id === row.assessmentId) && (!studentOnly || (row.status === "released" && visibleEnrollments.some(item => item.id === row.enrollmentId))))
    return { class: context, rps: rps ? { id: rps.id, title: rps.title, version: rps.version } : null, enrollments: visibleEnrollments, assessments: assessmentRows, scores: visibleScores, run: latestRun ?? null, achievements: studentOnly ? achievementRows.filter(row => ownStudents.some(student => student.id === row.studentId)) : achievementRows, cqi: studentOnly ? [] : cqiRows }
  })

  app.post("/api/classes/:id/assessments/sync", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const { id } = classParams.parse(request.params)
    const context = await classContext(id); await assertClassAccess(access, id, context.programId)
    await requireClassRole(access, id, context.programId, ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const rps = await latestVerifiedRps(id)
    await db.transaction(async (tx) => {
      for (const [index, item] of rps.data.assessments.entries()) {
        await tx.insert(assessments).values({ rpsId: rps.id, code: `A${index + 1}`, name: item.name || `Assessment ${index + 1}`, weight: String(item.weight), maximumScore: "100" }).onConflictDoUpdate({ target: [assessments.rpsId, assessments.code], set: { name: item.name || `Assessment ${index + 1}`, weight: String(item.weight), updatedAt: new Date() } })
      }
      await writeAudit(tx, { actorProfileId: access.profile.id, action: "ASSESSMENTS_SYNCED", entityType: "class", entityId: id, after: { rpsId: rps.id, count: rps.data.assessments.length } })
    })
    return { ok: true }
  })

  app.put("/api/scores", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const input = scoreInput.parse(request.body)
    const [scope] = await db.select({ classId: enrollments.classId, programId: courses.programId, rpsStatus: rpsDocuments.status })
      .from(enrollments).innerJoin(classSections, eq(enrollments.classId, classSections.id)).innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id)).innerJoin(courses, eq(curriculumCourses.courseId, courses.id)).innerJoin(assessments, eq(assessments.id, input.assessmentId)).innerJoin(rpsDocuments, eq(assessments.rpsId, rpsDocuments.id)).where(and(eq(enrollments.id, input.enrollmentId), eq(rpsDocuments.classId, enrollments.classId))).limit(1)
    if (!scope) throw new HttpError(400, "Enrollment dan assessment tidak berasal dari kelas yang sama.")
    await assertClassAccess(access, scope.classId, scope.programId)
    await requireClassRole(access, scope.classId, scope.programId, ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    if (scope.rpsStatus !== "verified") throw new HttpError(409, "RPS harus Verified sebelum nilai dimasukkan.")
    const [saved] = await db.insert(scores).values({ enrollmentId: input.enrollmentId, assessmentId: input.assessmentId, rawScore: String(input.rawScore), gradedByProfileId: access.profile.id }).onConflictDoUpdate({ target: [scores.enrollmentId, scores.assessmentId, scores.attempt], set: { rawScore: String(input.rawScore), gradedByProfileId: access.profile.id, updatedAt: new Date() }, setWhere: eq(scores.status, "draft") }).returning()
    if (!saved) throw new HttpError(409, "Nilai sudah dirilis dan tidak dapat ditimpa.")
    return saved
  })

  app.post("/api/scores/:id/release", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const { id } = scoreParams.parse(request.params)
    const [scope] = await db.select({ score: scores, classId: enrollments.classId, programId: courses.programId, rpsStatus: rpsDocuments.status })
      .from(scores).innerJoin(enrollments, eq(scores.enrollmentId, enrollments.id)).innerJoin(classSections, eq(enrollments.classId, classSections.id)).innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id)).innerJoin(courses, eq(curriculumCourses.courseId, courses.id)).innerJoin(assessments, eq(scores.assessmentId, assessments.id)).innerJoin(rpsDocuments, eq(assessments.rpsId, rpsDocuments.id)).where(eq(scores.id, id)).limit(1)
    if (!scope) throw new HttpError(404, "Nilai tidak ditemukan.")
    await assertClassAccess(access, scope.classId, scope.programId)
    await requireClassRole(access, scope.classId, scope.programId, ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    if (scope.rpsStatus !== "verified") throw new HttpError(409, "RPS harus Verified sebelum nilai dirilis.")
    if (scope.score.status !== "draft") throw new HttpError(409, "Hanya nilai Draft yang dapat dirilis.")
    const [released] = await db.update(scores).set({ status: "released", releasedAt: new Date(), gradedByProfileId: access.profile.id, updatedAt: new Date() }).where(and(eq(scores.id, id), eq(scores.status, "draft"))).returning()
    return released
  })

  app.post("/api/classes/:id/calculate", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "KAPRODI", "GPM", "DOSEN_PENGAMPU"])
    const { id } = classParams.parse(request.params)
    const context = await classContext(id); await assertClassAccess(access, id, context.programId)
    await requireClassRole(access, id, context.programId, ["KAPRODI", "GPM", "DOSEN_PENGAMPU"])
    const rps = await latestVerifiedRps(id)
    const enrollmentRows = await db.select().from(enrollments).where(eq(enrollments.classId, id))
    const assessmentRows = await db.select().from(assessments).where(eq(assessments.rpsId, rps.id))
    const scoreRows = await db.select().from(scores).innerJoin(enrollments, eq(scores.enrollmentId, enrollments.id)).where(and(eq(enrollments.classId, id), eq(scores.status, "released")))
    if (!enrollmentRows.length || !assessmentRows.length) throw new HttpError(409, "Enrollment atau assessment belum tersedia.")
    const byEnrollmentAssessment = new Map(scoreRows.map((row) => [`${row.score.enrollmentId}:${row.score.assessmentId}`, Number(row.score.rawScore)]))
    return db.transaction(async (tx) => {
      const [run] = await tx.insert(calculationRuns).values({ classId: id, status: "running", requestedByProfileId: access.profile.id, parameters: { formula: "weighted-assessment", studentTarget: 60, classTarget: 70 } }).returning()
      if (!run) throw new Error("Calculation run gagal dibuat.")
      for (const cpmk of rps.data.cpmk) {
        const mapped = assessmentRows.filter((assessment) => rps.data.assessments[Number(assessment.code.slice(1)) - 1]?.cpmk.includes(cpmk.code))
        const weightTotal = mapped.reduce((sum, item) => sum + Number(item.weight), 0)
        const studentResults: Array<{ studentId: string; value: number }> = []
        if (weightTotal > 0) for (const enrollment of enrollmentRows) {
          const values = mapped.map((assessment) => ({ score: byEnrollmentAssessment.get(`${enrollment.id}:${assessment.id}`), weight: Number(assessment.weight) }))
          if (values.some((item) => item.score === undefined)) continue
          studentResults.push({ studentId: enrollment.studentId, value: values.reduce((sum, item) => sum + (item.score ?? 0) * item.weight, 0) / weightTotal })
        }
        for (const result of studentResults) await tx.insert(achievements).values({ runId: run.id, studentId: result.studentId, scope: "student", outcomeCode: cpmk.code, value: String(result.value), target: "60", status: result.value >= 60 ? "achieved" : "not_achieved" })
        const classValue = studentResults.length ? studentResults.filter((result) => result.value >= 60).length / studentResults.length * 100 : null
        const [aggregate] = await tx.insert(achievements).values({ runId: run.id, scope: "class", outcomeCode: cpmk.code, value: classValue === null ? null : String(classValue), target: "70", status: classValue === null ? "no_data" : classValue >= 70 ? "achieved" : "not_achieved" }).returning()
        if (aggregate && classValue !== null && classValue < 70) await tx.insert(cqiFindings).values({ achievementId: aggregate.id, ownerProfileId: access.profile.id, title: `Tindak lanjut ${cpmk.code}`, analysis: `Capaian kelas ${classValue.toFixed(1)}% berada di bawah target 70%.` })
      }
      const [completed] = await tx.update(calculationRuns).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(calculationRuns.id, run.id)).returning()
      await writeAudit(tx, { actorProfileId: access.profile.id, action: "OUTCOMES_CALCULATED", entityType: "class", entityId: id, after: { runId: run.id, formula: "weighted-assessment" } })
      return completed
    })
  })
}
