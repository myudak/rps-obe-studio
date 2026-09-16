import { createHash } from "node:crypto"

import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText, Output, streamText, type LanguageModel } from "ai"
import { and, eq, inArray } from "drizzle-orm"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import { AI_TASKS, aiDraftSchemas, aiTaskLabels, applyAiDraft, type AiDraft, type AiTask } from "../../src/lib/openrouter.ts"
import type { RpsData } from "../../src/schemas/rps-schema.ts"
import { db } from "../db/client.ts"
import { aiSuggestions, classSections, courses, curriculumCourses, rpsDocuments } from "../db/schema.ts"
import { env } from "../env.ts"
import { assertClassAccess, getAccessContext, HttpError, requireRole, type AccessContext } from "../lib/access.ts"
import { writeAudit } from "../lib/audit.ts"
import { classScope, isClassStaff, requireClassRole } from "../lib/class-scope.ts"

const idParams = z.object({ id: z.string().uuid() })
const chatInput = z.object({
  rpsId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(8_000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) })).max(20).default([]),
  temperature: z.number().min(0).max(1.5).default(0.3),
})
const draftInput = z.object({
  rpsId: z.string().uuid(),
  task: z.enum(AI_TASKS),
  temperature: z.number().min(0).max(1.5).default(0.2),
})

const taskInstructions: Record<AiTask, string> = {
  description: "Tulis deskripsi mata kuliah Indonesia dan Inggris yang ringkas, faktual, serta menjelaskan ruang lingkup dan kontribusi ke kompetensi prodi.",
  cpmk: "Susun tepat 6 CPMK bilingual dengan kata kerja Bloom terukur. Total bobot harus 100. Mapping hanya boleh menuju CPL resmi yang tersedia; 0=tidak terkait, 1=rendah, 2=sedang, 3=utama.",
  schedule: "Susun tepat 16 minggu. Minggu 8 adalah UTS dan minggu 16 adalah UAS. Selaraskan topik, Sub-CPMK, metode, media, dan assessment dengan CPMK yang telah disetujui.",
  assessment: "Susun tepat 6 bentuk assessment dengan total bobot 100 dan tepat 5 kriteria rubrik dengan total bobot 100. Semua CPMK harus terukur.",
  review: "Audit konsistensi OBE, keterukuran CPMK, mapping, jadwal, assessment, bobot, referensi, dan kelengkapan. Jangan mengubah data; berikan temuan yang dapat ditindaklanjuti.",
}

const systemPrompt = "Anda adalah asisten penyusunan RPS berbasis Outcome-Based Education untuk perguruan tinggi Indonesia. Gunakan hanya fakta yang diberikan. Jangan menciptakan CPL institusi, referensi, identitas, atau kebijakan baru. Setiap perubahan adalah proposal yang harus ditinjau dosen."

function hashData(data: RpsData) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex")
}

function getModel() {
  if (!env.openRouterApiKey) throw new HttpError(503, "OPENROUTER_API_KEY belum dikonfigurasi di server.")
  const openrouter = createOpenRouter({
    apiKey: env.openRouterApiKey,
    appName: "RPS OBE Studio",
    compatibility: "strict",
    extraBody: { provider: { sort: "throughput" } },
  })
  return openrouter.chat(env.openRouterModel)
}

async function getAuthorizedRps(rpsId: string, access: AccessContext) {
  const [row] = await db.select({ document: rpsDocuments, programId: courses.programId })
    .from(rpsDocuments)
    .innerJoin(classSections, eq(rpsDocuments.classId, classSections.id))
    .innerJoin(curriculumCourses, eq(classSections.curriculumCourseId, curriculumCourses.id))
    .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
    .where(eq(rpsDocuments.id, rpsId))
    .limit(1)
  if (!row) throw new HttpError(404, "RPS tidak ditemukan.")
  await assertClassAccess(access, row.document.classId, row.programId)
  if (row.document.status !== "verified" && !await isClassStaff(access, row.document.classId, row.programId)) throw new HttpError(403, "RPS belum diverifikasi.")
  return row.document
}

function draftContext(data: RpsData, task: AiTask) {
  return {
    meta: data.meta,
    officialCpl: data.cpl.filter((item) => item.description.trim()),
    approvedCpmk: data.cpmk,
    currentSchedule: task === "schedule" || task === "review" ? data.schedule : undefined,
    currentAssessments: task === "assessment" || task === "review" ? data.assessments : undefined,
    currentRubrics: task === "assessment" || task === "review" ? data.rubrics : undefined,
    references: data.references,
  }
}

export async function registerAiRoutes(app: FastifyInstance, modelOverride?: LanguageModel) {
  app.post("/api/ai/chat", async (request, reply) => {
    const access = await getAccessContext(request)
    const input = chatInput.parse(request.body)
    const document = await getAuthorizedRps(input.rpsId, access)
    const controller = new AbortController()
    const cancel = () => controller.abort()
    reply.raw.on("close", cancel)
    const result = streamText({
      onError: () => undefined,
      abortSignal: controller.signal,
      model: modelOverride ?? getModel(),
      system: systemPrompt,
      messages: [
        ...input.history,
        { role: "user", content: `${input.prompt}\n\nKonteks RPS aktif:\n${JSON.stringify(draftContext(document.data, "review"))}` },
      ],
      temperature: input.temperature,
    })

    reply.hijack()
    reply.raw.statusCode = 200
    reply.raw.setHeader("Content-Type", "application/x-ndjson; charset=utf-8")
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform")
    try {
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error
        if (part.type === "text-delta") reply.raw.write(JSON.stringify({ type: "text", text: part.text }) + "\n")
      }
      reply.raw.end(JSON.stringify({ type: "done" }) + "\n")
    } catch (error) {
      if (!reply.raw.headersSent) reply.raw.statusCode = 502
      request.log.error(error, "AI stream failed")
      reply.raw.end(JSON.stringify({ type: "error", message: "Jawaban AI terputus. Coba lagi." }) + "\n")
    } finally {
      reply.raw.off("close", cancel)
    }
  })

  app.post("/api/ai/drafts", async (request, reply) => {
    const startedAt = Date.now()
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const input = draftInput.parse(request.body)
    const document = await getAuthorizedRps(input.rpsId, access)
    await requireClassRole(access, document.classId, (await classScope(document.classId, access)).programId, ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    if (!["draft", "needs_revision"].includes(document.status)) throw new HttpError(409, "Dokumen tidak dapat diedit pada status ini.")
    const result = await generateText({
      model: modelOverride ?? getModel(),
      // All task schemas share the warnings field. The cast only guides the
      // generic inference; the runtime schema remains the selected task schema.
      output: Output.object({ schema: aiDraftSchemas[input.task] as typeof aiDraftSchemas.description }),
      system: systemPrompt,
      prompt: `${taskInstructions[input.task]}\n\nKonteks RPS:\n${JSON.stringify(draftContext(document.data, input.task))}`,
      temperature: input.temperature,
    })
    const payload = result.output
    const draft: AiDraft = { task: input.task, label: aiTaskLabels[input.task], payload, warnings: payload.warnings }
    const [suggestion] = await db.insert(aiSuggestions).values({
      rpsId: document.id,
      requestedByProfileId: access.profile.id,
      kind: input.task,
      model: env.openRouterModel,
      inputHash: hashData(document.data),
      proposal: draft as unknown as Record<string, unknown>,
      promptTokens: result.usage.inputTokens,
      completionTokens: result.usage.outputTokens,
      latencyMs: Date.now() - startedAt,
    }).returning()
    return reply.status(201).send({ suggestionId: suggestion?.id, model: env.openRouterModel, draft })
  })

  app.post("/api/ai/suggestions/:id/approve", async (request) => {
    const access = await getAccessContext(request)
    requireRole(access, ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"])
    const { id } = idParams.parse(request.params)
    const [suggestion] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1)
    if (!suggestion) throw new HttpError(404, "Proposal AI tidak ditemukan.")
    if (suggestion.decision !== "pending") throw new HttpError(409, "Proposal AI sudah diputuskan.")
    const document = await getAuthorizedRps(suggestion.rpsId, access)
    await requireClassRole(access, document.classId, (await classScope(document.classId, access)).programId, ["ADMIN_PRODI", "DOSEN_PENGAMPU"])
    if (!["draft", "needs_revision"].includes(document.status)) throw new HttpError(409, "RPS tidak dapat diedit pada status ini.")
    if (hashData(document.data) !== suggestion.inputHash) {
      await db.update(aiSuggestions).set({ decision: "stale", decidedByProfileId: access.profile.id, decidedAt: new Date(), updatedAt: new Date() }).where(eq(aiSuggestions.id, id))
      throw new HttpError(409, "RPS berubah sejak proposal dibuat. Buat proposal baru agar tidak menimpa perubahan terbaru.")
    }
    const draft = suggestion.proposal as AiDraft
    const nextData = applyAiDraft(document.data, draft)
    return db.transaction(async (tx) => {
      const now = new Date()
      const [updated] = await tx.update(rpsDocuments).set({ data: nextData, title: nextData.meta.courseName || document.title, revision: document.revision + 1, updatedAt: now }).where(and(eq(rpsDocuments.id, document.id), eq(rpsDocuments.revision, document.revision), inArray(rpsDocuments.status, ["draft", "needs_revision"]))).returning()
      if (!updated) throw new HttpError(409, "RPS berubah. Buat proposal baru.")
      const [decided] = await tx.update(aiSuggestions).set({ decision: "approved", decidedByProfileId: access.profile.id, decidedAt: now, updatedAt: now }).where(and(eq(aiSuggestions.id, id), eq(aiSuggestions.decision, "pending"))).returning()
      if (!decided) throw new HttpError(409, "Proposal sudah diputuskan.")
      await writeAudit(tx, { actorProfileId: access.profile.id, impersonatorProfileId: access.impersonation?.impersonatedByProfileId, action: "AI_SUGGESTION_APPROVED", entityType: "ai_suggestion", entityId: id, after: { rpsId: document.id, task: draft.task } })
      return updated
    })
  })

  app.post("/api/ai/suggestions/:id/reject", async (request) => {
    const access = await getAccessContext(request)
    const { id } = idParams.parse(request.params)
    const [suggestion] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1)
    if (!suggestion) throw new HttpError(404, "Proposal AI tidak ditemukan.")
    await getAuthorizedRps(suggestion.rpsId, access)
    const [updated] = await db.update(aiSuggestions).set({ decision: "rejected", decidedByProfileId: access.profile.id, decidedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiSuggestions.id, id), eq(aiSuggestions.decision, "pending"))).returning()
    if (!updated) throw new HttpError(409, "Proposal AI sudah diputuskan.")
    return updated
  })
}
