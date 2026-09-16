import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm"
import { fromNodeHeaders } from "better-auth/node"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { auth } from "../auth.ts"
import { db, sqlClient } from "../db/client.ts"
import {
  achievements,
  auditLogs,
  calculationRuns,
  classSections,
  courseOutcomeMappings,
  courseOutcomes,
  cqiFindings,
  curricula,
  curriculumCourses,
  curriculumOutcomes,
  demoScenarios,
  profiles,
  programs,
  roles,
  rpsDocuments,
  students,
  subOutcomes,
  user,
  userRoles,
} from "../db/schema.ts"
import { getAccessContext, HttpError, requireRole } from "../lib/access.ts"
import { writeAudit } from "../lib/audit.ts"
import * as fullSchema from "../db/schema.ts"

const roleAssignment = z.object({ roleCode: z.enum(["ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU", "MAHASISWA"]), programId: z.string().uuid() })
const userInput = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  staffOrStudentId: z.string().trim().max(80).optional().default(""),
  roles: z.array(roleAssignment).max(12).default([]),
})
const userUpdate = z.object({ name: z.string().trim().min(3).max(120), email: z.string().trim().email(), staffOrStudentId: z.string().trim().max(80).optional().default(""), status: z.enum(["active", "inactive"]), banned: z.boolean() })

async function superadmin(request: Parameters<typeof getAccessContext>[0]) {
  const access = await getAccessContext(request)
  requireRole(access, ["SUPERADMIN"])
  if (access.impersonation) throw new HttpError(403, "Kembali ke akun admin sebelum mengubah administrasi sistem.")
  return access
}

async function validateAssignments(assignments: z.infer<typeof roleAssignment>[]) {
  const roleRows = assignments.length ? await db.select().from(roles).where(inArray(roles.code, assignments.map(item => item.roleCode))) : []
  const programRows = assignments.length ? await db.select().from(programs).where(inArray(programs.id, assignments.map(item => item.programId))) : []
  if (roleRows.length !== new Set(assignments.map(item => item.roleCode)).size || programRows.length !== new Set(assignments.map(item => item.programId)).size) throw new HttpError(400, "Role atau program studi tidak valid.")
  const roleByCode = new Map(roleRows.map(item => [item.code, item.id]))
  return assignments.map(item => ({ roleId: roleByCode.get(item.roleCode)!, programId: item.programId }))
}

const TABLE_LABELS: Record<string, string> = {
  auth_user: "Akun", obe_profile: "Profil", user_role: "Akses pengguna", program: "Program studi", curriculum: "Kurikulum",
  curriculum_outcome: "CPL", course: "Mata kuliah", curriculum_course: "Penempatan mata kuliah", course_outcome: "CPMK",
  sub_outcome: "Sub-CPMK", class_section: "Kelas", student: "Mahasiswa", enrollment: "Peserta kelas", rps: "RPS",
  assessment: "Assessment", score: "Nilai", achievement: "Capaian", cqi: "CQI", approval: "Persetujuan", audit_log: "Audit",
}

async function studioSnapshot() {
  const [userRows, profileRows, assignmentRows, auditRows, scenarioRows, tableRows, exactCounts, migrationRows] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned, createdAt: user.createdAt }).from(user).orderBy(asc(user.name)),
    db.select().from(profiles),
    db.select({ profileId: userRoles.profileId, roleCode: roles.code, roleName: roles.name, programId: userRoles.programId, programName: programs.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).leftJoin(programs, eq(programs.id, userRoles.programId)),
    db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, createdAt: auditLogs.createdAt, actorName: user.name, impersonatorProfileId: auditLogs.impersonatorProfileId }).from(auditLogs).leftJoin(profiles, eq(profiles.id, auditLogs.actorProfileId)).leftJoin(user, eq(user.id, profiles.userId)).orderBy(desc(auditLogs.createdAt)).limit(100),
    db.select().from(demoScenarios).orderBy(desc(demoScenarios.createdAt)),
    sqlClient<Array<{ table_name: string; size_bytes: string }>>`
      select c.relname as table_name, pg_total_relation_size(c.oid)::bigint::text as size_bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`,
    sqlClient<Array<{ table_name: string; row_count: string }>>`
      select 'auth_user' table_name, count(*)::text row_count from auth_user union all
      select 'obe_profile', count(*)::text from obe_profile union all
      select 'user_role', count(*)::text from user_role union all
      select 'program', count(*)::text from program union all
      select 'curriculum', count(*)::text from curriculum union all
      select 'curriculum_outcome', count(*)::text from curriculum_outcome union all
      select 'course', count(*)::text from course union all
      select 'curriculum_course', count(*)::text from curriculum_course union all
      select 'course_outcome', count(*)::text from course_outcome union all
      select 'sub_outcome', count(*)::text from sub_outcome union all
      select 'class_section', count(*)::text from class_section union all
      select 'student', count(*)::text from student union all
      select 'enrollment', count(*)::text from enrollment union all
      select 'rps', count(*)::text from rps union all
      select 'assessment', count(*)::text from assessment union all
      select 'score', count(*)::text from score union all
      select 'achievement', count(*)::text from achievement union all
      select 'cqi', count(*)::text from cqi union all
      select 'approval', count(*)::text from approval union all
      select 'audit_log', count(*)::text from audit_log`,
    sqlClient<Array<{ id: number; hash: string; created_at: number }>>`select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 5`.catch(() => []),
  ])
  const profileByUser = new Map(profileRows.map(item => [item.userId, item]))
  return {
    database: { connected: true, engine: "PostgreSQL", migrations: migrationRows, tables: tableRows.filter(item => TABLE_LABELS[item.table_name]).map(item => ({ ...item, row_estimate: exactCounts.find(countRow => countRow.table_name === item.table_name)?.row_count ?? "0", label: TABLE_LABELS[item.table_name] })) },
    users: userRows.map(item => { const profile = profileByUser.get(item.id); return { ...item, profileId: profile?.id ?? null, staffOrStudentId: profile?.staffOrStudentId ?? "", status: profile?.status ?? "inactive", roles: assignmentRows.filter(role => role.profileId === profile?.id) } }),
    audit: auditRows,
    scenarios: scenarioRows,
  }
}

export async function registerAdminStudioRoutes(app: FastifyInstance) {
  app.get("/api/admin/studio", async request => { await superadmin(request); return studioSnapshot() })

  app.post("/api/admin/users", async (request, reply) => {
    const access = await superadmin(request)
    const input = userInput.parse(request.body)
    const assignments = await validateAssignments(input.roles)
    const created = await auth.api.createUser({ headers: fromNodeHeaders(request.headers), body: { name: input.name, email: input.email, password: input.password, role: "user" } })
    if (!created.user) throw new Error("Akun gagal dibuat.")
    const [profile] = await db.insert(profiles).values({ userId: created.user.id, staffOrStudentId: input.staffOrStudentId }).returning()
    if (!profile) throw new Error("Profil gagal dibuat.")
    if (assignments.length) await db.insert(userRoles).values(assignments.map(item => ({ ...item, profileId: profile.id })))
    await writeAudit(db, { actorProfileId: access.profile.id, action: "USER_CREATED", entityType: "user", entityId: created.user.id, after: { email: input.email, roles: input.roles } })
    return reply.status(201).send({ id: created.user.id })
  })

  app.patch("/api/admin/users/:id", async request => {
    const access = await superadmin(request)
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const input = userUpdate.parse(request.body)
    if (id === access.user.id && (input.status !== "active" || input.banned)) throw new HttpError(409, "Akun yang sedang digunakan tidak dapat dinonaktifkan.")
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, id)).limit(1)
    if (!profile) throw new HttpError(404, "Profil pengguna tidak ditemukan.")
    await db.transaction(async tx => {
      await tx.update(user).set({ name: input.name, email: input.email, banned: input.banned, updatedAt: new Date() }).where(eq(user.id, id))
      await tx.update(profiles).set({ staffOrStudentId: input.staffOrStudentId, status: input.status, updatedAt: new Date() }).where(eq(profiles.id, profile.id))
      await writeAudit(tx, { actorProfileId: access.profile.id, action: "USER_UPDATED", entityType: "user", entityId: id, after: input })
    })
    return { ok: true }
  })

  app.put("/api/admin/users/:id/roles", async request => {
    const access = await superadmin(request)
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params)
    const input = z.object({ roles: z.array(roleAssignment).max(12) }).parse(request.body)
    const assignments = await validateAssignments(input.roles)
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, id)).limit(1)
    if (!profile) throw new HttpError(404, "Profil pengguna tidak ditemukan.")
    const current = await db.select({ code: roles.code }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.profileId, profile.id))
    if (current.some(item => item.code === "SUPERADMIN")) throw new HttpError(409, "Role SUPERADMIN dikelola melalui prosedur bootstrap, bukan halaman ini.")
    await db.transaction(async tx => {
      await tx.delete(userRoles).where(eq(userRoles.profileId, profile.id))
      if (assignments.length) await tx.insert(userRoles).values(assignments.map(item => ({ ...item, profileId: profile.id })))
      await writeAudit(tx, { actorProfileId: access.profile.id, action: "USER_ROLES_UPDATED", entityType: "user", entityId: id, after: { roles: input.roles } })
    })
    return { ok: true }
  })

  app.get("/api/admin/data-health", async request => {
    await superadmin(request)
    const [classesWithoutLecturer, rpsWithoutAssessments, studentsWithoutAccount, openCqi, pendingRps] = await Promise.all([
      sqlClient`select count(*)::int as value from class_section c where not exists (select 1 from teaching_assignment t where t.class_id=c.id)`,
      sqlClient`select count(*)::int as value from rps r where r.status='verified' and not exists (select 1 from assessment a where a.rps_id=r.id)`,
      db.select({ value: count() }).from(students).where(sql`${students.profileId} is null`),
      db.select({ value: count() }).from(cqiFindings).where(inArray(cqiFindings.status, ["open", "in_progress", "pending_review"])),
      db.select({ value: count() }).from(rpsDocuments).where(eq(rpsDocuments.status, "submitted")),
    ])
    return [
      { key: "classes-without-lecturer", label: "Kelas tanpa dosen", value: Number(classesWithoutLecturer[0]?.value ?? 0), severity: "warning" },
      { key: "rps-without-assessment", label: "RPS verified belum disinkronkan", value: Number(rpsWithoutAssessments[0]?.value ?? 0), severity: "warning" },
      { key: "students-without-account", label: "Mahasiswa tanpa akun", value: Number(studentsWithoutAccount[0]?.value ?? 0), severity: "info" },
      { key: "open-cqi", label: "CQI belum selesai", value: Number(openCqi[0]?.value ?? 0), severity: "info" },
      { key: "pending-rps", label: "RPS menunggu review", value: Number(pendingRps[0]?.value ?? 0), severity: "info" },
    ]
  })

  app.post("/api/admin/demo-scenarios", async (request, reply) => {
    const access = await superadmin(request)
    const { key } = z.object({ key: z.enum(["outcome-library", "cqi-gap"]) }).parse(request.body)
    const [active] = await db.select().from(demoScenarios).where(and(eq(demoScenarios.key, key), eq(demoScenarios.status, "active"))).limit(1)
    if (active) throw new HttpError(409, "Skenario demo ini sudah aktif.")
    const [curriculum] = await db.select().from(curricula).orderBy(asc(curricula.createdAt)).limit(1)
    const [placement] = await db.select().from(curriculumCourses).orderBy(asc(curriculumCourses.createdAt)).limit(1)
    const [classRow] = await db.select().from(classSections).orderBy(asc(classSections.createdAt)).limit(1)
    if (!curriculum || !placement || !classRow) throw new HttpError(409, "Jalankan seed dasar sebelum membuat skenario demo.")
    const manifest: Record<string, string[]> = {}
    await db.transaction(async tx => {
      if (key === "outcome-library") {
        const cplRows = await tx.insert(curriculumOutcomes).values(Array.from({ length: 6 }, (_, index) => ({ curriculumId: curriculum.id, code: `CPL-${index + 1}`, name: ["Etika profesional", "Pemikiran komputasional", "Fondasi keilmuan", "Perancangan solusi", "Evaluasi sistem", "Kolaborasi"][index], description: `Capaian pembelajaran lulusan ${index + 1}`, sortOrder: index + 1 }))).returning()
        const cpmkRows = await tx.insert(courseOutcomes).values(Array.from({ length: 4 }, (_, index) => ({ curriculumCourseId: placement.id, code: `CPMK-${index + 1}`, description: `Mahasiswa mampu mencapai kompetensi mata kuliah ${index + 1}`, weight: "25", sortOrder: index + 1 }))).returning()
        const subRows = await tx.insert(subOutcomes).values(cpmkRows.flatMap((cpmk, index) => [1, 2].map(number => ({ courseOutcomeId: cpmk.id, code: `Sub-CPMK-${index + 1}.${number}`, description: `Kemampuan terukur ${index + 1}.${number}`, weight: "50", sortOrder: number })))).returning()
        const mapRows = await tx.insert(courseOutcomeMappings).values(cpmkRows.map((cpmk, index) => ({ courseOutcomeId: cpmk.id, curriculumOutcomeId: cplRows[index % cplRows.length]!.id, level: Math.min(3, index + 1), contribution: "1" }))).returning()
        manifest.curriculumOutcomes = cplRows.map(item => item.id); manifest.courseOutcomes = cpmkRows.map(item => item.id); manifest.subOutcomes = subRows.map(item => item.id); manifest.courseOutcomeMappings = mapRows.map(item => item.id)
      } else {
        const [run] = await tx.insert(calculationRuns).values({ classId: classRow.id, requestedByProfileId: access.profile.id, status: "completed", completedAt: new Date(), parameters: { demo: true, formula: "weighted-assessment" } }).returning()
        const [achievement] = await tx.insert(achievements).values({ runId: run!.id, scope: "class", outcomeCode: "CPMK-DEMO", value: "58", target: "70", status: "not_achieved" }).returning()
        const [finding] = await tx.insert(cqiFindings).values({ achievementId: achievement!.id, ownerProfileId: access.profile.id, title: "Demo capaian di bawah target", analysis: "Capaian aktual 58% berada di bawah target 70%.", actionPlan: "Tinjau alignment assessment dan aktivitas pembelajaran." }).returning()
        manifest.calculationRuns = [run!.id]; manifest.achievements = [achievement!.id]; manifest.cqiFindings = [finding!.id]
      }
      const [scenario] = await tx.insert(demoScenarios).values({ key, label: key === "outcome-library" ? "Library CPL & CPMK" : "CQI di bawah target", createdByProfileId: access.profile.id, manifest }).returning()
      await writeAudit(tx, { actorProfileId: access.profile.id, action: "DEMO_SCENARIO_CREATED", entityType: "demo_scenario", entityId: scenario!.id, after: { key, manifest } })
    })
    return reply.status(201).send({ ok: true })
  })

  app.delete("/api/admin/demo-scenarios/:id", async request => {
    const access = await superadmin(request)
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const [scenario] = await db.select().from(demoScenarios).where(and(eq(demoScenarios.id, id), eq(demoScenarios.status, "active"))).limit(1)
    if (!scenario) throw new HttpError(404, "Skenario aktif tidak ditemukan.")
    const manifest = scenario.manifest
    await db.transaction(async tx => {
      if (scenario.key === "full-academic") {
        const order = ["cqiHistory", "cqiAttachments", "cqiFindings", "achievements", "calculationRuns", "scores", "assessmentOutcomeMappings", "assessments", "approvals", "aiSuggestions", "rpsDocuments", "curriculumProposals", "subOutcomes", "courseOutcomeMappings", "courseOutcomes", "curriculumOutcomes", "enrollments", "teachingAssignments", "classSections", "students", "curriculumCourses", "courses", "cohorts", "curricula", "periods", "userRoles", "programs"] as const
        for (const key of order) if (manifest[key]?.length) await tx.delete(fullSchema[key]).where(inArray(fullSchema[key].id, manifest[key]!))
        await tx.update(demoScenarios).set({ status: "reset", resetAt: new Date(), updatedAt: new Date() }).where(eq(demoScenarios.id, id))
        await writeAudit(tx, { actorProfileId: access.profile.id, action: "DEMO_SCENARIO_RESET", entityType: "demo_scenario", entityId: id, before: { manifest } })
        return
      }
      if (manifest.cqiFindings?.length) await tx.delete(cqiFindings).where(inArray(cqiFindings.id, manifest.cqiFindings))
      if (manifest.achievements?.length) await tx.delete(achievements).where(inArray(achievements.id, manifest.achievements))
      if (manifest.calculationRuns?.length) await tx.delete(calculationRuns).where(inArray(calculationRuns.id, manifest.calculationRuns))
      if (manifest.subOutcomes?.length) await tx.delete(subOutcomes).where(inArray(subOutcomes.id, manifest.subOutcomes))
      if (manifest.courseOutcomeMappings?.length) await tx.delete(courseOutcomeMappings).where(inArray(courseOutcomeMappings.id, manifest.courseOutcomeMappings))
      if (manifest.courseOutcomes?.length) await tx.delete(courseOutcomes).where(inArray(courseOutcomes.id, manifest.courseOutcomes))
      if (manifest.curriculumOutcomes?.length) await tx.delete(curriculumOutcomes).where(inArray(curriculumOutcomes.id, manifest.curriculumOutcomes))
      await tx.update(demoScenarios).set({ status: "reset", resetAt: new Date(), updatedAt: new Date() }).where(eq(demoScenarios.id, id))
      await writeAudit(tx, { actorProfileId: access.profile.id, action: "DEMO_SCENARIO_RESET", entityType: "demo_scenario", entityId: id, before: { manifest } })
    })
    return { ok: true }
  })
}
