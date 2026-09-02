import { z } from "zod"

import { createChatId, type AiChangeProposal, type ChatAction } from "@/lib/ai-types"
import { EDITOR_TARGETS, getEditorTarget, getEditorValue, type EditorValue } from "@/lib/editor-targets"
import { CPL_KEYS, rpsSchema, type RpsData } from "@/schemas/rps-schema"

type JsonSchema = Record<string, unknown>

export type AiToolDefinition = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}

export type AiToolExecution = {
  output: string
  actions: ChatAction[]
  proposals: AiChangeProposal[]
}

const targetIds = EDITOR_TARGETS.map((target) => target.id)

export const AI_CHAT_TOOLS: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "link_to_editor",
      description: "Buat tombol yang dapat diklik pengguna untuk membuka, menggulir, dan memfokuskan field RPS tertentu. Panggil tool ini setiap kali jawaban merujuk field atau baris spesifik.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["target"],
        properties: {
          target: { type: "string", enum: targetIds, description: "ID field editor yang tepat." },
          label: { type: "string", description: "Label tombol singkat, misalnya 'Buka CPMK 3'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_rps_changes",
      description: "Buat usulan perubahan field-level yang harus ditinjau dan disetujui pengguna. Jangan gunakan untuk mengarang identitas, CPL resmi, referensi, atau fakta yang tidak ada pada konteks/pesan pengguna.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "changes"],
        properties: {
          summary: { type: "string", description: "Ringkasan singkat tujuan perubahan." },
          changes: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["target", "value"],
              properties: {
                target: { type: "string", enum: targetIds },
                value: { oneOf: [{ type: "string" }, { type: "number" }, { type: "array", items: { type: "string" } }] },
              },
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_reference",
      description: "Tambahkan referensi yang diberikan pengguna ke slot referensi kosong berikutnya. Jangan pernah mengarang buku, DOI, penulis, atau tahun.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["collection", "value"],
        properties: {
          collection: { type: "string", enum: ["main", "additional"] },
          value: { type: "string", description: "Sitasi persis dari pengguna atau konteks RPS." },
        },
      },
    },
  },
]

const linkSchema = z.object({ target: z.string(), label: z.string().max(80).optional() })
const changesSchema = z.object({
  summary: z.string().min(1).max(240),
  changes: z.array(z.object({ target: z.string(), value: z.union([z.string(), z.number(), z.array(z.string())]) })).min(1).max(12),
})
const referenceSchema = z.object({ collection: z.enum(["main", "additional"]), value: z.string().min(1) })

function parseArguments(value: string): unknown {
  try { return JSON.parse(value || "{}") }
  catch { throw new Error("Argumen tool bukan JSON yang valid.") }
}

function normalizeValue(target: string, value: EditorValue): EditorValue {
  const definition = getEditorTarget(target)
  if (!definition) throw new Error(`Target editor tidak dikenal: ${target}`)
  if (definition.valueType === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${definition.label} memerlukan angka.`)
    return value
  }
  if (definition.valueType === "string-array") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${definition.label} memerlukan daftar teks.`)
    return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
  }
  if (typeof value !== "string") throw new Error(`${definition.label} memerlukan teks.`)
  return value
}

function createProposal(data: RpsData, summary: string, changes: Array<{ target: string; value: EditorValue }>): AiChangeProposal {
  const seen = new Set<string>()
  const operations = changes.map(({ target, value }) => {
    if (seen.has(target)) throw new Error(`Target ${target} disebut lebih dari sekali.`)
    seen.add(target)
    const definition = getEditorTarget(target)
    const before = getEditorValue(data, target)
    if (!definition || before === undefined) throw new Error(`Target editor tidak tersedia: ${target}`)
    const after = normalizeValue(target, value)
    if (target.startsWith("assessment.") && target.endsWith(".cpmk") && Array.isArray(after)) {
      const validCodes = new Set(data.cpmk.map((item) => item.code))
      const invalidCode = after.find((code) => !validCodes.has(code))
      if (invalidCode) throw new Error(`Kode CPMK tidak tersedia: ${invalidCode}`)
    }
    return { target, label: definition.label, before, after }
  }).filter((operation) => JSON.stringify(operation.before) !== JSON.stringify(operation.after))
  if (!operations.length) throw new Error("Usulan tidak mengubah nilai apa pun.")
  return { id: createChatId(), summary, operations, state: "pending", sourceUpdatedAt: data.updatedAt }
}

export function executeAiTool(name: string, rawArguments: string, data: RpsData): AiToolExecution {
  if (name === "link_to_editor") {
    const args = linkSchema.parse(parseArguments(rawArguments))
    const target = getEditorTarget(args.target)
    if (!target) throw new Error(`Target editor tidak dikenal: ${args.target}`)
    const action: ChatAction = { type: "navigate", target: target.id, label: args.label?.trim() || `Buka ${target.label}` }
    return { output: JSON.stringify({ ok: true, target: target.id, label: action.label, note: "Tombol navigasi ditampilkan kepada pengguna." }), actions: [action], proposals: [] }
  }
  if (name === "propose_rps_changes") {
    const args = changesSchema.parse(parseArguments(rawArguments))
    const proposal = createProposal(data, args.summary, args.changes)
    return { output: JSON.stringify({ ok: true, proposalId: proposal.id, changes: proposal.operations.map((item) => ({ target: item.target, label: item.label })), note: "Usulan menunggu persetujuan pengguna; belum diterapkan." }), actions: [], proposals: [proposal] }
  }
  if (name === "add_reference") {
    const args = referenceSchema.parse(parseArguments(rawArguments))
    const index = data.references[args.collection].findIndex((value) => !value.trim())
    if (index < 0) throw new Error(`Semua slot referensi ${args.collection === "main" ? "utama" : "pendukung"} sudah terisi.`)
    const target = `references.${args.collection}.${index + 1}`
    const proposal = createProposal(data, `Tambahkan referensi ${args.collection === "main" ? "utama" : "pendukung"}`, [{ target, value: args.value }])
    return { output: JSON.stringify({ ok: true, proposalId: proposal.id, target, note: "Referensi menunggu persetujuan pengguna; belum ditambahkan." }), actions: [], proposals: [proposal] }
  }
  throw new Error(`Tool tidak dikenal: ${name}`)
}

function setEditorValue(data: RpsData, target: string, value: EditorValue) {
  const parts = target.split(".")
  if (parts[0] === "meta") { (data.meta as Record<string, EditorValue>)[parts[1]] = value; return }
  if (parts[0] === "validation") { (data.validation as Record<string, EditorValue>)[parts[1]] = value; return }
  if (parts[0] === "cpl") {
    const index = CPL_KEYS.indexOf(parts[1] as (typeof CPL_KEYS)[number])
    if (index >= 0) (data.cpl[index] as unknown as Record<string, EditorValue>)[parts[2]] = value
    return
  }
  if (parts[0] === "cpmk") {
    const item = data.cpmk[Number(parts[1]) - 1]
    if (parts[2] === "maps") (item.maps as unknown as Record<string, EditorValue>)[parts[3]] = value
    else if (parts[2] === "code") {
      const oldCode = item.code
      item.code = value as string
      if (oldCode !== item.code) {
        data.schedule = data.schedule.map((row) => row.cpmk === oldCode ? { ...row, cpmk: item.code } : row)
        data.assessments = data.assessments.map((assessment) => ({ ...assessment, cpmk: assessment.cpmk.map((code) => code === oldCode ? item.code : code) }))
        data.rubrics = data.rubrics.map((rubric) => rubric.cpmk === oldCode ? { ...rubric, cpmk: item.code } : rubric)
      }
    } else (item as unknown as Record<string, EditorValue>)[parts[2]] = value
    return
  }
  if (parts[0] === "references") { data.references[parts[1] as "main" | "additional"][Number(parts[2]) - 1] = value as string; return }
  if (parts[0] === "schedule") { (data.schedule[Number(parts[1]) - 1] as unknown as Record<string, EditorValue>)[parts[2]] = value; return }
  if (parts[0] === "assessment") { (data.assessments[Number(parts[1]) - 1] as unknown as Record<string, EditorValue>)[parts[2]] = value; return }
  if (parts[0] === "rubric") (data.rubrics[Number(parts[1]) - 1] as unknown as Record<string, EditorValue>)[parts[2]] = value
}

export function applyAiChangeProposal(data: RpsData, proposal: AiChangeProposal): { ok: true; data: RpsData } | { ok: false; error: string } {
  if (proposal.sourceUpdatedAt !== data.updatedAt) return { ok: false, error: "Usulan sudah kedaluwarsa karena RPS berubah." }
  const next = structuredClone(data)
  try {
    proposal.operations.forEach((operation) => {
      const current = getEditorValue(data, operation.target)
      if (JSON.stringify(current) !== JSON.stringify(operation.before)) throw new Error(`${operation.label} telah berubah sejak usulan dibuat.`)
      setEditorValue(next, operation.target, normalizeValue(operation.target, operation.after))
    })
    next.updatedAt = new Date().toISOString()
    const parsed = rpsSchema.safeParse(next)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Hasil perubahan tidak valid." }
    return { ok: true, data: parsed.data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Usulan tidak dapat diterapkan." }
  }
}
