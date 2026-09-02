import { createParser } from "eventsource-parser"

import type { ChatMessage } from "@/lib/ai-types"
import type { RpsData } from "@/schemas/rps-schema"

const API_URL = "https://openrouter.ai/api/v1/chat/completions"

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
  return body?.error?.message || `OpenRouter mengembalikan status ${response.status}.`
}

function compactRpsContext(data: RpsData, activeStep: string) {
  return {
    activeStep,
    meta: data.meta,
    cpl: data.cpl.filter((item) => item.description.trim()),
    cpmk: data.cpmk.filter((item) => item.text.trim()),
    schedule: data.schedule.filter((item) => item.topic.trim() || item.outcome.trim()),
    assessments: data.assessments.filter((item) => item.name.trim()),
    rubrics: data.rubrics.filter((item) => item.criterion.trim()),
    references: {
      main: data.references.main.filter(Boolean),
      additional: data.references.additional.filter(Boolean),
    },
    validation: data.validation,
  }
}

export async function streamAiChat(input: {
  apiKey: string
  model: string
  temperature: number
  prompt: string
  history: ChatMessage[]
  data: RpsData
  activeStep: string
  signal?: AbortSignal
  onDelta: (text: string) => void
}) {
  const { apiKey, model, temperature, prompt, history, data, activeStep, signal, onDelta } = input
  if (!apiKey.trim()) throw new Error("Masukkan OpenRouter API key untuk menggunakan AI.")
  if (!model.trim()) throw new Error("Pilih atau masukkan model OpenRouter.")

  const recentMessages = history
    .filter((message) => message.status === "done" && message.content.trim())
    .slice(-12)
    .map((message) => ({ role: message.role, content: message.content }))

  const response = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "RPS OBE Studio",
    },
    body: JSON.stringify({
      model,
      temperature,
      stream: true,
      messages: [
        {
          role: "system",
          content: "Anda adalah rekan kerja dosen untuk menyusun RPS berbasis Outcome-Based Education di perguruan tinggi Indonesia. Jawab dalam Bahasa Indonesia yang ringkas dan gunakan Markdown yang mudah dipindai. Gunakan hanya fakta dari konteks RPS; jangan menciptakan CPL, identitas, kebijakan, atau referensi. Anda boleh memberi saran, tetapi jangan mengaku telah mengubah RPS. Untuk perubahan terstruktur, arahkan pengguna memakai aksi draft yang harus disetujui.",
        },
        {
          role: "system",
          content: `Snapshot ringkas RPS saat ini (bagian aktif: ${activeStep}):\n${JSON.stringify(compactRpsContext(data, activeStep))}`,
        },
        ...recentMessages,
        { role: "user", content: prompt },
      ],
    }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  if (!response.body) throw new Error("Browser tidak menerima stream respons dari OpenRouter.")

  let streamError = ""
  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") return
      try {
        const chunk = JSON.parse(event.data) as {
          error?: { message?: string }
          choices?: Array<{ delta?: { content?: string } }>
        }
        if (chunk.error) {
          streamError = chunk.error.message || "Provider model menghentikan respons."
          return
        }
        const content = chunk.choices?.[0]?.delta?.content
        if (content) onDelta(content)
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
}
