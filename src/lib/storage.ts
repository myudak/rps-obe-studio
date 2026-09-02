import { openDB, type DBSchema } from "idb"

import type { ChatMessage } from "@/lib/ai-types"
import type { AppPreferences, EncryptedSecret, StoredDocument, StoredMessage, WorkspaceBackup } from "@/lib/persistence-types"
import { rpsSchema, type RpsData } from "@/schemas/rps-schema"
import { DEFAULT_AI_MODEL, STEPS, type StepId } from "@/stores/rps-store"

export const CURRENT_DOCUMENT_ID = "current-rps"
const DATABASE_NAME = "rps-obe-studio"
const DATABASE_VERSION = 1
const APP_PREFERENCES_KEY = "app"
const MIGRATION_KEY = "localstorage-v1"

type PreferenceRecord = { key: string; value: unknown }
type CacheRecord = { key: string; value: unknown; fetchedAt: string; expiresAt?: string }

interface RpsObeDatabase extends DBSchema {
  documents: {
    key: string
    value: StoredDocument
    indexes: { "by-updated-at": string }
  }
  messages: {
    key: [string, string]
    value: StoredMessage
    indexes: { "by-document": string; "by-document-time": [string, string] }
  }
  preferences: {
    key: string
    value: PreferenceRecord
  }
  secrets: {
    key: string
    value: EncryptedSecret
  }
  cache: {
    key: string
    value: CacheRecord
  }
}

const dbPromise = openDB<RpsObeDatabase>(DATABASE_NAME, DATABASE_VERSION, {
  upgrade(db) {
    const documents = db.createObjectStore("documents", { keyPath: "id" })
    documents.createIndex("by-updated-at", "updatedAt")
    const messages = db.createObjectStore("messages", { keyPath: ["documentId", "id"] })
    messages.createIndex("by-document", "documentId")
    messages.createIndex("by-document-time", ["documentId", "createdAt"])
    db.createObjectStore("preferences", { keyPath: "key" })
    db.createObjectStore("secrets", { keyPath: "key" })
    db.createObjectStore("cache", { keyPath: "key" })
  },
})

function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && (STEPS as readonly string[]).includes(value)
}

function normalizePreferences(value: unknown): AppPreferences {
  const candidate = value as Partial<AppPreferences> | null
  const mode = candidate?.apiKeyStorageMode
  return {
    activeStep: isStepId(candidate?.activeStep) ? candidate.activeStep : "identity",
    selectedModel: typeof candidate?.selectedModel === "string" && candidate.selectedModel.trim() ? candidate.selectedModel : DEFAULT_AI_MODEL,
    temperature: typeof candidate?.temperature === "number" && Number.isFinite(candidate.temperature) ? Math.max(0, Math.min(1, candidate.temperature)) : 0.2,
    apiKeyStorageMode: mode === "session" || mode === "encrypted" ? mode : "memory",
  }
}

function safeLocalStorageGet(key: string) {
  try { return window.localStorage.getItem(key) } catch { return null }
}

function safeLocalStorageRemove(key: string) {
  try { window.localStorage.removeItem(key) } catch { /* storage may be disabled */ }
}

function parseLegacyState(key: string) {
  const raw = safeLocalStorageGet(key)
  if (!raw) return null
  try { return (JSON.parse(raw) as { state?: unknown }).state ?? null } catch { return null }
}

function createDocument(data: RpsData, createdAt = data.updatedAt): StoredDocument {
  return {
    id: CURRENT_DOCUMENT_ID,
    data,
    courseCode: data.meta.code,
    courseName: data.meta.courseName,
    createdAt,
    updatedAt: data.updatedAt,
    lastOpenedAt: new Date().toISOString(),
  }
}

export async function migrateLegacyStorage() {
  const db = await dbPromise
  if (await db.get("preferences", MIGRATION_KEY)) return false
  const existingDocument = await db.get("documents", CURRENT_DOCUMENT_ID)
  const legacyRps = parseLegacyState("rps-obe-studio-v1") as Record<string, unknown> | null
  const legacyChat = parseLegacyState("rps-obe-studio-chat-v1") as { messages?: unknown } | null
  const parsedData = rpsSchema.safeParse(legacyRps?.data)
  const preferences = normalizePreferences(legacyRps)
  const legacyMessages = Array.isArray(legacyChat?.messages) ? legacyChat.messages as ChatMessage[] : []
  const tx = db.transaction(["documents", "preferences", "messages"], "readwrite")
  if (!existingDocument && parsedData.success) await tx.objectStore("documents").put(createDocument(parsedData.data))
  if (!(await tx.objectStore("preferences").get(APP_PREFERENCES_KEY))) await tx.objectStore("preferences").put({ key: APP_PREFERENCES_KEY, value: preferences })
  if (legacyMessages.length) {
    for (const message of legacyMessages) {
      if (message && typeof message.id === "string") await tx.objectStore("messages").put({ ...message, documentId: CURRENT_DOCUMENT_ID })
    }
  }
  await tx.objectStore("preferences").put({ key: MIGRATION_KEY, value: { completedAt: new Date().toISOString() } })
  await tx.done
  safeLocalStorageRemove("rps-obe-studio-v1")
  safeLocalStorageRemove("rps-obe-studio-chat-v1")
  return Boolean(parsedData.success || legacyMessages.length)
}

export async function loadWorkspace() {
  const db = await dbPromise
  const [document, preferenceRecord, storedMessages] = await Promise.all([
    db.get("documents", CURRENT_DOCUMENT_ID),
    db.get("preferences", APP_PREFERENCES_KEY),
    db.getAllFromIndex("messages", "by-document", CURRENT_DOCUMENT_ID),
  ])
  const messages = storedMessages
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(({ documentId: _documentId, ...message }) => message)
  return { document: document ?? null, preferences: normalizePreferences(preferenceRecord?.value), messages }
}

export async function saveDocumentAndPreferences(data: RpsData, preferences: AppPreferences) {
  const db = await dbPromise
  const tx = db.transaction(["documents", "preferences"], "readwrite")
  const documents = tx.objectStore("documents")
  const existing = await documents.get(CURRENT_DOCUMENT_ID)
  await Promise.all([
    documents.put(createDocument(data, existing?.createdAt)),
    tx.objectStore("preferences").put({ key: APP_PREFERENCES_KEY, value: preferences }),
    tx.done,
  ])
}

export async function replaceMessages(messages: ChatMessage[]) {
  const db = await dbPromise
  const tx = db.transaction("messages", "readwrite")
  const index = tx.store.index("by-document")
  let cursor = await index.openKeyCursor(CURRENT_DOCUMENT_ID)
  while (cursor) {
    await tx.store.delete(cursor.primaryKey)
    cursor = await cursor.continue()
  }
  for (const message of messages) await tx.store.put({ ...message, documentId: CURRENT_DOCUMENT_ID })
  await tx.done
}

export async function getEncryptedSecret() {
  return (await dbPromise).get("secrets", "openrouter")
}

export async function putEncryptedSecret(secret: EncryptedSecret) {
  await (await dbPromise).put("secrets", secret)
}

export async function deleteEncryptedSecret() {
  await (await dbPromise).delete("secrets", "openrouter")
}

export async function getCachedModels<T>() {
  const record = await (await dbPromise).get("cache", "openrouter-models")
  if (!record || (record.expiresAt && record.expiresAt < new Date().toISOString())) return null
  return record.value as T
}

export async function putCachedModels(value: unknown, ttlHours = 24) {
  const fetchedAt = new Date()
  const expiresAt = new Date(fetchedAt.getTime() + ttlHours * 60 * 60 * 1000)
  await (await dbPromise).put("cache", { key: "openrouter-models", value, fetchedAt: fetchedAt.toISOString(), expiresAt: expiresAt.toISOString() })
}

export async function buildWorkspaceBackup(): Promise<WorkspaceBackup | null> {
  const workspace = await loadWorkspace()
  if (!workspace.document) return null
  return {
    format: "rps-obe-workspace",
    version: 1,
    exportedAt: new Date().toISOString(),
    document: workspace.document,
    preferences: workspace.preferences,
    messages: workspace.messages,
  }
}

export async function restoreWorkspaceBackup(value: unknown) {
  const backup = value as Partial<WorkspaceBackup> | null
  if (backup?.format !== "rps-obe-workspace" || backup.version !== 1) throw new Error("Format backup workspace tidak dikenali.")
  const parsedData = rpsSchema.safeParse(backup.document?.data)
  if (!parsedData.success) throw new Error(`Data RPS dalam backup tidak valid: ${parsedData.error.issues[0]?.message ?? "unknown"}`)
  const messages = Array.isArray(backup.messages) ? backup.messages.filter((message): message is ChatMessage => Boolean(message && typeof message.id === "string" && (message.role === "user" || message.role === "assistant"))) : []
  await saveDocumentAndPreferences(parsedData.data, normalizePreferences(backup.preferences))
  await replaceMessages(messages)
  return { data: parsedData.data, preferences: normalizePreferences(backup.preferences), messages }
}

export async function clearAllStoredData() {
  const db = await dbPromise
  const tx = db.transaction(["documents", "messages", "preferences", "secrets", "cache"], "readwrite")
  await Promise.all([
    tx.objectStore("documents").clear(),
    tx.objectStore("messages").clear(),
    tx.objectStore("preferences").clear(),
    tx.objectStore("secrets").clear(),
    tx.objectStore("cache").clear(),
  ])
  await tx.done
  safeLocalStorageRemove("rps-obe-studio-v1")
  safeLocalStorageRemove("rps-obe-studio-chat-v1")
}
