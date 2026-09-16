import { createHash } from "node:crypto"
import { is, sql } from "drizzle-orm"
import { PgTable, getTableConfig } from "drizzle-orm/pg-core"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import * as schema from "../db/schema.ts"
import { db, sqlClient } from "../db/client.ts"
import { getAccessContext, requireRole, HttpError } from "../lib/access.ts"
import { writeAudit } from "../lib/audit.ts"

const registry = Object.values(schema).filter(value => is(value, PgTable)).map(table => ({ table, config: getTableConfig(table as PgTable) }))
const editable: Record<string, string[]> = {
  program: ["code", "name", "faculty"], period: ["code", "name", "starts_on", "ends_on"],
  curriculum: ["code", "name"], cohort: ["name", "status"], course: ["code", "name", "name_en", "credits"],
  curriculum_course: ["semester", "required"], class_section: ["name", "code", "capacity"],
  student: ["name", "nim"], curriculum_outcome: ["name", "description", "target", "sort_order", "active"],
  course_outcome: ["description", "description_en", "weight", "target", "sort_order"],
  sub_outcome: ["description", "weight", "sort_order"],
}
const deletable = new Set(["program", "period", "curriculum", "cohort", "course", "curriculum_course", "class_section", "student", "curriculum_outcome", "course_outcome", "sub_outcome"])
const sensitive = new Set(["password", "token", "access_token", "refresh_token", "id_token", "value"])
function hidden(table: string, column: string) { return table.startsWith("auth_") && sensitive.has(column) }
function entry(name: string) { const item = registry.find(item => item.config.name === name); if (!item) throw new HttpError(404, "Tabel tidak ditemukan."); return item }
const ident = (name: string) => sql.identifier(name)
const label = (row: Record<string, unknown>) => String(row.name ?? row.title ?? row.code ?? row.email ?? row.nim ?? row.id)
const revision = (row: unknown) => createHash("sha256").update(JSON.stringify(row)).digest("hex")
async function recordLabel(table: string, row: Record<string, unknown>): Promise<string> {
  if (table === "curriculum_course") {
    const [course] = await rows("course", sql`id = ${row.course_id}`, 1)
    return course ? `${course.code} · ${course.name}` : label(row)
  }
  if (table === "obe_profile") {
    const [user] = await rows("auth_user", sql`id = ${row.user_id}`, 1)
    return user ? label(user) : label(row)
  }
  if (table === "enrollment") {
    const [student] = await rows("student", sql`id = ${row.student_id}`, 1)
    return student ? `${student.nim} · ${student.name}` : label(row)
  }
  if (table === "teaching_assignment") {
    const [profile] = await rows("obe_profile", sql`id = ${row.profile_id}`, 1)
    return profile ? recordLabel("obe_profile", profile) : label(row)
  }
  if (table === "calculation_run") return `Perhitungan · ${String(row.created_at).slice(0, 16)}`
  return label(row)
}
function selection(name: string) { return sql.join(entry(name).config.columns.filter(column => !hidden(name, column.name)).map(column => ident(column.name)), sql`, `) }
async function rows(name: string, where = sql`true`, limit = 50, offset = 0, sort = "id", direction = "asc") {
  return await db.execute(sql`select ${selection(name)} from ${ident(name)} where ${where} order by ${ident(sort)} ${direction === "desc" ? sql`desc` : sql`asc`} limit ${limit} offset ${offset}`) as unknown as Record<string, unknown>[]
}
function relations(name: string) {
  return registry.flatMap(item => item.config.foreignKeys.map(fk => { const ref = fk.reference(); return { table: item.config.name, column: ref.columns[0]!.name, targetTable: getTableConfig(ref.foreignTable).name, targetColumn: ref.foreignColumns[0]!.name, onDelete: fk.onDelete } })).filter(ref => ref.table === name || ref.targetTable === name)
}
async function access(request: Parameters<typeof getAccessContext>[0]) { const ctx = await getAccessContext(request); requireRole(ctx, ["SUPERADMIN"]); if (ctx.impersonation) throw new HttpError(403, "Kembali ke akun admin untuk mengelola database."); return ctx }

export async function registerDataBrowserRoutes(app: FastifyInstance) {
  app.get("/api/admin/database", async request => {
    await access(request)
    const [connection] = await sqlClient`select current_database() as database, current_user as username, inet_server_addr()::text as host, inet_server_port() as port, version() as version, pg_database_size(current_database())::text as size`
    const tables = await Promise.all(registry.map(async ({ config }) => {
      const [total] = await db.execute(sql`select count(*)::int as count from ${ident(config.name)}`)
      return { name: config.name, count: Number(total!.count), editable: editable[config.name] ?? [], deletable: deletable.has(config.name),
        columns: config.columns.map(column => ({ name: column.name, type: column.getSQLType(), nullable: !column.notNull, primary: column.primary, hasDefault: column.hasDefault, values: column.enumValues, hidden: hidden(config.name, column.name), editable: editable[config.name]?.includes(column.name) ?? false })),
        relations: relations(config.name), indexes: config.indexes.map(index => ({ name: index.config.name, unique: index.config.unique })),
      }
    }))
    return { connection, tables }
  })
  app.get("/api/admin/database/:table", async request => {
    await access(request); const { table } = z.object({ table: z.string() }).parse(request.params); const item = entry(table)
    const query = z.object({ q: z.string().max(200).default(""), page: z.coerce.number().int().min(0).default(0), sort: z.string().default("id"), direction: z.enum(["asc", "desc"]).default("asc"), column: z.string().optional(), value: z.string().optional() }).parse(request.query)
    const columns = item.config.columns.filter(column => !hidden(table, column.name))
    if (!columns.some(column => column.name === query.sort) || (query.column && !columns.some(column => column.name === query.column))) throw new HttpError(400, "Kolom tidak valid.")
    const search = query.q ? sql`(${sql.join(columns.filter(column => column.getSQLType() !== "jsonb").map(column => sql`cast(${ident(column.name)} as text) ilike ${`%${query.q}%`}`), sql` or `)})` : sql`true`
    const where = query.column ? sql`${search} and cast(${ident(query.column)} as text) = ${query.value ?? ""}` : search
    const [total] = await db.execute(sql`select count(*)::int as count from ${ident(table)} where ${where}`)
    const pageRows = await rows(table, where, 25, query.page * 25, query.sort, query.direction)
    const references: Record<string, Record<string, { table: string; id: string; label: string }>> = {}
    for (const ref of relations(table).filter(ref => ref.table === table)) {
      const values = [...new Set(pageRows.map(row => row[ref.column]).filter(value => value != null).map(String))]
      if (!values.length) continue
      const targets = await rows(ref.targetTable, sql`cast(${ident(ref.targetColumn)} as text) in (${sql.join(values.map(value => sql`${value}`), sql`, `)})`, 25)
      references[ref.column] = Object.fromEntries(await Promise.all(targets.map(async target => [String(target[ref.targetColumn]), { table: ref.targetTable, id: String(target.id), label: await recordLabel(ref.targetTable, target) }])))
    }
    return { rows: await Promise.all(pageRows.map(async row => ({ ...row, _label: await recordLabel(table, row), _references: Object.fromEntries(Object.entries(references).map(([column, targets]) => [column, targets[String(row[column])]])) }))), total: Number(total!.count), page: query.page }
  })
  app.get("/api/admin/database/:table/:id", async request => {
    await access(request); const { table, id } = z.object({ table: z.string(), id: z.string() }).parse(request.params)
    const [row] = await rows(table, sql`cast(id as text) = ${id}`, 1); if (!row) throw new HttpError(404, "Record tidak ditemukan.")
    const links = await Promise.all(relations(table).map(async ref => {
      const outgoing = ref.table === table; const target = outgoing ? ref.targetTable : ref.table; const column = outgoing ? ref.targetColumn : ref.column; const value = outgoing ? row[ref.column] : row[ref.targetColumn]
      const where = value == null ? sql`false` : sql`cast(${ident(column)} as text) = ${String(value)}`
      const [total] = await db.execute(sql`select count(*)::int as count from ${ident(target)} where ${where}`)
      return { ...ref, direction: outgoing ? "outgoing" : "incoming", target, count: Number(total!.count), records: await Promise.all((await rows(target, where, 8)).map(async record => ({ id: String(record.id), label: await recordLabel(target, record) }))), filter: { column, value: String(value ?? "") } }
    }))
    return { row, revision: revision(row), label: await recordLabel(table, row), links }
  })
  app.patch("/api/admin/database/:table/:id", async request => {
    const ctx = await access(request); const { table, id } = z.object({ table: z.string(), id: z.string() }).parse(request.params); entry(table)
    const input = z.object({ revision: z.string(), changes: z.record(z.string(), z.unknown()) }).parse(request.body)
    if (!Object.keys(input.changes).length || Object.keys(input.changes).some(key => !editable[table]?.includes(key))) throw new HttpError(400, "Field ini dikelola melalui workflow terkait.")
    await db.transaction(async tx => {
      const [before] = await tx.execute(sql`select ${selection(table)} from ${ident(table)} where cast(id as text) = ${id} for update`)
      if (!before) throw new HttpError(404, "Record tidak ditemukan.")
      if (revision(before) !== input.revision) throw new HttpError(409, "Record berubah. Muat ulang sebelum menyimpan.")
      const merged = { ...before, ...input.changes }
      for (const [key, value] of Object.entries(input.changes)) {
        const column = entry(table).config.columns.find(c => c.name === key)!
        if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw new HttpError(400, `${key} harus berupa nilai tunggal.`)
        if (column.notNull && (value === null || value === "")) throw new HttpError(400, `${key} wajib diisi.`)
        if (column.enumValues?.length && !column.enumValues.includes(String(value))) throw new HttpError(400, `${key} tidak valid.`)
        if (column.dataType === "boolean" && typeof value !== "boolean") throw new HttpError(400, `${key} harus boolean.`)
        if (["target", "weight"].includes(key) && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) throw new HttpError(400, `${key} harus 0–100.`)
        if (["credits", "capacity", "semester", "sort_order"].includes(key) && (!Number.isInteger(Number(value)) || Number(value) < (key === "sort_order" ? 0 : 1))) throw new HttpError(400, `${key} tidak valid.`)
      }
      if (table === "period" && String(merged.ends_on) < String(merged.starts_on)) throw new HttpError(400, "Tanggal akhir mendahului awal.")
      if (table === "class_section" && "capacity" in input.changes) { const [n] = await tx.execute(sql`select count(*)::int as count from enrollment where class_id = ${id} and status = 'active'`); if (Number(merged.capacity) < Number(n!.count)) throw new HttpError(400, "Kapasitas di bawah jumlah peserta aktif.") }
      const assignments = Object.entries(input.changes).map(([key, value]) => sql`${ident(key)} = ${value}`)
      assignments.push(sql`updated_at = now()`)
      await tx.execute(sql`update ${ident(table)} set ${sql.join(assignments, sql`, `)} where cast(id as text) = ${id}`)
      await writeAudit(tx, { actorProfileId: ctx.profile.id, action: "ADMIN_RECORD_UPDATED", entityType: table, entityId: id, before, after: input.changes })
    })
    return { ok: true }
  })
  app.delete("/api/admin/database/:table/:id", async request => {
    const ctx = await access(request); const { table, id } = z.object({ table: z.string(), id: z.string() }).parse(request.params); entry(table)
    const input = z.object({ revision: z.string() }).parse(request.body)
    if (!deletable.has(table)) throw new HttpError(409, "Record audit dan workflow tidak dapat dihapus melalui tabel.")
    await db.transaction(async tx => {
      const [before] = await tx.execute(sql`select ${selection(table)} from ${ident(table)} where cast(id as text) = ${id} for update`)
      if (!before) throw new HttpError(404, "Record tidak ditemukan.")
      if (revision(before) !== input.revision) throw new HttpError(409, "Record berubah. Muat ulang.")
      for (const ref of relations(table).filter(ref => ref.targetTable === table)) { const [n] = await tx.execute(sql`select count(*)::int as count from ${ident(ref.table)} where cast(${ident(ref.column)} as text) = ${id}`); if (Number(n!.count)) throw new HttpError(409, `Masih dipakai oleh ${n!.count} record ${ref.table}. Buka relasi untuk melihat detail.`) }
      await tx.execute(sql`delete from ${ident(table)} where cast(id as text) = ${id}`)
      await writeAudit(tx, { actorProfileId: ctx.profile.id, action: "ADMIN_RECORD_DELETED", entityType: table, entityId: id, before })
    })
    return { ok: true }
  })
}
