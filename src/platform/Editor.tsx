import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Send } from "lucide-react"
import { AssessmentSection, FinalSection, IdentitySection, OutcomesSection, ScheduleSection } from "@/components/rps/editor-sections"
import { Button } from "@/components/ui/button"
import { getEditorTarget } from "@/lib/editor-targets"
import { buildImprovedStandaloneHtml, exportImprovedHtml } from "@/lib/html-export"
import { exportDocx, exportJson } from "@/lib/export"
import { validateRps, type ValidationIssue } from "@/lib/validation"
import { DEFAULT_AI_MODEL, STEPS, useRpsStore, type StepId } from "@/stores/rps-store"
import { api, type AccessContext, type RpsDocument } from "./api"
import { setNavigationGuard } from "./navigation"
import { EditorChat, type EditorChatHandle } from "./EditorChat"
const labels: Record<StepId, string> = { identity: "Identitas", outcomes: "CPL & CPMK", schedule: "Rencana mingguan", assessment: "Assessment", final: "Review" }
export function PlatformEditor({ rpsId, access, ai, onBack, onChanged }: { rpsId: string; access: AccessContext; ai: { configured: boolean; model: string }; onBack: () => void; onChanged: () => void }) {
 const data = useRpsStore(state => state.data); const activeStep = useRpsStore(state => state.activeStep); const setActiveStep = useRpsStore(state => state.setActiveStep); const hydrate = useRpsStore(state => state.hydrate)
 const [document, setDocument] = useState<RpsDocument | null>(null); const docRef = useRef<RpsDocument | null>(null); const saved = useRef(""); const pending = useRef<Promise<void> | null>(null)
 const [saveState, setSaveState] = useState("saved"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState(false)
 const dialog = useRef<HTMLDialogElement>(null); const chat = useRef<EditorChatHandle>(null)
 const writer = access.roles.some(role => ["SUPERADMIN", "ADMIN_PRODI", "DOSEN_PENGAMPU"].includes(role.code)); const editable = writer && Boolean(document && ["draft", "needs_revision"].includes(document.status))
 const changed = document && data.updatedAt !== document.data.updatedAt; const issues = useMemo(() => validateRps(data), [data])
 const remember = useCallback((next: RpsDocument) => { docRef.current = next; saved.current = next.data.updatedAt; setDocument(next) }, [])
 const apply = useCallback((next: RpsDocument) => { remember(next); hydrate(next.data, { activeStep: useRpsStore.getState().activeStep, selectedModel: ai.model || DEFAULT_AI_MODEL, temperature: .2, apiKeyStorageMode: "memory" }) }, [remember, hydrate, ai.model])
 useEffect(() => { let alive = true; api.get<RpsDocument>(`/api/rps/${rpsId}`).then(next => { if (alive) { apply(next); setActiveStep("identity") } }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : "RPS gagal dimuat.") }); return () => { alive = false } }, [rpsId, apply, setActiveStep])
 const flush = useCallback(async () => {
   if (pending.current) return pending.current
   const doc = docRef.current
   if (!doc || !writer || !["draft", "needs_revision"].includes(doc.status)) return
   const run = async () => {
     while (useRpsStore.getState().data.updatedAt !== saved.current) {
       const snapshot = useRpsStore.getState().data; setSaveState("saving")
       try { const next = await api.send<RpsDocument>(`/api/rps/${rpsId}`, "PUT", snapshot, { "If-Match": String(docRef.current!.revision) }); remember(next) }
       catch (reason) { setSaveState("error"); setError(reason instanceof Error ? reason.message : "Penyimpanan gagal."); throw reason }
     }
     setSaveState("saved")
   }
   const promise = run(); pending.current = promise; try { await promise } finally { if (pending.current === promise) pending.current = null }
 }, [remember, rpsId, writer])
 useEffect(() => { if (!editable || !changed) return; const timer = window.setTimeout(() => { void flush().catch(() => undefined) }, 900); return () => clearTimeout(timer) }, [data.updatedAt, editable, changed, flush])
 useEffect(() => {
   setNavigationGuard(async () => { try { await flush(); return true } catch { return window.confirm("Perubahan belum tersimpan. Tinggalkan halaman dan buang perubahan lokal?") } })
   const unload = (event: BeforeUnloadEvent) => { if (docRef.current && useRpsStore.getState().data.updatedAt !== saved.current) { event.preventDefault(); event.returnValue = "" } }
   window.addEventListener("beforeunload", unload); return () => { setNavigationGuard(null); window.removeEventListener("beforeunload", unload) }
 }, [flush])
 useEffect(() => { if (preview && dialog.current && !dialog.current.open) dialog.current.showModal(); else if (!preview) dialog.current?.close() }, [preview])
 async function submit() { setBusy(true); setError(""); try { await flush(); remember(await api.send<RpsDocument>(`/api/rps/${rpsId}/submit`, "POST")); onChanged() } catch (reason) { setError(reason instanceof Error ? reason.message : "Pengajuan gagal.") } finally { setBusy(false) } }
 function jump(issue: ValidationIssue) { setActiveStep(issue.step); if (issue.target && getEditorTarget(issue.target)) window.setTimeout(() => { const element = window.document.querySelector<HTMLElement>(`[data-editor-target="${issue.target}"]`); element?.scrollIntoView({ block: "center", behavior: "smooth" }); element?.focus() }, 50) }
 if (!document) return <div className="space-y-4"><Button variant="ghost" onClick={onBack}>← Dokumen RPS</Button>{error ? <p className="error" role="alert">{error}</p> : <p>Memuat RPS…</p>}</div>
 const props = { onAi: (task: Parameters<EditorChatHandle["draft"]>[0]) => chat.current?.draft(task) }
 return <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-4"><div><button className="text-xs text-primary mb-2" onClick={onBack}>← Dokumen RPS</button><h1>{document.title}</h1><p className="mt-1 text-xs text-muted-foreground">{data.meta.code} · Versi {document.version} · {document.status.replaceAll("_", " ")}</p></div><div className="flex flex-wrap items-center gap-2"><span role="status" className={`text-xs ${saveState === "error" ? "text-red-700" : "text-muted-foreground"}`}>{saveState === "error" ? "Gagal menyimpan" : saveState === "saving" ? "Menyimpan…" : changed ? "Perubahan belum tersimpan" : "Tersimpan"}</span><Button variant="outline" onClick={() => setPreview(true)}>Preview & ekspor</Button>{editable && <Button disabled={busy || issues.some(issue => issue.level === "error")} onClick={() => void submit()}><Send />Ajukan review</Button>}{document.status === "submitted" && <a className="text-primary text-sm" href="#/approvals">Lihat persetujuan</a>}</div></header>
 {error && <div className="error space-y-2" role="alert"><p>{error}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void flush().then(() => setError("")).catch(() => undefined)}>Coba simpan lagi</Button><Button size="sm" variant="outline" onClick={() => { if (window.confirm("Muat versi server? Perubahan lokal yang belum tersimpan akan diganti.")) void api.get<RpsDocument>(`/api/rps/${rpsId}`).then(next => { apply(next); setError(""); setSaveState("saved") }).catch(reason => setError(reason.message)) }}>Muat versi server</Button><Button size="sm" variant="outline" onClick={() => exportJson(data)}>Unduh salinan lokal</Button></div></div>}
 <nav aria-label="Langkah editor" className="flex overflow-auto border rounded-md bg-white">{STEPS.map((step, index) => <button key={step} className={`flex-1 min-w-max flex gap-2 items-center p-4 text-sm border-b-2 ${activeStep === step ? "border-primary text-primary bg-blue-50" : "border-transparent"}`} onClick={() => setActiveStep(step)} aria-current={activeStep === step ? "step" : undefined}><span className="font-semibold">{index + 1}</span>{labels[step]}</button>)}</nav>
 <div className="flex gap-5 items-start"><div className="min-w-0 flex-1 space-y-4">{!editable && <p className="border-l-2 border-primary pl-3 text-sm">Dokumen hanya dapat dibaca. RPS yang diajukan atau diverifikasi tidak dapat diedit.</p>}
 <fieldset disabled={!editable || busy} className={!editable ? "editor-readonly min-w-0" : "min-w-0"}>{activeStep === "identity" ? <IdentitySection {...props} /> : activeStep === "outcomes" ? <OutcomesSection {...props} /> : activeStep === "schedule" ? <ScheduleSection {...props} /> : activeStep === "assessment" ? <AssessmentSection {...props} /> : <FinalSection {...props} />}</fieldset>
 <section className="panel"><h2>Kualitas & kelengkapan</h2><p className="my-2 text-xs text-muted-foreground">{issues.filter(issue => issue.level === "pass").length} dari {issues.length} pemeriksaan lulus.</p>{issues.filter(issue => issue.level !== "pass").map(issue => <button className="flex w-full items-start gap-2 border-b py-3 text-left" key={issue.id} onClick={() => jump(issue)}><span className={issue.level === "error" ? "text-red-700" : "text-amber-700"}>•</span><span><b className="text-sm">{issue.title}</b><small className="block text-muted-foreground mt-1">{issue.detail}</small></span></button>)}{issues.every(issue => issue.level === "pass") && <p className="text-sm text-green-700">Semua pemeriksaan lulus.</p>}</section></div>
 <EditorChat ref={chat} rpsId={rpsId} userId={access.user.id} ai={ai} editable={editable} version={data.updatedAt} flush={flush} onApplying={setBusy} onApplied={next => { apply(next); onChanged() }} /></div>
 <dialog ref={dialog} onCancel={() => setPreview(false)} className="fixed inset-0 m-auto w-[95vw] h-[90svh] max-w-6xl rounded-lg border p-0 backdrop:bg-black/40"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-3"><h2>Preview RPS</h2><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => exportImprovedHtml(data)}>HTML</Button><Button variant="outline" size="sm" onClick={() => void exportDocx(data)}>DOCX</Button><Button variant="outline" size="sm" onClick={() => exportJson(data)}>JSON</Button><Button variant="outline" size="sm" onClick={() => dialog.current?.querySelector("iframe")?.contentWindow?.print()}>Print / PDF</Button><Button size="sm" variant="ghost" onClick={() => setPreview(false)}>Tutup</Button></div></div><iframe title="Preview dokumen RPS" className="w-full h-[calc(100%-64px)]" srcDoc={buildImprovedStandaloneHtml(data)} /></dialog>
 </div>
}
