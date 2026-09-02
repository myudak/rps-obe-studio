export const AI_TASKS = ["description", "cpmk", "schedule", "assessment", "review"] as const

export type AiTask = (typeof AI_TASKS)[number]

export type AiDraft = {
  task: AiTask
  label: string
  payload: unknown
  warnings: string[]
}

export type ChatRetry =
  | { kind: "chat"; prompt: string }
  | { kind: "task"; task: AiTask }

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  status: "done" | "error" | "cancelled"
  model?: string
  draft?: AiDraft
  draftState?: "pending" | "applied" | "discarded"
  sourceUpdatedAt?: string
  error?: string
  retry?: ChatRetry
}

export function createChatId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
