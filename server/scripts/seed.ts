import { and, eq } from "drizzle-orm"

import { createExampleRps } from "../../src/schemas/rps-schema.ts"
import { auth } from "../auth.ts"
import { closeDatabase, db } from "../db/client.ts"
import {
  classSections,
  cohorts,
  courses,
  curricula,
  curriculumCourses,
  enrollments,
  periods,
  profiles,
  programs,
  roles,
  rpsDocuments,
  students,
  teachingAssignments,
  user,
  userRoles,
} from "../db/schema.ts"

async function firstOrCreate<T>(find: () => Promise<T[]>, create: () => Promise<T[]>, label: string): Promise<T> {
  const existing = await find()
  if (existing[0]) return existing[0]
  const created = await create()
  if (!created[0]) throw new Error(`${label} gagal dibuat.`)
  return created[0]
}

async function ensureUser(input: { name: string; email: string; password: string; staffId: string }) {
  let [authUser] = await db.select().from(user).where(eq(user.email, input.email)).limit(1)
  if (!authUser) {
    await auth.api.signUpEmail({ body: { name: input.name, email: input.email, password: input.password } })
    ;[authUser] = await db.select().from(user).where(eq(user.email, input.email)).limit(1)
  }
  if (!authUser) throw new Error(`User ${input.email} gagal dibuat.`)
  const profile = await firstOrCreate(
    () => db.select().from(profiles).where(eq(profiles.userId, authUser.id)).limit(1),
    () => db.insert(profiles).values({ userId: authUser.id, staffOrStudentId: input.staffId }).returning(),
    `Profil ${input.email}`,
  )
  return profile
}

async function main() {
  const roleSeeds = [
    ["SUPERADMIN", "Super Administrator"],
    ["ADMIN_PRODI", "Administrator Program Studi"],
    ["KAPRODI", "Ketua Program Studi"],
    ["GPM", "Gugus Penjaminan Mutu"],
    ["DOSEN_PENGAMPU", "Dosen Pengampu"],
    ["MAHASISWA", "Mahasiswa"],
  ] as const
  await db.insert(roles).values(roleSeeds.map(([code, name]) => ({ code, name }))).onConflictDoNothing()

  const program = await firstOrCreate(
    () => db.select().from(programs).where(eq(programs.code, "IF")).limit(1),
    () => db.insert(programs).values({ code: "IF", name: "Informatika", faculty: "Fakultas Sains dan Matematika" }).returning(),
    "Program studi",
  )
  const curriculum = await firstOrCreate(
    () => db.select().from(curricula).where(and(eq(curricula.programId, program.id), eq(curricula.code, "OBE-2024"))).limit(1),
    () => db.insert(curricula).values({ programId: program.id, code: "OBE-2024", name: "Kurikulum OBE 2024", version: 1, status: "active" }).returning(),
    "Kurikulum",
  )
  const cohort = await firstOrCreate(
    () => db.select().from(cohorts).where(and(eq(cohorts.programId, program.id), eq(cohorts.entryYear, 2025))).limit(1),
    () => db.insert(cohorts).values({ programId: program.id, curriculumId: curriculum.id, entryYear: 2025, name: "Informatika 2025" }).returning(),
    "Angkatan",
  )
  const period = await firstOrCreate(
    () => db.select().from(periods).where(eq(periods.code, "2026-GENAP")).limit(1),
    () => db.insert(periods).values({ code: "2026-GENAP", name: "Semester Genap 2025/2026", startsOn: "2026-02-09", endsOn: "2026-06-26" }).returning(),
    "Periode",
  )
  const course = await firstOrCreate(
    () => db.select().from(courses).where(and(eq(courses.programId, program.id), eq(courses.code, "PAIK6603"))).limit(1),
    () => db.insert(courses).values({ programId: program.id, code: "PAIK6603", name: "Rekayasa Perangkat Lunak", nameEn: "Software Engineering", credits: 3 }).returning(),
    "Mata kuliah",
  )
  const placement = await firstOrCreate(
    () => db.select().from(curriculumCourses).where(and(eq(curriculumCourses.curriculumId, curriculum.id), eq(curriculumCourses.courseId, course.id))).limit(1),
    () => db.insert(curriculumCourses).values({ curriculumId: curriculum.id, courseId: course.id, semester: 6 }).returning(),
    "Penempatan mata kuliah",
  )
  const classSection = await firstOrCreate(
    () => db.select().from(classSections).where(and(eq(classSections.periodId, period.id), eq(classSections.code, "RPL-A"))).limit(1),
    () => db.insert(classSections).values({ curriculumCourseId: placement.id, cohortId: cohort.id, periodId: period.id, code: "RPL-A", name: "RPL Kelas A", capacity: 40, status: "active" }).returning(),
    "Kelas",
  )

  const demoUsers = [
    { name: "Admin OBE", email: "admin@rps.local", password: "Admin123!", staffId: "ADMIN-001", role: "SUPERADMIN", programId: null },
    { name: "Dosen Demo", email: "dosen@rps.local", password: "Dosen123!", staffId: "19880001", role: "DOSEN_PENGAMPU", programId: program.id },
    { name: "GPM Demo", email: "gpm@rps.local", password: "GpmDemo123!", staffId: "GPM-001", role: "GPM", programId: program.id },
    { name: "Mahasiswa Demo", email: "mahasiswa@rps.local", password: "Mahasiswa123!", staffId: "24060125120001", role: "MAHASISWA", programId: program.id },
  ] as const

  const profilesByRole = new Map<string, Awaited<ReturnType<typeof ensureUser>>>()
  for (const demo of demoUsers) {
    const profile = await ensureUser(demo)
    const [role] = await db.select().from(roles).where(eq(roles.code, demo.role)).limit(1)
    if (!role) throw new Error(`Role ${demo.role} tidak ditemukan.`)
    const assignments = await db.select().from(userRoles).where(and(eq(userRoles.profileId, profile.id), eq(userRoles.roleId, role.id))).limit(1)
    if (!assignments[0]) await db.insert(userRoles).values({ profileId: profile.id, roleId: role.id, programId: demo.programId })
    profilesByRole.set(demo.role, profile)
  }

  const lecturer = profilesByRole.get("DOSEN_PENGAMPU")
  if (!lecturer) throw new Error("Profil dosen demo tidak ditemukan.")
  await db.insert(teachingAssignments).values({ classId: classSection.id, profileId: lecturer.id }).onConflictDoNothing()

  const studentProfile = profilesByRole.get("MAHASISWA")
  if (!studentProfile) throw new Error("Profil mahasiswa demo tidak ditemukan.")
  const student = await firstOrCreate(
    () => db.select().from(students).where(eq(students.nim, "24060125120001")).limit(1),
    () => db.insert(students).values({ profileId: studentProfile.id, cohortId: cohort.id, nim: "24060125120001", name: "Mahasiswa Demo" }).returning(),
    "Mahasiswa",
  )
  await db.insert(enrollments).values({ classId: classSection.id, studentId: student.id }).onConflictDoNothing()

  const [existingRps] = await db.select().from(rpsDocuments).where(eq(rpsDocuments.classId, classSection.id)).limit(1)
  if (!existingRps) {
    const data = createExampleRps()
    await db.insert(rpsDocuments).values({ classId: classSection.id, title: data.meta.courseName, data, authorProfileId: lecturer.id })
  }

  process.stdout.write("Seed selesai. Login demo: admin@rps.local / Admin123!\n")
}

try {
  await main()
} finally {
  await closeDatabase()
}
