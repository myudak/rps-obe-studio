import type { ChatMessage } from "@/lib/ai-types"
import type { RpsData } from "@/schemas/rps-schema"
import type { StepId } from "@/stores/rps-store"

export type ApiKeyStorageMode = "memory" | "session" | "encrypted"

export type AppPreferences = {
  activeStep: StepId
  selectedModel: string
  temperature: number
  apiKeyStorageMode: ApiKeyStorageMode
}

export type StoredDocument = {
  id: string
  data: RpsData
  courseCode: string
  courseName: string
  createdAt: string
  updatedAt: string
  lastOpenedAt: string
}

export type StoredMessage = ChatMessage & {
  documentId: string
}

export type EncryptedSecret = {
  key: "openrouter"
  version: 1
  algorithm: "AES-GCM"
  kdf: "PBKDF2-SHA-256"
  iterations: number
  salt: string
  iv: string
  ciphertext: string
  updatedAt: string
}

export type WorkspaceBackup = {
  format: "rps-obe-workspace"
  version: 1
  exportedAt: string
  document: StoredDocument
  preferences: AppPreferences
  messages: ChatMessage[]
}
