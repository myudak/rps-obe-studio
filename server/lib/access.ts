import { and, eq } from "drizzle-orm"
import type { FastifyRequest } from "fastify"
import { fromNodeHeaders } from "better-auth/node"

import { auth } from "../auth.ts"
import { db } from "../db/client.ts"
import { enrollments, profiles, programs, roles, students, teachingAssignments, user, userRoles } from "../db/schema.ts"

export type AccessContext = {
  user: { id: string; name: string; email: string }
  profile: { id: string; status: "active" | "inactive" }
  roles: Array<{ code: string; name: string; programId: string | null; programName: string | null }>
  impersonation: null | { impersonatedByUserId: string; impersonatedByProfileId: string; impersonatedByName: string }
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

export async function getAccessContext(request: FastifyRequest): Promise<AccessContext> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
  if (!session) throw new HttpError(401, "Silakan masuk untuk melanjutkan.")

  const [profile] = await db.select({ id: profiles.id, status: profiles.status })
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1)
  if (!profile || profile.status !== "active") throw new HttpError(403, "Profil OBE belum aktif atau belum ditautkan.")

  const assignedRoles = await db.select({
    code: roles.code,
    name: roles.name,
    programId: userRoles.programId,
    programName: programs.name,
  })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(programs, eq(userRoles.programId, programs.id))
    .where(eq(userRoles.profileId, profile.id))

  const impersonatedBy = (session.session as typeof session.session & { impersonatedBy?: string | null }).impersonatedBy ?? null
  const [originalAdmin] = impersonatedBy
    ? await db.select({ id: user.id, profileId: profiles.id, name: user.name }).from(user).innerJoin(profiles, eq(profiles.userId, user.id)).where(eq(user.id, impersonatedBy)).limit(1)
    : []

  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    profile,
    roles: assignedRoles,
    impersonation: originalAdmin ? { impersonatedByUserId: originalAdmin.id, impersonatedByProfileId: originalAdmin.profileId, impersonatedByName: originalAdmin.name } : null,
  }
}

export function hasRole(context: AccessContext, allowed: string[]) {
  return context.roles.some((role) => allowed.includes(role.code))
}

export function requireRole(context: AccessContext, allowed: string[]) {
  if (!hasRole(context, allowed)) throw new HttpError(403, "Anda tidak memiliki izin untuk tindakan ini.")
}

export function accessibleProgramIds(context: AccessContext) {
  if (hasRole(context, ["SUPERADMIN"])) return null
  return context.roles.flatMap((role) => role.programId ? [role.programId] : [])
}

export async function assertClassAccess(context: AccessContext, classId: string, programId: string) {
  if (hasRole(context, ["SUPERADMIN"])) return
  if (!accessibleProgramIds(context)?.includes(programId)) throw new HttpError(403, "Kelas berada di luar scope program Anda.")
  if (context.roles.some(role => role.programId === programId && ["ADMIN_PRODI", "KAPRODI", "GPM"].includes(role.code))) return
  if (context.roles.some(role => role.programId === programId && role.code === "DOSEN_PENGAMPU")) {
    const [assignment] = await db.select({ id: teachingAssignments.id }).from(teachingAssignments).where(and(eq(teachingAssignments.classId, classId), eq(teachingAssignments.profileId, context.profile.id))).limit(1)
    if (assignment) return
  }
  if (context.roles.some(role => role.programId === programId && role.code === "MAHASISWA")) {
    const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments).innerJoin(students, eq(enrollments.studentId, students.id)).where(and(eq(enrollments.classId, classId), eq(students.profileId, context.profile.id))).limit(1)
    if (enrollment) return
  }
  throw new HttpError(403, "Anda tidak ditugaskan atau terdaftar pada kelas ini.")
}
