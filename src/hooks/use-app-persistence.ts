import { useCallback, useEffect, useRef, useState } from "react"

import { downloadBlob } from "@/lib/export"
import type { AppPreferences } from "@/lib/persistence-types"
import {
  buildWorkspaceBackup, clearAllStoredData, loadWorkspace, migrateLegacyStorage,
  replaceMessages, restoreWorkspaceBackup, saveDocumentAndPreferences,
} from "@/lib/storage"
import { useChatStore } from "@/stores/chat-store"
import { useRpsStore } from "@/stores/rps-store"

export type PersistenceStatus = "loading" | "saving" | "saved" | "error" | "memory-only"

export type StorageDetails = {
  usage: number | null
  quota: number | null
  persistent: boolean | null
}

function currentPreferences(): AppPreferences {
  const state = useRpsStore.getState()
  return {
    activeStep: state.activeStep,
    selectedModel: state.selectedModel,
    temperature: state.temperature,
    apiKeyStorageMode: state.apiKeyStorageMode,
  }
}

async function readStorageDetails(): Promise<StorageDetails> {
  if (!navigator.storage) return { usage: null, quota: null, persistent: null }
  const [estimate, persistent] = await Promise.all([
    navigator.storage.estimate?.().catch(() => ({})),
    navigator.storage.persisted?.().catch(() => false),
  ]) as [StorageEstimate, boolean]
  return {
    usage: typeof estimate?.usage === "number" ? estimate.usage : null,
    quota: typeof estimate?.quota === "number" ? estimate.quota : null,
    persistent: typeof persistent === "boolean" ? persistent : null,
  }
}

export function useAppPersistence() {
  const [hydrated, setHydrated] = useState(false)
  const [status, setStatus] = useState<PersistenceStatus>("loading")
  const [error, setError] = useState("")
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [storageDetails, setStorageDetails] = useState<StorageDetails>({ usage: null, quota: null, persistent: null })
  const writeChain = useRef<Promise<void>>(Promise.resolve())

  const refreshStorageDetails = useCallback(async () => {
    try { setStorageDetails(await readStorageDetails()) } catch { setStorageDetails({ usage: null, quota: null, persistent: null }) }
  }, [])

  useEffect(() => {
    let disposed = false
    let rpsTimer: ReturnType<typeof setTimeout> | null = null
    let chatTimer: ReturnType<typeof setTimeout> | null = null
    let unsubscribeRps: () => void = () => undefined
    let unsubscribeChat: () => void = () => undefined

    const queueWrite = (operation: () => Promise<void>) => {
      if (disposed) return
      setStatus("saving")
      writeChain.current = writeChain.current
        .then(operation)
        .then(() => {
          if (!disposed) {
            setStatus("saved")
            setError("")
            setLastSavedAt(new Date().toISOString())
          }
        })
        .catch((reason) => {
          if (!disposed) {
            setStatus("error")
            setError(reason instanceof Error ? reason.message : "IndexedDB gagal menyimpan data.")
          }
        })
    }

    const saveRpsNow = () => {
      const state = useRpsStore.getState()
      queueWrite(() => saveDocumentAndPreferences(state.data, currentPreferences()))
    }
    const saveChatNow = () => queueWrite(() => replaceMessages(useChatStore.getState().messages))
    const scheduleRps = () => {
      if (rpsTimer) clearTimeout(rpsTimer)
      rpsTimer = setTimeout(saveRpsNow, 500)
    }
    const scheduleChat = () => {
      if (chatTimer) clearTimeout(chatTimer)
      chatTimer = setTimeout(saveChatNow, 500)
    }

    const initialize = async () => {
      try {
        await migrateLegacyStorage()
        const workspace = await loadWorkspace()
        if (disposed) return
        useRpsStore.getState().hydrate(workspace.document?.data ?? null, workspace.preferences)
        useChatStore.getState().hydrateMessages(workspace.messages)
        setHydrated(true)
        setStatus("saved")
        setLastSavedAt(workspace.document?.updatedAt ?? null)
        unsubscribeRps = useRpsStore.subscribe((state, previous) => {
          if (state.data !== previous.data || state.activeStep !== previous.activeStep || state.selectedModel !== previous.selectedModel || state.temperature !== previous.temperature || state.apiKeyStorageMode !== previous.apiKeyStorageMode) scheduleRps()
        })
        unsubscribeChat = useChatStore.subscribe((state, previous) => {
          if (state.messages !== previous.messages) scheduleChat()
        })
        if (!workspace.document) saveRpsNow()
        void refreshStorageDetails()
      } catch (reason) {
        if (disposed) return
        setHydrated(true)
        setStatus("memory-only")
        setError(reason instanceof Error ? reason.message : "IndexedDB tidak tersedia. Aplikasi berjalan tanpa persistence.")
      }
    }

    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        if (rpsTimer) clearTimeout(rpsTimer)
        if (chatTimer) clearTimeout(chatTimer)
        saveRpsNow()
        saveChatNow()
      }
    }
    void initialize()
    document.addEventListener("visibilitychange", flushWhenHidden)
    return () => {
      disposed = true
      if (rpsTimer) clearTimeout(rpsTimer)
      if (chatTimer) clearTimeout(chatTimer)
      unsubscribeRps()
      unsubscribeChat()
      document.removeEventListener("visibilitychange", flushWhenHidden)
    }
  }, [refreshStorageDetails])

  const requestPersistentStorage = useCallback(async () => {
    if (!navigator.storage?.persist) throw new Error("Browser ini tidak menyediakan permintaan persistent storage.")
    const granted = await navigator.storage.persist()
    await refreshStorageDetails()
    return granted
  }, [refreshStorageDetails])

  const exportWorkspace = useCallback(async () => {
    const state = useRpsStore.getState()
    await saveDocumentAndPreferences(state.data, currentPreferences())
    await replaceMessages(useChatStore.getState().messages)
    const backup = await buildWorkspaceBackup()
    if (!backup) throw new Error("Belum ada workspace yang dapat dibackup.")
    const code = backup.document.courseCode || "RPS"
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), `${code.replace(/[^a-z0-9_-]+/gi, "-")}-workspace.json`)
  }, [])

  const importWorkspace = useCallback(async (file: File) => {
    const restored = await restoreWorkspaceBackup(JSON.parse(await file.text()))
    useRpsStore.getState().hydrate(restored.data, restored.preferences)
    useChatStore.getState().hydrateMessages(restored.messages)
    setStatus("saved")
    setLastSavedAt(new Date().toISOString())
    await refreshStorageDetails()
  }, [refreshStorageDetails])

  const clearEverything = useCallback(async () => {
    await clearAllStoredData()
    try { window.sessionStorage.removeItem("rps-obe-openrouter-session") } catch { /* storage may be disabled */ }
    window.location.reload()
  }, [])

  return {
    hydrated,
    status,
    error,
    lastSavedAt,
    storageDetails,
    refreshStorageDetails,
    requestPersistentStorage,
    exportWorkspace,
    importWorkspace,
    clearEverything,
  }
}
