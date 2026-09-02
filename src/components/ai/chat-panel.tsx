import { useEffect, useRef, useState } from "react"
import {
  Check, ChevronDown, CircleAlert, Loader2, RefreshCw,
  Send, Settings2, Square, Trash2, X,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { AiDraft, AiTask, ChatMessage, ChatRetry } from "@/lib/ai-types"
import type { ValidationIssue } from "@/lib/validation"
import type { StepId } from "@/stores/rps-store"

const QUICK_ACTIONS: Array<{ task: AiTask; label: string }> = [
  { task: "description", label: "Deskripsi MK" },
  { task: "cpmk", label: "CPMK & CPL" },
  { task: "schedule", label: "Jadwal 16 minggu" },
  { task: "assessment", label: "Assessment" },
  { task: "review", label: "Review RPS" },
]

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function DraftPreview({ draft }: { draft: AiDraft }) {
  const payload = draft.payload as Record<string, unknown>
  if (draft.task === "description") return <div className="space-y-2 text-xs"><p>{String(payload.descriptionId ?? "")}</p><p className="text-muted-foreground italic">{String(payload.descriptionEn ?? "")}</p></div>
  if (draft.task === "cpmk") {
    const rows = (Array.isArray(payload.cpmk) ? payload.cpmk : []) as Array<Record<string, unknown>>
    return <div className="space-y-1.5">{rows.map((row, index) => <div className="draft-row" key={index}><b>{String(row.code ?? `CPMK-${index + 1}`)}</b><span>{String(row.text ?? "")}</span><Badge variant="outline">{String(row.weight ?? 0)}%</Badge></div>)}</div>
  }
  if (draft.task === "schedule") {
    const rows = (Array.isArray(payload.schedule) ? payload.schedule : []) as Array<Record<string, unknown>>
    return <div className="space-y-1.5">{rows.slice(0, 5).map((row, index) => <div className="draft-row" key={index}><b>M{String(row.week ?? index + 1)}</b><span>{String(row.topic ?? "")}</span></div>)}<p className="pt-1 text-[11px] text-muted-foreground">+ {Math.max(0, rows.length - 5)} minggu lainnya</p></div>
  }
  if (draft.task === "assessment") {
    const rows = (Array.isArray(payload.assessments) ? payload.assessments : []) as Array<Record<string, unknown>>
    const rubrics = Array.isArray(payload.rubrics) ? payload.rubrics : []
    return <div className="space-y-1.5">{rows.map((row, index) => <div className="draft-row" key={index}><span>{String(row.name ?? "")}</span><Badge variant="outline">{String(row.weight ?? 0)}%</Badge></div>)}<p className="pt-1 text-[11px] text-muted-foreground">Termasuk {rubrics.length} kriteria rubrik analitik.</p></div>
  }
  const review = payload as unknown as { summary?: string; issues?: Array<{ severity: string; section: string; message: string; suggestion: string }> }
  return <div className="space-y-2"><p className="text-xs leading-relaxed">{review.summary}</p>{(review.issues ?? []).slice(0, 6).map((issue, index) => <div className="border-l-2 border-border pl-3 py-1" key={index}><div className="flex items-center justify-between gap-2"><b className="text-[11px]">{issue.section}</b><Badge variant={issue.severity === "error" ? "destructive" : "outline"}>{issue.severity}</Badge></div><p className="mt-1 text-[11px]">{issue.message}</p><p className="mt-1 text-[11px] text-muted-foreground">Saran: {issue.suggestion}</p></div>)}</div>
}

function DraftCard({ message, currentUpdatedAt, onApply, onDiscard }: {
  message: ChatMessage
  currentUpdatedAt: string
  onApply: (id: string) => void
  onDiscard: (id: string) => void
}) {
  const draft = message.draft
  if (!draft) return null
  const state = message.draftState ?? "pending"
  const stale = state === "pending" && Boolean(message.sourceUpdatedAt && message.sourceUpdatedAt !== currentUpdatedAt)
  return <div className={`ai-draft-card ${state !== "pending" ? "opacity-70" : ""}`}>
    <div className="mb-3 flex items-start justify-between gap-2"><div><p className="text-xs font-semibold">{draft.label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Preview terstruktur · periksa sebelum diterapkan</p></div>{state === "applied" ? <Badge><Check />Diterapkan</Badge> : state === "discarded" ? <Badge variant="outline"><X />Ditolak</Badge> : <Badge variant="secondary">Draft</Badge>}</div>
    <DraftPreview draft={draft} />
    {draft.warnings.length > 0 && <Alert className="mt-3"><CircleAlert /><AlertTitle>Catatan model</AlertTitle><AlertDescription>{draft.warnings.join(" · ")}</AlertDescription></Alert>}
    {stale && <Alert className="mt-3" variant="destructive"><CircleAlert /><AlertTitle>Draft sudah kedaluwarsa</AlertTitle><AlertDescription>Isi RPS berubah setelah draft dibuat. Buat ulang draft agar perubahan terbaru tidak tertimpa.</AlertDescription></Alert>}
    {state === "pending" && <div className="mt-3 flex gap-2">{draft.task !== "review" && <Button size="sm" onClick={() => onApply(message.id)} disabled={stale}><Check />Terapkan</Button>}<Button size="sm" variant="outline" onClick={() => onDiscard(message.id)}>{draft.task === "review" ? "Tutup review" : "Tolak"}</Button></div>}
  </div>
}

function MessageBubble({ message, currentUpdatedAt, onApply, onDiscard, onRetry }: {
  message: ChatMessage
  currentUpdatedAt: string
  onApply: (id: string) => void
  onDiscard: (id: string) => void
  onRetry: (retry: ChatRetry) => void
}) {
  const assistant = message.role === "assistant"
  return <article className={`chat-message ${assistant ? "assistant" : "user"}`}>
    <div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center gap-2"><span className="text-[11px] font-semibold">{assistant ? "Asisten RPS" : "Anda"}</span><span className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>{message.status === "cancelled" && <Badge variant="outline">Dihentikan</Badge>}</div>
      {message.content && <div className={`ai-markdown ${assistant ? "" : "user-copy"}`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}>{message.content}</ReactMarkdown></div>}
      {message.error && <Alert className="mt-2" variant="destructive"><CircleAlert /><AlertTitle>Respons gagal</AlertTitle><AlertDescription>{message.error}</AlertDescription></Alert>}
      {message.retry && message.status === "error" && <Button className="mt-2" size="sm" variant="outline" onClick={() => onRetry(message.retry!)}><RefreshCw />Coba lagi</Button>}
      <DraftCard message={message} currentUpdatedAt={currentUpdatedAt} onApply={onApply} onDiscard={onDiscard} />
    </div>
  </article>
}

export function AiChatPanel({ messages, streamingContent, busyLabel, connected, model, currentUpdatedAt, issues, onSend, onTask, onCancel, onSettings, onClear, onApply, onDiscard, onRetry, onIssueSelect }: {
  messages: ChatMessage[]
  streamingContent: string
  busyLabel: string
  connected: boolean
  model: string
  currentUpdatedAt: string
  issues: ValidationIssue[]
  onSend: (prompt: string) => void
  onTask: (task: AiTask) => void
  onCancel: () => void
  onSettings: () => void
  onClear: () => void
  onApply: (id: string) => void
  onDiscard: (id: string) => void
  onRetry: (retry: ChatRetry) => void
  onIssueSelect: (step: StepId) => void
}) {
  const [prompt, setPrompt] = useState("")
  const transcriptRef = useRef<HTMLDivElement>(null)
  const busy = Boolean(busyLabel)
  const actionableIssues = issues.filter((issue) => issue.level !== "pass")
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }) }, [messages, streamingContent, busyLabel])
  const submit = () => {
    const value = prompt.trim()
    if (!value || busy) return
    setPrompt("")
    onSend(value)
  }
  return <section className="ai-chat-panel">
    <header className="ai-chat-header"><div className="flex min-w-0 items-center gap-3"><div className="assistant-label">AI</div><div className="min-w-0"><h2>Asisten RPS</h2><p className="truncate">{connected ? model : "Hubungkan OpenRouter untuk mulai"}</p></div></div><div className="flex items-center gap-1"><Button size="icon-sm" variant="ghost" aria-label="Hapus percakapan" onClick={onClear} disabled={!messages.length || busy}><Trash2 /></Button><Button size="icon-sm" variant="ghost" aria-label="Pengaturan AI" onClick={onSettings}><Settings2 /></Button></div></header>
    <div className="ai-transcript" ref={transcriptRef} aria-live="polite">
      {messages.length === 0 && !busy && <div className="ai-welcome"><h3>Diskusikan RPS sambil mengedit</h3><p>Tanyakan alignment OBE, kualitas CPMK, atau ide pembelajaran. Perubahan form tetap memerlukan persetujuan Anda.</p><div className="example-prompt"><b>Contoh</b><p>“Apakah CPMK saya sudah terukur dan selaras dengan assessment?”</p></div></div>}
      {messages.map((message) => <MessageBubble key={message.id} message={message} currentUpdatedAt={currentUpdatedAt} onApply={onApply} onDiscard={onDiscard} onRetry={onRetry} />)}
      {busy && <article className="chat-message assistant"><div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center gap-2"><span className="text-[11px] font-semibold">Asisten RPS</span><Badge variant="secondary"><Loader2 className="animate-spin" />{busyLabel}</Badge></div>{streamingContent ? <div className="ai-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown><span className="typing-caret" /></div> : <div className="thinking-row"><span /><span /><span /></div>}</div></article>}
    </div>
    <div className="ai-composer-wrap"><div className="quick-actions" aria-label="Aksi draft AI">{QUICK_ACTIONS.map((action) => <button type="button" key={action.task} disabled={busy || !connected} onClick={() => onTask(action.task)}>{action.label}</button>)}</div>
      <div className="ai-composer"><textarea value={prompt} disabled={busy || !connected} rows={2} placeholder={connected ? "Tanyakan sesuatu tentang RPS ini…" : "Atur API key OpenRouter dahulu…"} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit() } }} /><div className="flex items-center justify-between gap-2"><span>Enter kirim · Shift+Enter baris baru</span>{busy ? <Button size="icon-sm" variant="destructive" onClick={onCancel} aria-label="Hentikan respons"><Square /></Button> : <Button size="icon-sm" onClick={submit} disabled={!prompt.trim() || !connected} aria-label="Kirim pesan"><Send /></Button>}</div></div>
      <details className="quality-details"><summary><span><CircleAlert />Quality check</span><Badge variant={actionableIssues.some((issue) => issue.level === "error") ? "destructive" : "outline"}>{actionableIssues.length}</Badge><ChevronDown className="chevron" /></summary><div className="space-y-1 p-2">{actionableIssues.slice(0, 8).map((issue) => <button className="issue-row" key={issue.id} type="button" onClick={() => onIssueSelect(issue.step)}><CircleAlert className={issue.level === "error" ? "size-4 text-destructive" : "size-4 text-amber-600"} /><span><b>{issue.title}</b><small>{issue.detail}</small></span></button>)}{actionableIssues.length === 0 && <div className="border-l-2 border-primary px-3 py-2 text-xs text-primary">Semua pemeriksaan lulus.</div>}</div></details>
    </div>
  </section>
}
