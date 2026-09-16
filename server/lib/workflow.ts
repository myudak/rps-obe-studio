import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "../db/client.ts"
import { approvals, rpsDocuments } from "../db/schema.ts"
import { HttpError, type AccessContext } from "./access.ts"
import { writeAudit } from "./audit.ts"

export async function decideRps(id: string, access: AccessContext, programId: string, decision: "approved" | "rejected", comment = "") {
  return db.transaction(async tx => {
    const [rps] = await tx.select().from(rpsDocuments).where(eq(rpsDocuments.id, id)).for("update")
    if (!rps || rps.status !== "submitted") throw new HttpError(409, "RPS tidak sedang diajukan.")
    if (rps.authorProfileId === access.profile.id) throw new HttpError(403, "Penulis tidak boleh menyetujui atau mereview RPS sendiri.")
    const [stage] = await tx.select().from(approvals).where(and(eq(approvals.rpsId, id), eq(approvals.decision, "pending"))).orderBy(desc(approvals.createdAt)).limit(1)
    if (!stage) throw new HttpError(409, "Tahap persetujuan tidak tersedia.")
    if (!access.roles.some(role => role.code === "SUPERADMIN" || (role.code === stage.stage && role.programId === programId))) throw new HttpError(403, `Menunggu persetujuan ${stage.stage}.`)
    if (decision === "rejected" && comment.trim().length < 3) throw new HttpError(400, "Alasan revisi wajib diisi.")
    const now = new Date()
    await tx.update(approvals).set({ decision, comment, reviewerProfileId: access.profile.id, decidedAt: now, updatedAt: now }).where(eq(approvals.id, stage.id))
    const status = decision === "rejected" ? "needs_revision" : stage.stage === "GPM" ? "submitted" : "verified"
    if (decision === "approved" && stage.stage === "GPM") await tx.insert(approvals).values({ rpsId: id, round: stage.round, stage: "KAPRODI", submittedByProfileId: stage.submittedByProfileId })
    if (decision === "rejected") await tx.update(approvals).set({ decision: "stale", updatedAt: now }).where(and(eq(approvals.rpsId, id), eq(approvals.decision, "pending")))
    const [updated] = await tx.update(rpsDocuments).set({ status, revision: rps.revision + 1, updatedAt: now, ...(status === "verified" ? { verifiedAt: now, verifiedByProfileId: access.profile.id } : {}) }).where(and(eq(rpsDocuments.id, id), inArray(rpsDocuments.status, ["submitted"]))).returning()
    await writeAudit(tx, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: `RPS_${stage.stage}_${decision.toUpperCase()}`, entityType: "rps", entityId: id, after: { status, round: stage.round, comment } })
    return updated
  })
}
