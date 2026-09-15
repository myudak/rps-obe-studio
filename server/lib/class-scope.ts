import { and, eq } from "drizzle-orm"
import { db } from "../db/client.ts"
import { classSections, courses, curriculumCourses, teachingAssignments } from "../db/schema.ts"
import { assertClassAccess, HttpError, type AccessContext } from "./access.ts"

export async function classScope(id: string, access: AccessContext) {
  const [row] = await db.select({ section: classSections, programId: courses.programId, curriculumId: curriculumCourses.curriculumId })
    .from(classSections).innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id)).innerJoin(courses, eq(curriculumCourses.courseId, courses.id)).where(eq(classSections.id, id))
  if (!row) throw new HttpError(404, "Kelas tidak ditemukan.")
  await assertClassAccess(access, id, row.programId)
  return row
}
export function requireProgramRole(access: AccessContext, programId: string, roles: string[]) {
  if (!access.roles.some(role => role.code === "SUPERADMIN" || (role.programId === programId && roles.includes(role.code)))) throw new HttpError(403, "Peran Anda tidak mengizinkan tindakan ini pada program tersebut.")
}
export async function isClassStaff(access: AccessContext, classId: string, programId: string) {
  if (access.roles.some(role => role.code === "SUPERADMIN" || (role.programId === programId && ["ADMIN_PRODI", "GPM", "KAPRODI"].includes(role.code)))) return true
  if (!access.roles.some(role => role.programId === programId && role.code === "DOSEN_PENGAMPU")) return false
  const [assignment] = await db.select().from(teachingAssignments).where(and(eq(teachingAssignments.classId, classId), eq(teachingAssignments.profileId, access.profile.id)))
  return Boolean(assignment)
}
export async function requireClassRole(access: AccessContext, classId: string, programId: string, roles: string[]) {
  requireProgramRole(access, programId, roles)
  if (!await isClassStaff(access, classId, programId)) throw new HttpError(403, "Anda tidak ditugaskan mengelola kelas ini.")
}
