import { createParser } from "eventsource-parser"

import { AI_CHAT_TOOLS, executeAiTool } from "@/lib/ai-tools"
import type { AiChangeProposal, ChatAction, ChatMessage } from "@/lib/ai-types"
import type { RpsData } from "@/schemas/rps-schema"

const API_URL = "https://openrouter.ai/api/v1/chat/completions"
const MAX_TOOL_ROUNDS = 4

class ToolUnsupportedError extends Error {}

type ApiToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

type ApiMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ApiToolCall[]
  tool_call_id?: string
}

export type AiChatResult = {
  content: string
  actions: ChatAction[]
  proposals: AiChangeProposal[]
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
  return body?.error?.message || `OpenRouter mengembalikan status ${response.status}.`
}

function compactRpsContext(data: RpsData, activeStep: string) {
  return {
    activeStep,
    meta: data.meta,
    cpl: data.cpl.map((item, index) => ({ target: `cpl.${String.fromCharCode(97 + index)}.description`, ...item })).filter((item) => item.description.trim()),
    cpmk: data.cpmk.map((item, index) => ({ target: `cpmk.${index + 1}.text`, ...item })),
    schedule: data.schedule.map((item) => ({ target: `schedule.${item.week}.topic`, ...item })),
    assessments: data.assessments.map((item, index) => ({ target: `assessment.${index + 1}.name`, ...item })),
    rubrics: data.rubrics.map((item, index) => ({ target: `rubric.${index + 1}.criterion`, ...item })),
    references: data.references,
    validation: data.validation,
  }
}

async function streamCompletion(input: {
  apiKey: string
  model: string
  temperature: number
  messages: ApiMessage[]
  supportsTools: boolean
  signal?: AbortSignal
  onDelta: (text: string) => void
}) {
  const response = await fetch(API_URL, {
    method: "POST",
    signal: input.signal,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "RPS OBE Studio",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature,
      stream: true,
      messages: input.messages,
      ...(input.supportsTools ? { tools: AI_CHAT_TOOLS, tool_choice: "auto", parallel_tool_calls: false } : {}),
    }),
  })
  if (!response.ok) {
    const message = await responseError(response)
    if (input.supportsTools && [400, 404, 422].includes(response.status) && /(tool|function|unsupported|parameter)/i.test(message)) throw new ToolUnsupportedError(message)
    throw new Error(message)
  }
  if (!response.body) throw new Error("Browser tidak menerima stream respons dari OpenRouter.")

  let streamError = ""
  let content = ""
  const toolCallParts: Array<{ id: string; name: string; arguments: string }> = []
  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") return
      try {
        const chunk = JSON.parse(event.data) as {
          error?: { message?: string }
          choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }>
        }
        if (chunk.error) {
          streamError = chunk.error.message || "Provider model menghentikan respons."
          return
        }
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          content += delta.content
          input.onDelta(delta.content)
        }
        delta?.tool_calls?.forEach((part) => {
          const current = toolCallParts[part.index] ?? { id: "", name: "", arguments: "" }
          if (part.id) current.id += part.id
          if (part.function?.name) current.name += part.function.name
          if (part.function?.arguments) current.arguments += part.function.arguments
          toolCallParts[part.index] = current
        })
      } catch {
        // Payload non-JSON bukan konten chat dan aman diabaikan.
      }
    },
  })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parser.feed(decoder.decode(value, { stream: true }))
    if (streamError) {
      await reader.cancel()
      throw new Error(streamError)
    }
  }
  parser.feed(decoder.decode())
  if (streamError) throw new Error(streamError)
  const toolCalls: ApiToolCall[] = toolCallParts.filter(Boolean).map((call, index) => ({
    id: call.id || `tool-call-${index + 1}`,
    type: "function",
    function: { name: call.name, arguments: call.arguments },
  }))
  return { content, toolCalls }
}

export async function streamAiChat(input: {
  apiKey: string
  model: string
  temperature: number
  prompt: string
  history: ChatMessage[]
  data: RpsData
  activeStep: string
  supportsTools: boolean
  signal?: AbortSignal
  onDelta: (text: string) => void
}): Promise<AiChatResult> {
  const { apiKey, model, temperature, prompt, history, data, activeStep, supportsTools, signal, onDelta } = input
  if (!apiKey.trim()) throw new Error("Masukkan OpenRouter API key untuk menggunakan AI.")
  if (!model.trim()) throw new Error("Pilih atau masukkan model OpenRouter.")

  const recentMessages: ApiMessage[] = history
    .filter((message) => message.status === "done" && message.content.trim())
    .slice(-12)
    .map((message) => ({ role: message.role, content: message.content }))

  const messages: ApiMessage[] = [
    {
      role: "system",
      content: supportsTools
        ? "Anda adalah rekan kerja dosen untuk menyusun RPS berbasis Outcome-Based Education di perguruan tinggi Indonesia. Jawab dalam Bahasa Indonesia yang ringkas dan gunakan Markdown yang mudah dipindai. Gunakan hanya fakta dari konteks RPS dan pesan pengguna; jangan menciptakan CPL, identitas, kebijakan, atau referensi. Saat merujuk field spesifik, panggil link_to_editor agar pengguna mendapat tombol navigasi. Saat pengguna meminta perubahan konkret, panggil propose_rps_changes; perubahan selalu menunggu persetujuan dan Anda tidak boleh mengaku sudah menerapkannya. Untuk referensi yang secara eksplisit diberikan pengguna, gunakan add_reference. Jangan menulis tautan internal palsu di Markdown."
        : "Anda adalah rekan kerja dosen untuk menyusun RPS berbasis Outcome-Based Education di perguruan tinggi Indonesia. Jawab dalam Bahasa Indonesia yang ringkas dan gunakan Markdown yang mudah dipindai. Gunakan hanya fakta dari konteks RPS; jangan menciptakan CPL, identitas, kebijakan, atau referensi. Anda boleh memberi saran, tetapi jangan mengaku telah mengubah RPS. Model ini tidak menyediakan tool aplikasi, jadi jelaskan field yang perlu dibuka secara tekstual.",
    },
    {
      role: "system",
      content: `Snapshot RPS saat ini (bagian aktif: ${activeStep}):\n${JSON.stringify(compactRpsContext(data, activeStep))}`,
    },
    ...recentMessages,
    { role: "user", content: prompt },
  ]

  const actions: ChatAction[] = []
  const proposals: AiChangeProposal[] = []
  let content = ""
  for (let round = 0; round < (supportsTools ? MAX_TOOL_ROUNDS : 1); round += 1) {
    let result
    try {
      result = await streamCompletion({ apiKey, model, temperature, messages, supportsTools, signal, onDelta })
    } catch (error) {
      if (round === 0 && supportsTools && error instanceof ToolUnsupportedError) return streamAiChat({ ...input, supportsTools: false })
      throw error
    }
    if (content && result.content) {
      content += "\n\n"
      onDelta("\n\n")
    }
    content += result.content
    if (!result.toolCalls.length) return { content: content.trim(), actions, proposals }

    messages.push({ role: "assistant", content: result.content || null, tool_calls: result.toolCalls })
    for (const toolCall of result.toolCalls) {
      let output = ""
      try {
        const execution = executeAiTool(toolCall.function.name, toolCall.function.arguments, data)
        output = execution.output
        execution.actions.forEach((action) => {
          if (!actions.some((existing) => existing.target === action.target)) actions.push(action)
        })
        proposals.push(...execution.proposals)
      } catch (error) {
        output = JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Tool gagal dijalankan." })
      }
      messages.push({ role: "tool", content: output, tool_call_id: toolCall.id })
    }
  }
  if (actions.length || proposals.length) return { content: content.trim() || "Aksi sudah disiapkan untuk ditinjau.", actions, proposals }
  throw new Error("Model melewati batas putaran tool tanpa menyelesaikan jawaban.")
}
