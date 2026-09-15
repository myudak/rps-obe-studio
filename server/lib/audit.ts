import type { db } from "../db/client.ts"
import { auditLogs } from "../db/schema.ts"

type AuditDb = Pick<typeof db, "insert">

export async function writeAudit(dbOrTx: AuditDb, input: {
  actorProfileId: string | null
  action: string
  entityType: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}) {
  await dbOrTx.insert(auditLogs).values({
    actorProfileId: input.actorProfileId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
  })
}
