export const AI_TASKS = ["description", "cpmk", "schedule", "assessment", "review"] as const

export type AiTask = (typeof AI_TASKS)[number]

export type AiDraft = {
  task: AiTask
  label: string
  payload: unknown
  warnings: string[]
}

export type ChatAction = {
  type: "navigate"
  target: string
  label: string
}

export type AiChangeOperation = {
  target: string
  label: string
  before: string | number | string[]
  after: string | number | string[]
}

export type AiChangeProposal = {
  id: string
  summary: string
  operations: AiChangeOperation[]
  state: "pending" | "applied" | "discarded"
  sourceUpdatedAt: string
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
  actions?: ChatAction[]
  proposals?: AiChangeProposal[]
  sourceUpdatedAt?: string
  error?: string
  retry?: ChatRetry
}

export function createChatId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
