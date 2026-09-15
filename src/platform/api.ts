import type { AiDraft, AiTask } from "@/lib/ai-types"
import type { RpsData } from "@/schemas/rps-schema"
import { ApiError, errorMessage } from "./errors"
export { ApiError } from "./errors"

export type AccessContext = {
  user: { id: string; name: string; email: string }
  profile: { id: string; status: "active" | "inactive" }
  roles: Array<{ code: string; name: string; programId: string | null; programName: string | null }>
}

export type PlatformData = {
  access: AccessContext
  ai: { configured: boolean; model: string }
  programs: Array<{ id: string; code: string; name: string; faculty: string }>
  periods: Array<{ id: string; code: string; name: string; startsOn: string; endsOn: string }>
  curricula: Array<{ id: string; programId: string; code: string; name: string; version: number; status: string; programName: string }>
  cohorts: Array<{ id: string; programId: string; curriculumId: string; entryYear: number; name: string; status: string; programName: string; curriculumName: string }>
  courses: Array<{ id: string; programId: string; code: string; name: string; nameEn: string; credits: number; programName: string }>
  curriculumCourses: Array<{ id: string; curriculumId: string; courseId: string; semester: number; required: boolean; courseCode: string; courseName: string; curriculumName: string; programId: string }>
  classes: Array<{ id: string; code: string; name: string; status: string; capacity: number; cohortId: string; periodId: string; curriculumCourseId: string; courseName: string; courseCode: string; cohortName: string; periodName: string; programId: string }>
  rps: RpsSummary[]
  totals: { users: number; students: number; rps: number; achievements: number }
}

export type RpsSummary = { id: string; classId: string; title: string; version: number; status: string; updatedAt: string; classCode?: string; courseName?: string }
export type RpsDocument = RpsSummary & { revision: number; data: RpsData; authorProfileId: string; submittedAt: string | null; verifiedAt: string | null }
export type AiDraftResponse = { suggestionId: string; model: string; draft: AiDraft }

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? ""
  const text = await response.text()
  let body: unknown = text
  if (contentType.includes("json")) {
    try { body = JSON.parse(text) } catch { throw new ApiError("Respons server tidak valid. Coba lagi.", response.status) }
  }
  if (!response.ok) {
    throw new ApiError(errorMessage(body, response.status), response.status, body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : undefined)
  }
  return body as T
}

export const api = {
  get<T>(path: string) {
    return fetch(path, { credentials: "include" }).then(parseResponse<T>)
  },
  send<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown, headers?: Record<string, string>) {
    return fetch(path, {
      method,
      credentials: "include",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(parseResponse<T>)
  },
  async streamChat(input: { rpsId: string; prompt: string; history?: Array<{ role: "user" | "assistant"; content: string }>; signal?: AbortSignal; onChunk: (text: string) => void }) {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      credentials: "include",
      signal: input.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpsId: input.rpsId, prompt: input.prompt, history: input.history ?? [] }),
    })
    if (!response.ok || !response.body) return parseResponse<never>(response)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let completed = false
    try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split("\n"); buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as { type: string; text?: string; message?: string }
        if (event.type === "error") throw new ApiError(event.message || "Jawaban AI terputus. Coba lagi.", 502)
        if (event.type === "text") input.onChunk(event.text ?? "")
        if (event.type === "done") completed = true
      }
      if (done) break
    }
    if (!completed) throw new ApiError("Jawaban AI terputus sebelum selesai. Coba lagi.", 502)
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  },
  draft(rpsId: string, task: AiTask) {
    return api.send<AiDraftResponse>("/api/ai/drafts", "POST", { rpsId, task })
  },
}
