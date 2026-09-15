import { randomUUID } from "node:crypto"
import ExcelJS from "exceljs"
import { parse } from "csv-parse/sync"
import { and, desc, eq } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { db } from "../db/client.ts"
import { assessments, classSections, cohorts, enrollments, rpsDocuments, scores, students } from "../db/schema.ts"
import { getAccessContext, HttpError } from "../lib/access.ts"
import { classScope, requireClassRole } from "../lib/class-scope.ts"
import { writeAudit } from "../lib/audit.ts"
import { validateWorkbookArchive } from "../lib/workbook-limits.ts"

type Kind = "participants" | "scores"
type Row = Record<string, string>
const headers: Record<Kind, string[]> = { participants: ["nim", "nama", "kode_angkatan"], scores: ["nim", "kode_assessment", "nilai"] }
const previews = new Map<string, { actor: string; classId: string; kind: Kind; rows: Row[]; expires: number }>()
const params = z.object({ id: z.string().uuid(), kind: z.enum(["participants", "scores"]) })

export function validateImportRows(rows: Row[], kind: Kind) {
  const seen = new Set<string>()
  return rows.map((row, index) => {
    const errors: string[] = []
    if (headers[kind].some(key => !row[key]?.trim())) errors.push("Kolom wajib belum diisi.")
    if (!/^[\w.-]{1,40}$/.test(row.nim ?? "")) errors.push("NIM tidak valid; gunakan format teks.")
    if (kind === "scores" && (!row.nilai?.trim() || !Number.isFinite(Number(row.nilai)) || Number(row.nilai) < 0 || Number(row.nilai) > 100)) errors.push("Nilai harus 0–100.")
    const key = kind === "participants" ? row.nim : `${row.nim}:${row.kode_assessment}`
    if (seen.has(key)) errors.push("Baris duplikat dalam berkas.")
    seen.add(key)
    return { row: index + 2, values: row, errors, overwrite: false }
  })
}
export async function registerImportRoutes(app: FastifyInstance) {
  app.get("/api/imports/templates/:kind", async (request, reply) => {
    await getAccessContext(request)
    const { kind } = z.object({ kind: z.enum(["participants", "scores"]) }).parse(request.params)
    const { format } = z.object({ format: z.enum(["csv", "xlsx"]).default("csv") }).parse(request.query)
    reply.header("Content-Disposition", `attachment; filename="${kind}.${format}"`)
    if (format === "csv") return reply.type("text/csv; charset=utf-8").send(headers[kind].join(",") + "\r\n")
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Data")
    sheet.addRow(headers[kind]); sheet.columns.forEach(column => { column.width = 25; column.numFmt = "@" })
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(Buffer.from(await workbook.xlsx.writeBuffer()))
  })

  async function validate(classId: string, kind: Kind, rows: Row[], tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
    const result = validateImportRows(rows, kind)
    const [section] = await tx.select().from(classSections).where(eq(classSections.id, classId))
    if (!section || section.status === "closed") throw new HttpError(409, "Kelas ditutup atau tidak tersedia.")
    const [cohort] = await tx.select().from(cohorts).where(eq(cohorts.id, section.cohortId))
    const roster = await tx.select({ enrollment: enrollments, student: students }).from(enrollments).innerJoin(students, eq(enrollments.studentId, students.id)).where(eq(enrollments.classId, classId))
    const [rps] = await tx.select().from(rpsDocuments).where(and(eq(rpsDocuments.classId, classId), eq(rpsDocuments.status, "verified"))).orderBy(desc(rpsDocuments.version)).limit(1)
    const assessmentRows = rps ? await tx.select().from(assessments).where(eq(assessments.rpsId, rps.id)) : []
    const currentScores = await tx.select({ score: scores }).from(scores).innerJoin(enrollments, eq(scores.enrollmentId, enrollments.id)).where(eq(enrollments.classId, classId)).for("update", { of: scores })
    for (const item of result) {
      const row = item.values
      if (kind === "participants") {
        if (row.kode_angkatan !== String(cohort?.entryYear)) item.errors.push(`Kode angkatan harus ${cohort?.entryYear} (tahun angkatan kelas).`)
        if (roster.some(value => value.student.nim === row.nim)) item.errors.push("Mahasiswa sudah terdaftar di kelas.")
        const [student] = await tx.select().from(students).where(eq(students.nim, row.nim))
        if (student && (student.cohortId !== section.cohortId || student.name !== row.nama)) item.errors.push("NIM sudah terdaftar dengan identitas/angkatan berbeda.")
        if (roster.length + rows.length > section.capacity) item.errors.push("Jumlah peserta melebihi kapasitas kelas.")
      } else {
        const enrollment = roster.find(value => value.student.nim === row.nim)
        const assessment = assessmentRows.find(value => value.code === row.kode_assessment)
        if (!enrollment) item.errors.push("NIM tidak terdaftar di kelas.")
        if (!assessment) item.errors.push("Assessment tidak tersedia pada RPS verified terbaru.")
        const existing = currentScores.find(value => value.score.enrollmentId === enrollment?.enrollment.id && value.score.assessmentId === assessment?.id)?.score
        if (existing?.status === "released") item.errors.push("Nilai sudah dirilis dan tidak dapat ditimpa.")
        item.overwrite = existing?.status === "draft"
      }
    }
    return { result, section, roster, assessmentRows }
  }
  app.post("/api/classes/:id/imports/:kind/preview", async request => {
    const access = await getAccessContext(request); const { id, kind } = params.parse(request.params)
    const scope = await classScope(id, access); await requireClassRole(access, id, scope.programId, kind === "participants" ? ["ADMIN_PRODI"] : ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const file = await request.file(); if (!file) throw new HttpError(400, "Pilih CSV atau XLSX.")
    const buffer = await file.toBuffer(); if (buffer.length > 2 * 1024 * 1024) throw new HttpError(400, "Berkas impor maksimal 2 MB.")
    let rows: Row[]
    try {
      if (file.filename.toLowerCase().endsWith(".csv")) rows = parse(buffer, { columns: true, bom: true, skip_empty_lines: true, trim: true, max_record_size: 10000 }) as Row[]
      else if (file.filename.toLowerCase().endsWith(".xlsx")) {
        validateWorkbookArchive(buffer)
        const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
        const sheet = workbook.worksheets[0]; if (!sheet || sheet.rowCount > 1001 || sheet.columnCount > 20) throw new Error("Ukuran sheet tidak valid.")
        const keys = headers[kind]; if (keys.some((key, index) => sheet.getCell(1, index + 1).text.trim() !== key)) throw new Error("Header tidak sesuai template.")
        rows = []; sheet.eachRow((row, number) => { if (number > 1) rows.push(Object.fromEntries(keys.map((key, index) => { const cell = row.getCell(index + 1); if (cell.type === ExcelJS.ValueType.Formula) throw new Error("Formula tidak diizinkan."); return [key, cell.text.trim()] }))) })
      } else throw new Error("Gunakan CSV atau XLSX.")
    } catch { throw new HttpError(400, "Berkas tidak valid. Gunakan template, tanpa formula, maksimal 1.000 baris.") }
    if (!rows.length || rows.length > 1000 || headers[kind].some(key => !(key in rows[0]!))) throw new HttpError(400, "Gunakan header template dan 1–1.000 baris data.")
    const { result } = await db.transaction(tx => validate(id, kind, rows, tx))
    for (const [key, value] of previews) if (value.expires < Date.now()) previews.delete(key)
    if (previews.size >= 100) throw new HttpError(429, "Antrean impor penuh. Coba lagi nanti.")
    const token = randomUUID(); previews.set(token, { actor: access.profile.id, classId: id, kind, rows, expires: Date.now() + 15 * 60 * 1000 })
    return { token, rows: result, valid: result.every(row => !row.errors.length), overwrites: result.filter(row => row.overwrite).length }
  })
  app.post("/api/classes/:id/imports/:kind/commit", async request => {
    const access = await getAccessContext(request); const { id, kind } = params.parse(request.params)
    const scope = await classScope(id, access); await requireClassRole(access, id, scope.programId, kind === "participants" ? ["ADMIN_PRODI"] : ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const { token, overwrite } = z.object({ token: z.string().uuid(), overwrite: z.boolean().default(false) }).parse(request.body)
    const preview = previews.get(token)
    if (!preview || preview.actor !== access.profile.id || preview.classId !== id || preview.kind !== kind || preview.expires < Date.now()) throw new HttpError(409, "Preview kedaluwarsa. Unggah ulang berkas.")
    // Consume before awaiting to prevent duplicate concurrent commits of a token.
    previews.delete(token)
    return db.transaction(async tx => {
      await tx.select().from(classSections).where(eq(classSections.id, id)).for("update")
      const { result, section, roster, assessmentRows } = await validate(id, kind, preview.rows, tx)
      if (result.some(row => row.errors.length) || (!overwrite && result.some(row => row.overwrite))) throw new HttpError(409, "Data berubah atau penimpaan belum dikonfirmasi. Unggah ulang untuk validasi.")
      for (const row of preview.rows) {
        if (kind === "participants") {
          let [student] = await tx.select().from(students).where(eq(students.nim, row.nim!))
          if (!student) [student] = await tx.insert(students).values({ nim: row.nim!, name: row.nama!, cohortId: section.cohortId }).returning()
          await tx.insert(enrollments).values({ classId: id, studentId: student!.id })
        } else {
          const enrollment = roster.find(value => value.student.nim === row.nim)!.enrollment
          const assessment = assessmentRows.find(value => value.code === row.kode_assessment)!
          const [saved] = await tx.insert(scores).values({ enrollmentId: enrollment.id, assessmentId: assessment.id, rawScore: row.nilai!, gradedByProfileId: access.profile.id }).onConflictDoUpdate({ target: [scores.enrollmentId, scores.assessmentId, scores.attempt], set: { rawScore: row.nilai!, gradedByProfileId: access.profile.id, updatedAt: new Date() }, setWhere: eq(scores.status, "draft") }).returning()
          if (!saved) throw new HttpError(409, "Nilai sudah dirilis. Impor dibatalkan.")
        }
      }
      await writeAudit(tx, { actorProfileId: access.profile.id, action: "IMPORT_COMMITTED", entityType: "class", entityId: id, after: { kind, count: preview.rows.length, overwrite } })
      return { count: preview.rows.length }
    })
  })
}
