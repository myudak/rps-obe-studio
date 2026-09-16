import { randomUUID } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { db } from "../db/client.ts"
import * as s from "../db/schema.ts"
import { getAccessContext, requireRole, HttpError } from "../lib/access.ts"
import { createExampleRps } from "../../src/schemas/rps-schema.ts"
import { writeAudit } from "../lib/audit.ts"

export async function registerFullDemoRoutes(app: FastifyInstance) {
  app.post("/api/admin/demo/full", async request => {
    const access = await getAccessContext(request); requireRole(access, ["SUPERADMIN"])
    if (access.impersonation) throw new HttpError(403, "Kembali ke akun admin.")
    const [existing] = await db.select().from(s.demoScenarios).where(and(eq(s.demoScenarios.key, "full-academic"), eq(s.demoScenarios.status, "active")))
    if (existing) {
      if (!existing.manifest.curriculumProposals?.length) throw new HttpError(409, "Demo belum selesai dibuat. Reset skenario ini sebelum mencoba lagi.")
      return { ok: true, existing: true }
    }
    const suffix = randomUUID().slice(0, 6)
    const actors = await db.select({ profile: s.profiles, email: s.user.email }).from(s.profiles).innerJoin(s.user, eq(s.user.id, s.profiles.userId))
    const lecturer = actors.find(row => row.email === "dosen@rps.local")?.profile ?? access.profile
    const reviewer = actors.find(row => row.email === "gpm@rps.local")?.profile ?? access.profile
    const manifest: Record<string, string[]> = {}; const remember = (name: string, rows: Array<{ id: string }>) => { manifest[name] = [...new Set([...(manifest[name] ?? []), ...rows.map(row => row.id)])] }
    const verifiedClasses: string[] = []
    const scenario = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(740226)`)
      const [active] = await tx.select().from(s.demoScenarios).where(and(eq(s.demoScenarios.key, "full-academic"), eq(s.demoScenarios.status, "active")))
      if (active) throw new HttpError(409, "Demo sedang dibuat atau sudah aktif.")
      const [program] = await tx.insert(s.programs).values({ code: `DEMO-${suffix}`, name: "Informatika — Demo Akademik", faculty: "Fakultas Sains dan Matematika" }).returning(); remember("programs", [program!])
      const [curriculum] = await tx.insert(s.curricula).values({ programId: program!.id, code: "OBE-DEMO", name: "Kurikulum Informatika Demo", status: "active" }).returning(); remember("curricula", [curriculum!])
      const cohortRows = await tx.insert(s.cohorts).values([2024, 2025].map(entryYear => ({ programId: program!.id, curriculumId: curriculum!.id, entryYear, name: `Angkatan ${entryYear} Demo` }))).returning(); remember("cohorts", cohortRows)
      const periodRows = await tx.insert(s.periods).values([{ code: `DEMO-GENAP-${suffix}`, name: "Demo · Genap 2025/2026", startsOn: "2026-02-01", endsOn: "2026-06-30" }, { code: `DEMO-GASAL-${suffix}`, name: "Demo · Gasal 2026/2027", startsOn: "2026-08-01", endsOn: "2027-01-31" }]).returning(); remember("periods", periodRows)
      const roleRows = await tx.select().from(s.roles)
      for (const [actor, roleCode] of [[lecturer, "DOSEN_PENGAMPU"], [reviewer, "GPM"]] as const) { const role = roleRows.find(row => row.code === roleCode); if (role) remember("userRoles", await tx.insert(s.userRoles).values({ profileId: actor.id, roleId: role.id, programId: program!.id }).returning()) }
      const studentRows = await tx.insert(s.students).values(Array.from({ length: 24 }, (_, index) => ({ cohortId: cohortRows[index % 2]!.id, nim: `DEMO${suffix}${String(index + 1).padStart(3, "0")}`, name: `${["Aditya", "Nadia", "Raka", "Salsabila", "Bima", "Aulia"][index % 6]} ${["Pratama", "Putri", "Saputra", "Wijaya"][Math.floor(index / 6)]}` }))).returning(); remember("students", studentRows)
      const names = ["Dasar Pemrograman", "Basis Data", "Rekayasa Perangkat Lunak", "Kecerdasan Buatan", "Jaringan Komputer", "Interaksi Manusia dan Komputer"]
      for (const [index, name] of names.entries()) {
        const [course] = await tx.insert(s.courses).values({ programId: program!.id, code: `IF${1101 + index * 100}`, name, credits: 3 }).returning(); remember("courses", [course!])
        const [placement] = await tx.insert(s.curriculumCourses).values({ curriculumId: curriculum!.id, courseId: course!.id, semester: Math.min(6, index + 1) }).returning(); remember("curriculumCourses", [placement!])
        for (const [periodIndex, period] of periodRows.entries()) {
          const [section] = await tx.insert(s.classSections).values({ curriculumCourseId: placement!.id, cohortId: cohortRows[periodIndex]!.id, periodId: period.id, code: `${course!.code}-${periodIndex ? "B" : "A"}`, name: `${name} · ${periodIndex ? "B" : "A"}`, capacity: 40, status: "active" }).returning(); remember("classSections", [section!])
          remember("teachingAssignments", await tx.insert(s.teachingAssignments).values({ classId: section!.id, profileId: lecturer.id }).returning())
          remember("enrollments", await tx.insert(s.enrollments).values(studentRows.filter(student => student.cohortId === section!.cohortId).map(student => ({ classId: section!.id, studentId: student.id }))).returning())
          const data = createExampleRps(); data.meta.courseName = name
          data.cpl.forEach((cpl, i) => { cpl.description = ["Etika dan tanggung jawab profesional", "Pemikiran komputasional", "Penguasaan fondasi informatika", "Perancangan solusi", "Evaluasi sistem", "Komunikasi dan kolaborasi"][i] ?? "" })
          data.cpmk.forEach((cpmk, i) => { cpmk.maps = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0, i: 0, j: 0 }; cpmk.maps[String.fromCharCode(97 + i % 6) as keyof typeof cpmk.maps] = (index % 3 + 1) as 1 | 2 | 3 })
          const status = index < 4 ? "verified" : periodIndex ? "submitted" : "draft"
          const [rps] = await tx.insert(s.rpsDocuments).values({ classId: section!.id, title: name, data, authorProfileId: lecturer.id, status, ...(status === "verified" ? { verifiedAt: new Date(), verifiedByProfileId: reviewer.id, submittedAt: new Date() } : status === "submitted" ? { submittedAt: new Date() } : {}) }).returning(); remember("rpsDocuments", [rps!])
          if (status !== "draft") for (const stage of status === "verified" ? ["GPM", "KAPRODI"] : ["GPM"]) remember("approvals", await tx.insert(s.approvals).values({ rpsId: rps!.id, stage, submittedByProfileId: lecturer.id, reviewerProfileId: status === "verified" ? stage === "GPM" ? reviewer.id : access.profile.id : null, decision: status === "verified" ? "approved" : "pending", comment: status === "verified" ? "Persetujuan sintetis untuk demo." : "", decidedAt: status === "verified" ? new Date() : null }).returning())
          if (status === "verified") verifiedClasses.push(section!.id)
        }
      }
      const [created] = await tx.insert(s.demoScenarios).values({ key: "full-academic", label: "Demo akademik lengkap · 12 kelas", createdByProfileId: access.profile.id, manifest }).returning(); return created!
    })
    try {
    // Use the application's actual sync and calculation routes so charts derive from demo scores.
    for (const [index, classId] of verifiedClasses.entries()) {
      const sync = await app.inject({ method: "POST", url: `/api/classes/${classId}/assessments/sync`, headers: { cookie: request.headers.cookie ?? "" } }); if (sync.statusCode !== 200) throw new Error("Demo sync failed")
      const [rps] = await db.select().from(s.rpsDocuments).where(eq(s.rpsDocuments.classId, classId)); const assessments = await db.select().from(s.assessments).where(eq(s.assessments.rpsId, rps!.id)); const participants = await db.select().from(s.enrollments).where(eq(s.enrollments.classId, classId))
      remember("scores", await db.insert(s.scores).values(participants.flatMap((participant, studentIndex) => assessments.map((assessment, assessmentIndex) => ({ enrollmentId: participant.id, assessmentId: assessment.id, gradedByProfileId: lecturer.id, rawScore: String(40 + ((studentIndex * 7 + assessmentIndex * 9 + index * 5) % 58)), status: "released" as const, releasedAt: new Date() })))).returning())
      const calculated = await app.inject({ method: "POST", url: `/api/classes/${classId}/calculate`, headers: { cookie: request.headers.cookie ?? "" } }); if (calculated.statusCode !== 200) throw new Error("Demo calculation failed")
      const run = calculated.json(); remember("calculationRuns", [run]); const achievementRows = await db.select().from(s.achievements).where(eq(s.achievements.runId, run.id)); remember("achievements", achievementRows)
      const findings = await db.select().from(s.cqiFindings).where(inArray(s.cqiFindings.achievementId, achievementRows.map(row => row.id))); remember("cqiFindings", findings)
      for (const [findingIndex, finding] of findings.entries()) { const status = (["open", "in_progress", "pending_review", "closed"] as const)[findingIndex % 4]!; await db.update(s.cqiFindings).set({ status, actionPlan: "Tambahkan latihan terarah dan evaluasi ulang assessment pada semester berikutnya.", dueOn: "2026-12-15", closedAt: status === "closed" ? new Date() : null }).where(eq(s.cqiFindings.id, finding.id)); remember("cqiHistory", await db.insert(s.cqiHistory).values({ cqiId: finding.id, actorProfileId: reviewer.id, status, comment: "Riwayat tindak lanjut sintetis untuk demonstrasi." }).returning()) }
    }
    const placements = manifest.curriculumCourses!
    remember("curriculumOutcomes", await db.select().from(s.curriculumOutcomes).where(inArray(s.curriculumOutcomes.curriculumId, manifest.curricula!)))
    const outcomes = await db.select().from(s.courseOutcomes).where(inArray(s.courseOutcomes.curriculumCourseId, placements)); remember("courseOutcomes", outcomes)
    remember("courseOutcomeMappings", await db.select().from(s.courseOutcomeMappings).where(inArray(s.courseOutcomeMappings.courseOutcomeId, outcomes.map(row => row.id))))
    remember("subOutcomes", await db.insert(s.subOutcomes).values(outcomes.map(row => ({ courseOutcomeId: row.id, code: `${row.code}.1`, description: `Mendemonstrasikan keterampilan: ${row.description}`, weight: "100" }))).returning())
    remember("assessments", await db.select().from(s.assessments).where(inArray(s.assessments.rpsId, manifest.rpsDocuments!)))
    remember("assessmentOutcomeMappings", await db.select().from(s.assessmentOutcomeMappings).where(inArray(s.assessmentOutcomeMappings.assessmentId, manifest.assessments!)))
    remember("curriculumProposals", await db.insert(s.curriculumProposals).values({ curriculumCourseId: placements[0]!, proposedByProfileId: lecturer.id, title: "Perkuat latihan pemecahan masalah", rationale: "Hasil demo memperlihatkan gap capaian; perlu penambahan latihan dan penyelarasan assessment.", changes: { summary: "Tambah latihan terstruktur pada minggu 4–6." }, impact: { activeClasses: 2, rps: 2, assessmentMappings: 12 }, status: "pending" }).returning())
    } finally {
      // Capture generated descendants even if a sync/calculation fails, so reset remains recoverable.
      remember("curriculumOutcomes", await db.select().from(s.curriculumOutcomes).where(inArray(s.curriculumOutcomes.curriculumId, manifest.curricula!)))
      remember("courseOutcomes", await db.select().from(s.courseOutcomes).where(inArray(s.courseOutcomes.curriculumCourseId, manifest.curriculumCourses!)))
      remember("courseOutcomeMappings", await db.select().from(s.courseOutcomeMappings).where(inArray(s.courseOutcomeMappings.courseOutcomeId, manifest.courseOutcomes!)))
      remember("subOutcomes", await db.select().from(s.subOutcomes).where(inArray(s.subOutcomes.courseOutcomeId, manifest.courseOutcomes!)))
      remember("assessments", await db.select().from(s.assessments).where(inArray(s.assessments.rpsId, manifest.rpsDocuments!)))
      remember("assessmentOutcomeMappings", await db.select().from(s.assessmentOutcomeMappings).where(inArray(s.assessmentOutcomeMappings.assessmentId, manifest.assessments!)))
      remember("scores", await db.select().from(s.scores).where(inArray(s.scores.enrollmentId, manifest.enrollments!)))
      remember("calculationRuns", await db.select().from(s.calculationRuns).where(inArray(s.calculationRuns.classId, manifest.classSections!)))
      remember("achievements", await db.select().from(s.achievements).where(inArray(s.achievements.runId, manifest.calculationRuns!)))
      remember("cqiFindings", await db.select().from(s.cqiFindings).where(inArray(s.cqiFindings.achievementId, manifest.achievements!)))
      remember("cqiHistory", await db.select().from(s.cqiHistory).where(inArray(s.cqiHistory.cqiId, manifest.cqiFindings!)))
      await db.update(s.demoScenarios).set({ manifest, updatedAt: new Date() }).where(eq(s.demoScenarios.id, scenario.id))
    }
    await writeAudit(db, { actorProfileId: access.profile.id, action: "FULL_DEMO_CREATED", entityType: "demo_scenario", entityId: scenario.id, after: { classes: 12, students: 24, calculatedClasses: verifiedClasses.length } })
    return { ok: true, classes: 12, students: 24 }
  })
}
