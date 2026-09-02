import { z } from "zod"

import { CPL_KEYS, type RpsData } from "@/schemas/rps-schema"

const API_BASE = "https://openrouter.ai/api/v1"

export type OpenRouterModel = {
  id: string
  name: string
  description: string
  context_length: number
  pricing: { prompt?: string; completion?: string }
  supported_parameters: string[]
}

export const AI_TASKS = ["description", "cpmk", "schedule", "assessment", "review"] as const
export type AiTask = (typeof AI_TASKS)[number]
export type AiDraft = { task: AiTask; label: string; payload: unknown; warnings: string[] }

const mapZod = z.object(Object.fromEntries(CPL_KEYS.map((key) => [key, z.number().int().min(0).max(3)])) as Record<(typeof CPL_KEYS)[number], z.ZodNumber>)
const schemas = {
  description: z.object({ descriptionId: z.string(), descriptionEn: z.string(), warnings: z.array(z.string()) }),
  cpmk: z.object({ cpmk: z.array(z.object({ code: z.string(), text: z.string(), en: z.string(), weight: z.number(), maps: mapZod })).length(6), warnings: z.array(z.string()) }),
  schedule: z.object({ schedule: z.array(z.object({ week: z.number().int(), cpmk: z.string(), topic: z.string(), subtopic: z.string(), outcome: z.string(), method: z.string(), media: z.string(), assessment: z.string() })).length(16), warnings: z.array(z.string()) }),
  assessment: z.object({
    assessments: z.array(z.object({ name: z.string(), weight: z.number(), cpmk: z.array(z.string()), notes: z.string() })).length(6),
    rubrics: z.array(z.object({ criterion: z.string(), cpmk: z.string(), weight: z.number(), level4: z.string(), level3: z.string(), level2: z.string(), level1: z.string() })).length(5),
    warnings: z.array(z.string()),
  }),
  review: z.object({ summary: z.string(), issues: z.array(z.object({ severity: z.enum(["info", "warning", "error"]), section: z.string(), message: z.string(), suggestion: z.string() })), warnings: z.array(z.string()) }),
}

const mappingProperties = Object.fromEntries(CPL_KEYS.map((key) => [key, { type: "integer", minimum: 0, maximum: 3 }]))
const jsonSchemas: Record<AiTask, object> = {
  description: {
    type: "object", additionalProperties: false,
    properties: { descriptionId: { type: "string" }, descriptionEn: { type: "string" }, warnings: { type: "array", items: { type: "string" } } },
    required: ["descriptionId", "descriptionEn", "warnings"],
  },
  cpmk: {
    type: "object", additionalProperties: false,
    properties: {
      cpmk: { type: "array", minItems: 6, maxItems: 6, items: { type: "object", additionalProperties: false, properties: { code: { type: "string" }, text: { type: "string" }, en: { type: "string" }, weight: { type: "number" }, maps: { type: "object", additionalProperties: false, properties: mappingProperties, required: [...CPL_KEYS] } }, required: ["code", "text", "en", "weight", "maps"] } },
      warnings: { type: "array", items: { type: "string" } },
    }, required: ["cpmk", "warnings"],
  },
  schedule: {
    type: "object", additionalProperties: false,
    properties: {
      schedule: { type: "array", minItems: 16, maxItems: 16, items: { type: "object", additionalProperties: false, properties: { week: { type: "integer" }, cpmk: { type: "string" }, topic: { type: "string" }, subtopic: { type: "string" }, outcome: { type: "string" }, method: { type: "string" }, media: { type: "string" }, assessment: { type: "string" } }, required: ["week", "cpmk", "topic", "subtopic", "outcome", "method", "media", "assessment"] } },
      warnings: { type: "array", items: { type: "string" } },
    }, required: ["schedule", "warnings"],
  },
  assessment: {
    type: "object", additionalProperties: false,
    properties: {
      assessments: { type: "array", minItems: 6, maxItems: 6, items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, weight: { type: "number" }, cpmk: { type: "array", items: { type: "string" } }, notes: { type: "string" } }, required: ["name", "weight", "cpmk", "notes"] } },
      rubrics: { type: "array", minItems: 5, maxItems: 5, items: { type: "object", additionalProperties: false, properties: { criterion: { type: "string" }, cpmk: { type: "string" }, weight: { type: "number" }, level4: { type: "string" }, level3: { type: "string" }, level2: { type: "string" }, level1: { type: "string" } }, required: ["criterion", "cpmk", "weight", "level4", "level3", "level2", "level1"] } },
      warnings: { type: "array", items: { type: "string" } },
    }, required: ["assessments", "rubrics", "warnings"],
  },
  review: {
    type: "object", additionalProperties: false,
    properties: {
      summary: { type: "string" },
      issues: { type: "array", items: { type: "object", additionalProperties: false, properties: { severity: { type: "string", enum: ["info", "warning", "error"] }, section: { type: "string" }, message: { type: "string" }, suggestion: { type: "string" } }, required: ["severity", "section", "message", "suggestion"] } },
      warnings: { type: "array", items: { type: "string" } },
    }, required: ["summary", "issues", "warnings"],
  },
}

const taskLabels: Record<AiTask, string> = {
  description: "Draft deskripsi mata kuliah",
  cpmk: "Draft CPMK dan mapping CPL",
  schedule: "Draft jadwal 16 minggu",
  assessment: "Draft assessment dan rubrik",
  review: "Review konsistensi RPS",
}

export async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  const response = await fetch(`${API_BASE}/models?output_modalities=text`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!response.ok) throw new Error(`Gagal memuat model (${response.status}). Periksa API key atau koneksi.`)
  const json = await response.json() as { data?: OpenRouterModel[] }
  return (json.data ?? [])
    .filter((model) => model.supported_parameters?.includes("structured_outputs") || model.supported_parameters?.includes("response_format"))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function generateAiDraft(input: { apiKey: string; model: string; temperature: number; task: AiTask; data: RpsData; supportsJsonSchema?: boolean }): Promise<AiDraft> {
  const { apiKey, model, temperature, task, data, supportsJsonSchema = false } = input
  if (!apiKey.trim()) throw new Error("Masukkan OpenRouter API key untuk menggunakan AI.")
  if (!model.trim()) throw new Error("Pilih atau masukkan model OpenRouter.")
  const activeCpl = data.cpl.filter((item) => item.description.trim())
  const taskInstruction: Record<AiTask, string> = {
    description: "Tulis deskripsi mata kuliah Indonesia dan Inggris yang ringkas, faktual, serta menjelaskan ruang lingkup dan kontribusi ke kompetensi prodi.",
    cpmk: "Susun tepat 6 CPMK bilingual dengan kata kerja Bloom terukur. Total bobot harus 100. Mapping hanya boleh menuju CPL resmi yang tersedia; 0=tidak terkait, 1=rendah, 2=sedang, 3=utama.",
    schedule: "Susun tepat 16 minggu. Minggu 8 adalah UTS dan minggu 16 adalah UAS. Selaraskan topik, Sub-CPMK, metode, media, dan assessment dengan CPMK yang telah disetujui.",
    assessment: "Susun tepat 6 bentuk assessment dengan total bobot 100 dan tepat 5 kriteria rubrik dengan total bobot 100. Semua CPMK harus terukur.",
    review: "Audit konsistensi OBE, keterukuran CPMK, mapping, jadwal, assessment, bobot, referensi, dan kelengkapan. Jangan mengubah data; berikan temuan yang dapat ditindaklanjuti.",
  }
  const context = {
    meta: data.meta,
    officialCpl: activeCpl,
    approvedCpmk: data.cpmk,
    currentSchedule: task === "schedule" || task === "review" ? data.schedule : undefined,
    currentAssessments: task === "assessment" || task === "review" ? data.assessments : undefined,
    currentRubrics: task === "assessment" || task === "review" ? data.rubrics : undefined,
    references: data.references,
  }
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "RPS OBE Studio" },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: "Anda adalah asisten penyusunan RPS berbasis Outcome-Based Education untuk perguruan tinggi Indonesia. Gunakan hanya fakta yang diberikan. Jangan menciptakan CPL institusi, referensi, identitas, atau kebijakan baru. Semua keluaran harus dapat ditinjau dosen dan mengikuti JSON Schema." },
        { role: "user", content: `${taskInstruction[task]}\n\nKonteks RPS:\n${JSON.stringify(context)}\n\nStruktur JSON yang wajib diikuti:\n${JSON.stringify(jsonSchemas[task])}` },
      ],
      response_format: supportsJsonSchema
        ? { type: "json_schema", json_schema: { name: `rps_${task}`, strict: true, schema: jsonSchemas[task] } }
        : { type: "json_object" },
      provider: { require_parameters: true },
      plugins: [{ id: "response-healing" }],
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(error?.error?.message || `OpenRouter mengembalikan status ${response.status}.`)
  }
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = result.choices?.[0]?.message?.content
  if (!content) throw new Error("Model tidak mengembalikan konten yang dapat digunakan.")
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new Error("Respons model bukan JSON valid. Coba model yang mendukung Structured Outputs.") }
  const validated = schemas[task].safeParse(parsed)
  if (!validated.success) throw new Error(`Respons model tidak sesuai schema: ${validated.error.issues[0]?.message ?? "unknown"}`)
  return { task, label: taskLabels[task], payload: validated.data, warnings: validated.data.warnings }
}

export function applyAiDraft(data: RpsData, draft: AiDraft): RpsData {
  const payload = draft.payload as Record<string, unknown>
  if (draft.task === "description") return { ...data, meta: { ...data.meta, descriptionId: String(payload.descriptionId ?? ""), descriptionEn: String(payload.descriptionEn ?? "") }, updatedAt: new Date().toISOString() }
  if (draft.task === "cpmk") return { ...data, cpmk: payload.cpmk as RpsData["cpmk"], updatedAt: new Date().toISOString() }
  if (draft.task === "schedule") return { ...data, schedule: payload.schedule as RpsData["schedule"], updatedAt: new Date().toISOString() }
  if (draft.task === "assessment") return { ...data, assessments: payload.assessments as RpsData["assessments"], rubrics: payload.rubrics as RpsData["rubrics"], updatedAt: new Date().toISOString() }
  return data
}
