import { useMemo, useRef, useState } from "react"
import {
  Bot, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert,
  ClipboardCheck, Download, FileJson, FileText, KeyRound, Loader2,
  RotateCcw, Save, Settings2, Sparkles, Target, Upload, WandSparkles,
} from "lucide-react"

import undipLogo from "@/assets/logo-undip.png?inline"
import { DocumentPreview } from "@/components/rps/document-preview"
import { AssessmentSection, FinalSection, IdentitySection, OutcomesSection, ScheduleSection } from "@/components/rps/editor-sections"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { exportDocx, exportHtml, exportJson } from "@/lib/export"
import { applyAiDraft, fetchOpenRouterModels, generateAiDraft, type AiDraft, type AiTask, type OpenRouterModel } from "@/lib/openrouter"
import { overallCompletion, stepCompletion, validateRps, type ValidationIssue } from "@/lib/validation"
import { STEPS, useRpsStore, type StepId } from "@/stores/rps-store"

const stepMeta: Record<StepId, { label: string; short: string; icon: React.ReactNode }> = {
  identity: { label: "Identitas & Referensi", short: "Identitas", icon: <FileText /> },
  outcomes: { label: "CPL & CPMK", short: "Outcomes", icon: <Target /> },
  schedule: { label: "Jadwal 16 Minggu", short: "Jadwal", icon: <CalendarDays /> },
  assessment: { label: "Assessment & Rubrik", short: "Assessment", icon: <ClipboardCheck /> },
  final: { label: "Finalisasi", short: "Final", icon: <CheckCircle2 /> },
}

function issueIcon(issue: ValidationIssue) {
  if (issue.level === "pass") return <Check className="size-4 text-primary" />
  return <CircleAlert className={issue.level === "error" ? "size-4 text-destructive" : "size-4 text-amber-600"} />
}

function pricePerMillion(value?: string) {
  const number = Number(value)
  return Number.isFinite(number) ? `$${(number * 1_000_000).toFixed(number * 1_000_000 < 1 ? 2 : 1)}` : "—"
}

function AiSettingsDialog({
  open, onOpenChange, apiKey, setApiKey, models, setModels, isLoading, setIsLoading, message, setMessage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: string
  setApiKey: (key: string) => void
  models: OpenRouterModel[]
  setModels: (models: OpenRouterModel[]) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  message: string
  setMessage: (message: string) => void
}) {
  const { selectedModel, setSelectedModel, temperature, setTemperature } = useRpsStore()
  const loadModels = async () => {
    if (!apiKey.trim()) { setMessage("Masukkan API key terlebih dahulu."); return }
    setIsLoading(true); setMessage("")
    try {
      const result = await fetchOpenRouterModels(apiKey.trim())
      setModels(result)
      if (!selectedModel && result[0]) setSelectedModel(result[0].id)
      setMessage(`${result.length} model yang mendukung output terstruktur ditemukan.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal memuat model.") }
    finally { setIsLoading(false) }
  }
  const selected = models.find((model) => model.id === selectedModel)
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="size-4 text-primary" />OpenRouter & model</DialogTitle><DialogDescription>API key hanya disimpan di memory tab ini dan tidak ikut autosave atau export.</DialogDescription></DialogHeader>
      <div className="space-y-5">
        <div className="space-y-2"><Label htmlFor="openrouter-key">OpenRouter API key</Label><div className="flex gap-2"><Input id="openrouter-key" type="password" autoComplete="off" value={apiKey} placeholder="sk-or-v1-..." onChange={(event) => setApiKey(event.target.value)} /><Button variant="outline" onClick={loadModels} disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin" /> : <Download />}Load models</Button></div><p className="text-xs text-muted-foreground">Gunakan key pribadi dengan spending limit. Jangan membagikan portable HTML yang masih berisi key.</p></div>
        <Separator />
        <div className="space-y-2"><Label htmlFor="model-id">Model ID</Label><Input id="model-id" list="openrouter-models" value={selectedModel} placeholder="provider/model" onChange={(event) => setSelectedModel(event.target.value)} /><datalist id="openrouter-models">{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist><p className="text-xs text-muted-foreground">Pilih dari katalog atau ketik slug model secara manual.</p></div>
        {selected && <div className="rounded-3xl border bg-muted/30 p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-medium">{selected.name}</div><div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selected.description}</div></div><Badge variant="secondary">{Math.round(selected.context_length / 1000)}K</Badge></div><div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span>Input {pricePerMillion(selected.pricing?.prompt)}/M</span><span>Output {pricePerMillion(selected.pricing?.completion)}/M</span></div></div>}
        <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="temperature">Temperature</Label><Badge variant="outline">{temperature.toFixed(1)}</Badge></div><input id="temperature" className="w-full accent-[var(--primary)]" type="range" min="0" max="1" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></div>
        {message && <Alert><Bot /><AlertTitle>Status koneksi</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
      </div>
      <DialogFooter><Button onClick={() => onOpenChange(false)} disabled={!selectedModel}>Selesai</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function AiDraftCard({ draft, loading, error, onApply, onDiscard, onReview }: { draft: AiDraft | null; loading: boolean; error: string; onApply: () => void; onDiscard: () => void; onReview: () => void }) {
  const review = draft?.task === "review" ? draft.payload as { summary: string; issues: Array<{ severity: string; section: string; message: string; suggestion: string }> } : null
  return <Card className="border-primary/10 bg-primary/[0.025]" size="sm">
    <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI workspace</CardTitle><CardDescription>AI membuat draft. Data berubah hanya setelah Anda menerima.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {loading && <div className="flex items-center gap-2 rounded-2xl bg-muted p-3 text-sm"><Loader2 className="size-4 animate-spin text-primary" />Model sedang menyusun draft…</div>}
      {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>AI gagal</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {!loading && !draft && !error && <div className="rounded-2xl border border-dashed p-4 text-center"><WandSparkles className="mx-auto mb-2 size-5 text-muted-foreground" /><p className="text-xs text-muted-foreground">Gunakan tombol AI pada bagian yang sedang dikerjakan.</p><Button className="mt-3" size="sm" variant="outline" onClick={onReview}>Review seluruh RPS</Button></div>}
      {draft && <div className="space-y-3"><div><Badge>{draft.label}</Badge>{review ? <div className="mt-3 space-y-3"><p className="text-sm leading-relaxed">{review.summary}</p>{review.issues.slice(0, 6).map((issue, index) => <div key={index} className="rounded-2xl border bg-background p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{issue.section}</span><Badge variant={issue.severity === "error" ? "destructive" : "outline"}>{issue.severity}</Badge></div><p className="mt-2 text-xs">{issue.message}</p><p className="mt-1 text-xs text-muted-foreground">Saran: {issue.suggestion}</p></div>)}</div> : <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-[#102219] p-3 text-[10px] leading-relaxed text-[#d7f5e4]">{JSON.stringify(draft.payload, null, 2)}</pre>}</div>{draft.warnings.length > 0 && <Alert><CircleAlert /><AlertTitle>Catatan model</AlertTitle><AlertDescription>{draft.warnings.join(" · ")}</AlertDescription></Alert>}<div className="flex gap-2">{draft.task !== "review" && <Button size="sm" onClick={onApply}><Check />Terapkan draft</Button>}<Button size="sm" variant="outline" onClick={onDiscard}>{draft.task === "review" ? "Tutup review" : "Tolak"}</Button></div></div>}
    </CardContent>
  </Card>
}

function App() {
  const store = useRpsStore()
  const { data, activeStep, setActiveStep, setData, selectedModel, temperature } = store
  const [apiKey, setApiKey] = useState("")
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState("")
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState("")
  const [notice, setNotice] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const issues = useMemo(() => validateRps(data), [data])
  const completion = useMemo(() => overallCompletion(data), [data])
  const currentIndex = STEPS.indexOf(activeStep)

  const runAi = async (task: AiTask) => {
    if (!apiKey.trim() || !selectedModel.trim()) { setSettingsMessage("Hubungkan API key dan pilih model sebelum menggunakan AI."); setSettingsOpen(true); return }
    setAiLoading(true); setAiError(""); setAiDraft(null)
    try {
      const modelMetadata = models.find((model) => model.id === selectedModel)
      setAiDraft(await generateAiDraft({ apiKey, model: selectedModel, temperature, task, data, supportsJsonSchema: modelMetadata?.supported_parameters?.includes("structured_outputs") ?? false }))
    }
    catch (error) { setAiError(error instanceof Error ? error.message : "Terjadi kesalahan saat memanggil model.") }
    finally { setAiLoading(false) }
  }
  const applyDraft = () => {
    if (!aiDraft || aiDraft.task === "review") return
    setData(applyAiDraft(data, aiDraft)); setNotice(`${aiDraft.label} diterapkan. Periksa kembali perubahan sebelum finalisasi.`); setAiDraft(null)
  }
  const importJson = async (file?: File) => {
    if (!file) return
    try {
      const result = store.importData(JSON.parse(await file.text()))
      setNotice(result.ok ? "File JSON berhasil dibuka." : result.error)
    } catch { setNotice("File tidak dapat dibaca sebagai JSON RPS yang valid.") }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }
  const reset = () => { if (window.confirm("Mulai RPS baru? Data lokal saat ini akan diganti. Simpan JSON terlebih dahulu jika diperlukan.")) { store.reset(); setNotice("RPS baru dibuat.") } }
  const go = (direction: -1 | 1) => setActiveStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, currentIndex + direction))])
  const section = activeStep === "identity" ? <IdentitySection onAi={runAi} /> : activeStep === "outcomes" ? <OutcomesSection onAi={runAi} /> : activeStep === "schedule" ? <ScheduleSection onAi={runAi} /> : activeStep === "assessment" ? <AssessmentSection onAi={runAi} /> : <FinalSection onAi={runAi} />

  return <div className="min-h-svh bg-[#f4f7f9] text-foreground">
    <header className="app-header no-print">
      <div className="flex min-w-0 items-center gap-3"><img className="size-10 shrink-0 object-contain" src={undipLogo} alt="Logo Universitas Diponegoro" /><div className="min-w-0"><div className="truncate font-heading text-sm font-semibold">RPS OBE Studio UNDIP</div><div className="truncate text-xs text-muted-foreground">FSM · Informatika · autosave lokal</div></div></div>
      <div className="ml-auto flex items-center gap-2"><Badge className="hidden sm:inline-flex" variant="outline">{completion}% lengkap</Badge><Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 />AI & Model</Button><Button size="sm" onClick={() => exportHtml(data)}><Download />Export HTML</Button></div>
    </header>
    <div className="app-layout">
      <aside className="app-sidebar no-print">
        <div className="px-4 pb-4"><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium">Progress RPS</span><span className="tabular-nums text-muted-foreground">{completion}%</span></div><Progress value={completion} /></div>
        <nav className="space-y-1 px-2">{STEPS.map((step, index) => { const progress = stepCompletion(data, step); return <button key={step} type="button" className={`step-button ${step === activeStep ? "active" : ""}`} onClick={() => setActiveStep(step)}><span className="step-index">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{stepMeta[step].label}</span><span className="block text-xs text-muted-foreground">{progress}% siap</span></span>{progress === 100 && <Check className="size-4 text-primary" />}</button> })}</nav>
        <Separator className="my-4" />
        <div className="space-y-1 px-2"><Button className="w-full justify-start" variant="ghost" onClick={store.loadExample}><Sparkles />Muat contoh</Button><Button className="w-full justify-start" variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload />Buka JSON</Button><Button className="w-full justify-start" variant="ghost" onClick={() => exportJson(data)}><Save />Simpan JSON</Button><Button className="w-full justify-start text-muted-foreground" variant="ghost" onClick={reset}><RotateCcw />RPS baru</Button><input ref={fileInputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => importJson(event.target.files?.[0])} /></div>
      </aside>
      <main className="app-main">
        <div className="mobile-steps no-print">{STEPS.map((step) => <button key={step} type="button" className={step === activeStep ? "active" : ""} onClick={() => setActiveStep(step)}>{stepMeta[step].icon}<span>{stepMeta[step].short}</span></button>)}</div>
        {notice && <Alert className="mb-5 no-print"><CheckCircle2 /><AlertTitle>Perubahan tersimpan</AlertTitle><AlertDescription>{notice}</AlertDescription><button className="absolute right-3 top-3 text-xs text-muted-foreground" onClick={() => setNotice("")}>Tutup</button></Alert>}
        <section className="editor-section no-print">{section}</section>
        {activeStep === "final" && <Card className="mt-6 overflow-visible print-preview-card"><CardHeader className="no-print"><CardTitle>Preview dokumen RPS</CardTitle><CardDescription>HTML mandiri adalah output utama. Gunakan Print untuk PDF atau DOCX berbasis docx.js untuk Microsoft Word.</CardDescription><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => window.print()}><FileText />Print / PDF</Button><Button size="sm" variant="outline" onClick={() => exportHtml(data)}><Download />Standalone HTML</Button><Button size="sm" variant="outline" onClick={() => void exportDocx(data).catch((error) => setNotice(error instanceof Error ? error.message : "Export DOCX gagal."))}><FileText />DOCX</Button><Button size="sm" variant="outline" onClick={() => exportJson(data)}><FileJson />JSON</Button></div></CardHeader><CardContent className="p-0"><DocumentPreview data={data} /></CardContent></Card>}
        <div className="mt-8 flex items-center justify-between no-print"><Button variant="outline" disabled={currentIndex === 0} onClick={() => go(-1)}><ChevronLeft />Sebelumnya</Button><span className="text-xs text-muted-foreground">Langkah {currentIndex + 1} dari {STEPS.length}</span><Button disabled={currentIndex === STEPS.length - 1} onClick={() => go(1)}>Berikutnya<ChevronRight /></Button></div>
      </main>
      <aside className="app-inspector no-print">
        <AiDraftCard draft={aiDraft} loading={aiLoading} error={aiError} onApply={applyDraft} onDiscard={() => { setAiDraft(null); setAiError("") }} onReview={() => runAi("review")} />
        <Card className="mt-4" size="sm"><CardHeader><CardTitle>Quality check</CardTitle><CardDescription>{issues.filter((issue) => issue.level === "error").length} error · {issues.filter((issue) => issue.level === "warning").length} warning</CardDescription></CardHeader><CardContent className="space-y-2">{issues.filter((issue) => issue.level !== "pass").slice(0, 8).map((issue) => <button key={issue.id} type="button" className="issue-row" onClick={() => setActiveStep(issue.step)}>{issueIcon(issue)}<span><b>{issue.title}</b><small>{issue.detail}</small></span></button>)}{issues.every((issue) => issue.level === "pass") && <div className="rounded-2xl bg-primary/10 p-3 text-sm text-primary">Semua pemeriksaan lulus.</div>}</CardContent></Card>
        <div className="mt-4 rounded-3xl border border-dashed bg-white/50 p-4 text-xs leading-relaxed text-muted-foreground"><div className="mb-2 flex items-center gap-2 font-medium text-foreground"><Bot className="size-4" />Privasi MVP</div>RPS disimpan lokal. Saat memakai AI, konteks bagian terkait dikirim ke OpenRouter dan provider model yang dipilih. API key tidak dipersistenkan.</div>
      </aside>
    </div>
    <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} apiKey={apiKey} setApiKey={setApiKey} models={models} setModels={setModels} isLoading={loadingModels} setIsLoading={setLoadingModels} message={settingsMessage} setMessage={setSettingsMessage} />
  </div>
}

export default App
