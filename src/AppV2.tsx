import { useEffect, useMemo, useRef, useState } from "react"
import {
  Bot, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Database, Download, FileJson, FileText, HardDrive, KeyRound, Loader2, LockKeyhole, MessageCircle,
  RotateCcw, Save, Settings2, Upload,
} from "lucide-react"

import undipLogo from "@/assets/logo-undip.png?inline"
import { AiChatPanel } from "@/components/ai/chat-panel"
import { DocumentPreview } from "@/components/rps/document-preview"
import { AssessmentSection, FinalSection, IdentitySection, OutcomesSection, ScheduleSection } from "@/components/rps/editor-sections"
import { StoragePrivacyDialog } from "@/components/storage/storage-privacy-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { useAppPersistence } from "@/hooks/use-app-persistence"
import { createChatId, type AiTask, type ChatMessage, type ChatRetry } from "@/lib/ai-types"
import { applyAiChangeProposal } from "@/lib/ai-tools"
import {
  clearSessionApiKey, forgetEncryptedApiKey, hasEncryptedApiKey, isWebCryptoAvailable,
  readSessionApiKey, saveEncryptedApiKey, unlockEncryptedApiKey, writeSessionApiKey,
} from "@/lib/credential-vault"
import { exportDocx, exportJson } from "@/lib/export"
import { getEditorTarget } from "@/lib/editor-targets"
import { exportImprovedHtml } from "@/lib/html-export"
import { streamAiChat } from "@/lib/openrouter-chat"
import { applyAiDraft, fetchOpenRouterModels, generateAiDraft, type OpenRouterModel } from "@/lib/openrouter"
import type { ApiKeyStorageMode } from "@/lib/persistence-types"
import { getCachedModels, putCachedModels } from "@/lib/storage"
import { overallCompletion, stepCompletion, validateRps } from "@/lib/validation"
import { useChatStore } from "@/stores/chat-store"
import { STEPS, useRpsStore, type StepId } from "@/stores/rps-store"

const stepMeta: Record<StepId, { label: string; short: string }> = {
  identity: { label: "Identitas & Referensi", short: "Identitas" },
  outcomes: { label: "CPL & CPMK", short: "Outcomes" },
  schedule: { label: "Jadwal 16 Minggu", short: "Jadwal" },
  assessment: { label: "Assessment & Rubrik", short: "Assessment" },
  final: { label: "Finalisasi", short: "Final" },
}

const taskPrompts: Record<AiTask, string> = {
  description: "Buatkan draft deskripsi mata kuliah bilingual dari identitas dan konteks RPS saat ini.",
  cpmk: "Buatkan draft CPMK bilingual dan mapping CPL yang terukur.",
  schedule: "Buatkan draft rencana pembelajaran lengkap untuk 16 minggu.",
  assessment: "Buatkan draft assessment beserta rubrik analitiknya.",
  review: "Review konsistensi seluruh RPS dan berikan temuan yang dapat ditindaklanjuti.",
}

function pricePerMillion(value?: string) {
  const number = Number(value)
  return Number.isFinite(number) ? `$${(number * 1_000_000).toFixed(number * 1_000_000 < 1 ? 2 : 1)}` : "—"
}

function AiSettingsDialog({ open, onOpenChange, apiKey, onApiKeyChange, storageMode, hasEncryptedKey, models, setModels, isLoading, setIsLoading, message, setMessage, onStorageModeChange, onSaveEncrypted, onUnlock, onForgetEncrypted, onOpenStorage }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: string
  onApiKeyChange: (key: string) => void
  storageMode: ApiKeyStorageMode
  hasEncryptedKey: boolean
  models: OpenRouterModel[]
  setModels: (models: OpenRouterModel[]) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  message: string
  setMessage: (message: string) => void
  onStorageModeChange: (mode: ApiKeyStorageMode) => void
  onSaveEncrypted: (pin: string) => Promise<void>
  onUnlock: (pin: string) => Promise<void>
  onForgetEncrypted: () => Promise<void>
  onOpenStorage: () => void
}) {
  const { selectedModel, setSelectedModel, temperature, setTemperature } = useRpsStore()
  const [pin, setPin] = useState("")
  const [vaultBusy, setVaultBusy] = useState(false)
  const [vaultMessage, setVaultMessage] = useState("")
  const loadModels = async () => {
    if (!apiKey.trim()) { setMessage("Masukkan API key terlebih dahulu."); return }
    setIsLoading(true); setMessage("")
    try {
      const result = await fetchOpenRouterModels(apiKey.trim())
      setModels(result)
      await putCachedModels(result)
      if (!selectedModel && result[0]) setSelectedModel(result[0].id)
      setMessage(`${result.length} model yang kompatibel untuk chat, tools, atau draft terstruktur ditemukan.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal memuat model.") }
    finally { setIsLoading(false) }
  }
  const vaultAction = async (action: () => Promise<void>, success: string) => {
    setVaultBusy(true); setVaultMessage("")
    try { await action(); setPin(""); setVaultMessage(success) }
    catch (error) { setVaultMessage(error instanceof Error ? error.message : "Operasi credential gagal.") }
    finally { setVaultBusy(false) }
  }
  const selected = models.find((model) => model.id === selectedModel)
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="size-4 text-primary" />OpenRouter & model</DialogTitle><DialogDescription>Pilih masa penyimpanan API key. Mode terenkripsi memakai PIN yang tidak pernah disimpan oleh aplikasi.</DialogDescription></DialogHeader>
      <div className="space-y-5">
        <div className="space-y-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="openrouter-key">OpenRouter API key</Label>{hasEncryptedKey && <Badge variant="outline"><LockKeyhole />Vault tersedia</Badge>}</div><div className="flex gap-2"><Input id="openrouter-key" type="password" autoComplete="off" value={apiKey} placeholder={hasEncryptedKey && !apiKey ? "Vault terkunci — buka dengan PIN" : "sk-or-v1-..."} onChange={(event) => onApiKeyChange(event.target.value)} /><Button variant="outline" onClick={loadModels} disabled={isLoading || !apiKey.trim()}>{isLoading ? <Loader2 className="animate-spin" /> : <Download />}Load models</Button></div><p className="text-xs text-muted-foreground">Gunakan key pribadi dengan spending limit. Konteks RPS dan chat dikirim ke OpenRouter serta provider model yang dipilih.</p></div>
        <div className="space-y-2"><Label htmlFor="credential-mode">Penyimpanan credential</Label><select id="credential-mode" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={storageMode} onChange={(event) => onStorageModeChange(event.target.value as ApiKeyStorageMode)}><option value="memory">Hanya tab ini</option><option value="session">Sampai browser ditutup</option><option value="encrypted" disabled={!isWebCryptoAvailable()}>Terenkripsi di perangkat (PIN)</option></select><p className="text-xs text-muted-foreground">API key tidak pernah dimasukkan ke export RPS atau backup workspace.</p></div>
        {storageMode === "encrypted" && <div className="border-l-2 border-primary bg-muted/30 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="size-4 text-primary" />Vault OpenRouter</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">AES-256-GCM · PBKDF2-SHA256 · 600.000 iterasi. PIN minimal 6 karakter dan harus dimasukkan lagi setelah reload.</p><div className="mt-3 flex gap-2"><Input type="password" autoComplete="off" value={pin} placeholder="PIN / passphrase" onChange={(event) => setPin(event.target.value)} /><Button variant="outline" disabled={vaultBusy || !pin} onClick={() => void vaultAction(() => hasEncryptedKey && !apiKey ? onUnlock(pin) : onSaveEncrypted(pin), hasEncryptedKey && !apiKey ? "API key berhasil dibuka untuk sesi ini." : "API key berhasil disimpan terenkripsi.")}>{vaultBusy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}{hasEncryptedKey && !apiKey ? "Buka" : "Simpan"}</Button></div>{vaultMessage && <p className="mt-2 text-xs text-muted-foreground">{vaultMessage}</p>}{hasEncryptedKey && <Button className="mt-3" size="sm" variant="ghost" onClick={() => void vaultAction(onForgetEncrypted, "Credential tersimpan telah dihapus.")} disabled={vaultBusy}>Lupakan API key tersimpan</Button>}</div>}
        <Separator />
        <div className="space-y-2"><Label htmlFor="model-id">Model ID</Label><Input id="model-id" list="openrouter-models" value={selectedModel} placeholder="provider/model" onChange={(event) => setSelectedModel(event.target.value)} /><datalist id="openrouter-models">{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist><p className="text-xs text-muted-foreground">Default: z-ai/glm-5.3-flash. Anda tetap dapat mengetik slug OpenRouter lain.</p></div>
        {selected && <div className="border-l-2 border-primary bg-muted/30 p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-medium">{selected.name}</div><div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selected.description}</div></div><div className="flex gap-1"><Badge variant="secondary">{Math.round(selected.context_length / 1000)}K</Badge><Badge variant={selected.supported_parameters?.includes("tools") ? "default" : "outline"}>{selected.supported_parameters?.includes("tools") ? "Tools" : "Chat saja"}</Badge></div></div><div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span>Input {pricePerMillion(selected.pricing?.prompt)}/M</span><span>Output {pricePerMillion(selected.pricing?.completion)}/M</span></div></div>}
        <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="temperature">Temperature</Label><Badge variant="outline">{temperature.toFixed(1)}</Badge></div><input id="temperature" className="w-full accent-[var(--primary)]" type="range" min="0" max="1" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></div>
        {message && <Alert><Bot /><AlertTitle>Status koneksi</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => { onOpenChange(false); onOpenStorage() }}><Database />Storage & Privacy</Button><Button onClick={() => onOpenChange(false)} disabled={!selectedModel}>Selesai</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function AppV2() {
  const store = useRpsStore()
  const { data, activeStep, setActiveStep, setData, selectedModel, temperature, apiKeyStorageMode, setApiKeyStorageMode } = store
  const { messages, appendMessage, updateMessage, clearMessages } = useChatStore()
  const persistence = useAppPersistence()
  const [apiKey, setApiKey] = useState("")
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [storageOpen, setStorageOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [hasEncryptedKey, setHasEncryptedKey] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState("")
  const [busyLabel, setBusyLabel] = useState("")
  const [streamingContent, setStreamingContent] = useState("")
  const [notice, setNotice] = useState("")
  const [pendingTarget, setPendingTarget] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const issues = useMemo(() => validateRps(data), [data])
  const completion = useMemo(() => overallCompletion(data), [data])
  const currentIndex = STEPS.indexOf(activeStep)
  const connected = Boolean(apiKey.trim() && selectedModel.trim())
  const selectedModelMetadata = models.find((model) => model.id === selectedModel)
  const toolsAvailable = selectedModelMetadata ? selectedModelMetadata.supported_parameters?.includes("tools") ?? false : true

  useEffect(() => {
    if (!persistence.hydrated || apiKeyStorageMode !== "session") return
    let cancelled = false
    void Promise.resolve(readSessionApiKey()).then((sessionKey) => {
      if (!cancelled) setApiKey(sessionKey)
    })
    return () => { cancelled = true }
  }, [persistence.hydrated, apiKeyStorageMode])

  useEffect(() => {
    if (!persistence.hydrated) return
    void hasEncryptedApiKey().then(setHasEncryptedKey).catch(() => setHasEncryptedKey(false))
    void getCachedModels<OpenRouterModel[]>().then((cached) => { if (cached?.length) setModels(cached) }).catch(() => undefined)
  }, [persistence.hydrated])

  useEffect(() => {
    if (!pendingTarget) return
    const definition = getEditorTarget(pendingTarget)
    if (!definition || definition.step !== activeStep) return
    let innerFrame = 0
    const frame = requestAnimationFrame(() => { innerFrame = requestAnimationFrame(() => {
      const element = Array.from(document.querySelectorAll<HTMLElement>("[data-editor-target]")).find((candidate) => candidate.dataset.editorTarget === pendingTarget)
      if (!element) return
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
      if (element.matches("input, textarea, select, button")) element.focus({ preventScroll: true })
      else element.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true })
      element.classList.add("editor-target-highlight")
      window.setTimeout(() => element.classList.remove("editor-target-highlight"), 1800)
      setPendingTarget("")
    }) })
    return () => { cancelAnimationFrame(frame); if (innerFrame) cancelAnimationFrame(innerFrame) }
  }, [activeStep, pendingTarget])

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    if (apiKeyStorageMode === "session") {
      try { writeSessionApiKey(value) }
      catch (error) { setSettingsMessage(error instanceof Error ? error.message : "Session storage gagal.") }
    }
  }

  const handleStorageModeChange = (mode: ApiKeyStorageMode) => {
    if (mode === "encrypted" && !isWebCryptoAvailable()) { setSettingsMessage("Web Crypto tidak tersedia; gunakan mode memory atau session."); return }
    if (mode === "session") {
      try { writeSessionApiKey(apiKey) }
      catch (error) { setSettingsMessage(error instanceof Error ? error.message : "Session storage gagal."); return }
    } else clearSessionApiKey()
    setApiKeyStorageMode(mode)
    setSettingsMessage(mode === "encrypted" ? "Masukkan PIN untuk menyimpan atau membuka credential terenkripsi." : "Mode penyimpanan credential diperbarui.")
  }

  const saveEncryptedCredential = async (pin: string) => {
    await saveEncryptedApiKey(apiKey, pin)
    clearSessionApiKey()
    setHasEncryptedKey(true)
    setApiKeyStorageMode("encrypted")
  }

  const unlockCredential = async (pin: string) => {
    const unlocked = await unlockEncryptedApiKey(pin)
    setApiKey(unlocked)
    setApiKeyStorageMode("encrypted")
  }

  const forgetCredential = async () => {
    await forgetEncryptedApiKey()
    clearSessionApiKey()
    setHasEncryptedKey(false)
    setApiKey("")
    setApiKeyStorageMode("memory")
  }

  if (!persistence.hydrated) return <div className="grid min-h-svh place-items-center bg-[#f4f7f9]"><div className="text-center"><div className="text-sm font-semibold text-primary">RPS OBE Studio</div><div className="mt-4 flex items-center gap-2 text-sm font-semibold"><Loader2 className="size-4 animate-spin text-primary" />Memuat workspace lokal…</div><p className="mt-1 text-xs text-muted-foreground">Menyiapkan IndexedDB dan memigrasikan autosave lama.</p></div></div>

  const requireConnection = () => {
    if (connected) return true
    setSettingsMessage("Hubungkan API key dan pilih model sebelum menggunakan AI.")
    setSettingsOpen(true)
    return false
  }

  const revealChat = () => {
    if (window.matchMedia("(max-width: 1120px)").matches) setChatOpen(true)
  }

  const navigateToTarget = (target: string) => {
    const definition = getEditorTarget(target)
    if (!definition) { setNotice("Tujuan editor tidak dikenali."); return }
    setChatOpen(false)
    setPendingTarget(target)
    setActiveStep(definition.step)
  }

  const sendChat = async (prompt: string) => {
    if (!requireConnection() || busyLabel) return
    revealChat()
    const userMessage: ChatMessage = { id: createChatId(), role: "user", content: prompt, createdAt: new Date().toISOString(), status: "done" }
    appendMessage(userMessage)
    const controller = new AbortController()
    abortRef.current = controller
    setBusyLabel("Menjawab…")
    setStreamingContent("")
    let streamed = ""
    try {
      const result = await streamAiChat({ apiKey, model: selectedModel, temperature, prompt, history: messages, data, activeStep, supportsTools: toolsAvailable, signal: controller.signal, onDelta: (text) => { streamed += text; setStreamingContent(streamed) } })
      const finalContent = result.content || (result.actions.length || result.proposals.length ? "Aksi sudah disiapkan untuk ditinjau." : "")
      if (!finalContent.trim()) throw new Error("Model menyelesaikan stream tanpa konten.")
      appendMessage({ id: createChatId(), role: "assistant", content: finalContent, actions: result.actions, proposals: result.proposals, createdAt: new Date().toISOString(), status: "done", model: selectedModel })
    } catch (error) {
      if (controller.signal.aborted) {
        if (streamed.trim()) appendMessage({ id: createChatId(), role: "assistant", content: streamed, createdAt: new Date().toISOString(), status: "cancelled", model: selectedModel })
      } else {
        appendMessage({ id: createChatId(), role: "assistant", content: streamed, createdAt: new Date().toISOString(), status: "error", model: selectedModel, error: error instanceof Error ? error.message : "Terjadi kesalahan saat memanggil model.", retry: { kind: "chat", prompt } })
      }
    } finally {
      abortRef.current = null
      setBusyLabel("")
      setStreamingContent("")
    }
  }

  const runAi = async (task: AiTask) => {
    if (!requireConnection() || busyLabel) return
    revealChat()
    const prompt = taskPrompts[task]
    appendMessage({ id: createChatId(), role: "user", content: prompt, createdAt: new Date().toISOString(), status: "done" })
    const controller = new AbortController()
    abortRef.current = controller
    setBusyLabel(task === "review" ? "Mereview RPS…" : "Menyusun draft…")
    try {
      const modelMetadata = models.find((model) => model.id === selectedModel)
      const generation = generateAiDraft({ apiKey, model: selectedModel, temperature, task, data, supportsJsonSchema: modelMetadata?.supported_parameters?.includes("structured_outputs") ?? false })
      const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new DOMException("Dibatalkan", "AbortError")), { once: true }))
      const draft = await Promise.race([generation, cancelled])
      appendMessage({ id: createChatId(), role: "assistant", content: task === "review" ? "Review selesai. Berikut temuan berdasarkan snapshot RPS saat ini." : "Draft terstruktur sudah siap. Periksa ringkasannya sebelum diterapkan ke form.", createdAt: new Date().toISOString(), status: "done", model: selectedModel, draft, draftState: "pending", sourceUpdatedAt: data.updatedAt })
    } catch (error) {
      if (controller.signal.aborted) {
        appendMessage({ id: createChatId(), role: "assistant", content: "Penyusunan draft dihentikan.", createdAt: new Date().toISOString(), status: "cancelled", model: selectedModel })
      } else {
        appendMessage({ id: createChatId(), role: "assistant", content: "Draft belum berhasil dibuat.", createdAt: new Date().toISOString(), status: "error", model: selectedModel, error: error instanceof Error ? error.message : "Terjadi kesalahan saat memanggil model.", retry: { kind: "task", task } })
      }
    } finally {
      abortRef.current = null
      setBusyLabel("")
    }
  }

  const applyDraftMessage = (id: string) => {
    const message = messages.find((item) => item.id === id)
    if (!message?.draft || message.draft.task === "review") return
    if (message.sourceUpdatedAt !== data.updatedAt) { setNotice("Draft sudah kedaluwarsa karena RPS berubah. Buat ulang draft sebelum menerapkan."); return }
    setData(applyAiDraft(data, message.draft))
    updateMessage(id, { draftState: "applied" })
    setNotice(`${message.draft.label} diterapkan. Periksa kembali perubahan sebelum finalisasi.`)
  }

  const applyProposal = (messageId: string, proposalId: string) => {
    const message = messages.find((item) => item.id === messageId)
    const proposal = message?.proposals?.find((item) => item.id === proposalId)
    if (!message || !proposal || proposal.state !== "pending") return
    const result = applyAiChangeProposal(data, proposal)
    if (!result.ok) { setNotice(result.error); return }
    setData(result.data)
    updateMessage(messageId, { proposals: message.proposals?.map((item) => item.id === proposalId ? { ...item, state: "applied" as const } : item) })
    setNotice(`${proposal.operations.length} perubahan diterapkan. Periksa kembali sebelum finalisasi.`)
    navigateToTarget(proposal.operations[0].target)
  }

  const discardProposal = (messageId: string, proposalId: string) => {
    const message = messages.find((item) => item.id === messageId)
    if (!message?.proposals) return
    updateMessage(messageId, { proposals: message.proposals.map((item) => item.id === proposalId ? { ...item, state: "discarded" as const } : item) })
  }

  const retry = (value: ChatRetry) => value.kind === "chat" ? void sendChat(value.prompt) : void runAi(value.task)
  const clearConversation = () => {
    if (messages.length && window.confirm("Hapus seluruh riwayat chat untuk RPS ini?")) clearMessages()
  }
  const importJson = async (file?: File) => {
    if (!file) return
    try {
      const result = store.importData(JSON.parse(await file.text()))
      if (result.ok) clearMessages()
      setNotice(result.ok ? "File JSON berhasil dibuka. Riwayat chat sebelumnya dibersihkan." : result.error)
    } catch { setNotice("File tidak dapat dibaca sebagai JSON RPS yang valid.") }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }
  const reset = () => { if (window.confirm("Mulai RPS baru? Data lokal dan riwayat chat saat ini akan diganti. Simpan JSON terlebih dahulu jika diperlukan.")) { store.reset(); clearMessages(); setNotice("RPS baru dibuat.") } }
  const loadExample = () => { store.loadExample(); clearMessages(); setNotice("Contoh Dasar Programming dimuat. Riwayat chat sebelumnya dibersihkan.") }
  const go = (direction: -1 | 1) => setActiveStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, currentIndex + direction))])
  const section = activeStep === "identity" ? <IdentitySection onAi={runAi} /> : activeStep === "outcomes" ? <OutcomesSection onAi={runAi} /> : activeStep === "schedule" ? <ScheduleSection onAi={runAi} /> : activeStep === "assessment" ? <AssessmentSection onAi={runAi} /> : <FinalSection onAi={runAi} />
  const chatPanel = <AiChatPanel messages={messages} streamingContent={streamingContent} busyLabel={busyLabel} connected={connected} model={selectedModel} toolsAvailable={toolsAvailable} currentUpdatedAt={data.updatedAt} issues={issues} onSend={(prompt) => void sendChat(prompt)} onTask={(task) => void runAi(task)} onCancel={() => abortRef.current?.abort()} onSettings={() => setSettingsOpen(true)} onClear={clearConversation} onApply={applyDraftMessage} onDiscard={(id) => updateMessage(id, { draftState: "discarded" })} onApplyProposal={applyProposal} onDiscardProposal={discardProposal} onNavigate={navigateToTarget} onRetry={retry} onIssueSelect={(step, target) => { if (target) navigateToTarget(target); else { setActiveStep(step); setChatOpen(false) } }} />
  const persistenceLabel = persistence.status === "saving" ? "Menyimpan…" : persistence.status === "saved" ? "Tersimpan" : persistence.status === "loading" ? "Memuat…" : "Storage bermasalah"

  return <div className="min-h-svh bg-[#f4f7f9] text-foreground">
    <header className="app-header no-print">
      <div className="app-brand"><img className="brand-logo" src={undipLogo} alt="Logo Universitas Diponegoro" /><div className="min-w-0"><div className="truncate font-heading text-sm font-semibold">RPS OBE Studio UNDIP</div><div className="truncate text-xs text-muted-foreground">FSM · Informatika</div></div></div>
      <div className="ml-auto flex items-center gap-2"><span className="header-save-status">{persistence.status === "saving" ? <Loader2 className="animate-spin" /> : <HardDrive />}{persistenceLabel}</span><Button className="mobile-chat-trigger" size="sm" variant="outline" onClick={() => setChatOpen(true)}><MessageCircle />AI Chat</Button><Button className="settings-button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 />AI & Model</Button><Button className="desktop-export-button" size="sm" onClick={() => exportImprovedHtml(data)}><Download />Export HTML</Button></div>
    </header>
    <div className="app-layout">
      <aside className="app-sidebar no-print">
        <div className="px-4 pb-4"><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium">Progress RPS</span><span className="tabular-nums text-muted-foreground">{completion}%</span></div><Progress value={completion} /></div>
        <nav className="space-y-1 px-2">{STEPS.map((step, index) => { const progress = stepCompletion(data, step); return <button key={step} type="button" className={`step-button ${step === activeStep ? "active" : ""}`} onClick={() => setActiveStep(step)}><span className="step-index">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{stepMeta[step].label}</span><span className="block text-xs text-muted-foreground">{progress}% siap</span></span>{progress === 100 && <Check className="size-4 text-primary" />}</button> })}</nav>
        <Separator className="my-4" />
        <div className="space-y-1 px-2"><Button className="w-full justify-start" variant="ghost" onClick={loadExample}><FileText />Muat contoh</Button><Button className="w-full justify-start" variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload />Buka JSON</Button><Button className="w-full justify-start" variant="ghost" onClick={() => exportJson(data)}><Save />Simpan JSON</Button><Button className="w-full justify-start" variant="ghost" onClick={() => setStorageOpen(true)}><Database />Storage & Privacy</Button><Button className="w-full justify-start text-muted-foreground" variant="ghost" onClick={reset}><RotateCcw />RPS baru</Button><input ref={fileInputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => importJson(event.target.files?.[0])} /></div>
      </aside>
      <main className="app-main">
        <div className="mobile-steps no-print">{STEPS.map((step) => <button key={step} type="button" className={step === activeStep ? "active" : ""} onClick={() => setActiveStep(step)}><span className="mobile-step-index">{STEPS.indexOf(step) + 1}</span><span>{stepMeta[step].short}</span></button>)}</div>
        {(persistence.status === "error" || persistence.status === "memory-only") && <Alert className="mb-5 no-print" variant="destructive"><HardDrive /><AlertTitle>Autosave IndexedDB tidak tersedia</AlertTitle><AlertDescription>{persistence.error || "Perubahan hanya bertahan selama tab ini terbuka. Segera simpan JSON sebagai backup."}</AlertDescription></Alert>}
        {notice && <Alert className="mb-5 no-print"><CheckCircle2 /><AlertTitle>Info</AlertTitle><AlertDescription>{notice}</AlertDescription><button className="absolute right-3 top-3 text-xs text-muted-foreground" onClick={() => setNotice("")}>Tutup</button></Alert>}
        <section className="editor-section no-print">{section}</section>
        {activeStep === "final" && <Card className="mt-6 overflow-visible print-preview-card"><CardHeader className="no-print"><CardTitle>Preview dokumen RPS</CardTitle><CardDescription>Print memakai A4 portrait untuk halaman umum dan landscape untuk jadwal. DOCX masih beta.</CardDescription><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => window.print()}><FileText />Print / PDF</Button><Button size="sm" variant="outline" onClick={() => exportImprovedHtml(data)}><Download />Standalone HTML</Button><Button size="sm" variant="outline" onClick={() => void exportDocx(data).catch((error) => setNotice(error instanceof Error ? error.message : "Export DOCX gagal."))}><FileText />DOCX beta</Button><Button size="sm" variant="outline" onClick={() => exportJson(data)}><FileJson />JSON</Button></div></CardHeader><CardContent className="p-0"><DocumentPreview data={data} /></CardContent></Card>}
        <div className="mt-8 flex items-center justify-between no-print"><Button variant="outline" disabled={currentIndex === 0} onClick={() => go(-1)}><ChevronLeft />Sebelumnya</Button><span className="text-xs text-muted-foreground">Langkah {currentIndex + 1} dari {STEPS.length}</span><Button disabled={currentIndex === STEPS.length - 1} onClick={() => go(1)}>Berikutnya<ChevronRight /></Button></div>
      </main>
      <aside className="app-inspector no-print">{chatPanel}</aside>
    </div>
    <Dialog open={chatOpen} onOpenChange={setChatOpen}><DialogContent className="ai-chat-dialog" showCloseButton><DialogHeader className="sr-only"><DialogTitle>Asisten RPS</DialogTitle><DialogDescription>Chat dan draft AI untuk RPS aktif.</DialogDescription></DialogHeader>{chatPanel}</DialogContent></Dialog>
    <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} apiKey={apiKey} onApiKeyChange={handleApiKeyChange} storageMode={apiKeyStorageMode} hasEncryptedKey={hasEncryptedKey} models={models} setModels={setModels} isLoading={loadingModels} setIsLoading={setLoadingModels} message={settingsMessage} setMessage={setSettingsMessage} onStorageModeChange={handleStorageModeChange} onSaveEncrypted={saveEncryptedCredential} onUnlock={unlockCredential} onForgetEncrypted={forgetCredential} onOpenStorage={() => setStorageOpen(true)} />
    <StoragePrivacyDialog open={storageOpen} onOpenChange={setStorageOpen} status={persistence.status} error={persistence.error} lastSavedAt={persistence.lastSavedAt} details={persistence.storageDetails} onRequestPersistence={persistence.requestPersistentStorage} onExport={persistence.exportWorkspace} onImport={persistence.importWorkspace} onClear={persistence.clearEverything} />
  </div>
}

export default AppV2
