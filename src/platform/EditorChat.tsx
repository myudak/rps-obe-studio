import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bot, Check, ChevronDown, Maximize2, Minimize2, Send, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AiTask } from "@/lib/ai-types"
import { useRpsStore } from "@/stores/rps-store"
import { api, type AiDraftResponse, type RpsDocument } from "./api"
type Message = { role: "user" | "assistant"; content: string }
type SavedChat = { messages: Message[]; prompt: string; proposal: AiDraftResponse | null; proposalVersion: string }
const empty: SavedChat = { messages: [], prompt: "", proposal: null, proposalVersion: "" }
function readChat(key: string): SavedChat { try { const parsed = JSON.parse(sessionStorage.getItem(key) || "null") as SavedChat | null; if (parsed && Array.isArray(parsed.messages)) return { ...empty, ...parsed, messages: parsed.messages.filter(item => ["user", "assistant"].includes(item.role) && typeof item.content === "string").slice(-40) } } catch { /* Storage unavailable: use memory. */ } return empty }
function ProposalContent({ value }: { value: unknown }) {
 if (value === null || value === undefined) return null
 if (typeof value !== "object") return <span>{String(value)}</span>
 if (Array.isArray(value)) return <ol className="space-y-3">{value.map((item, index) => <li className="border-b pb-3" key={index}><ProposalContent value={item} /></li>)}</ol>
 return <dl className="space-y-2">{Object.entries(value).filter(([key]) => key !== "warnings").map(([key, item]) => <div key={key}><dt className="text-xs font-semibold text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</dt><dd className="mt-1"><ProposalContent value={item} /></dd></div>)}</dl>
}
export type EditorChatHandle = { draft: (task: AiTask) => void }
export function EditorChat({ ref, rpsId, userId, ai, editable, version, flush, onApplying, onApplied }: { ref: Ref<EditorChatHandle>; rpsId: string; userId: string; ai: { configured: boolean; model: string }; editable: boolean; version: string; flush: () => Promise<void>; onApplying: (busy: boolean) => void; onApplied: (next: RpsDocument) => void }) {
 const key = `obe-chat-v1:${userId}:${rpsId}`; const [chat, setChat] = useState<SavedChat>(() => readChat(key)); const [mode, setMode] = useState<"collapsed" | "docked" | "expanded">("collapsed"); const [width, setWidth] = useState(360); const [busy, setBusy] = useState(""); const [error, setError] = useState("")
 const abort = useRef<AbortController | null>(null); const panel = useRef<HTMLElement>(null); const trigger = useRef<HTMLButtonElement>(null)
 const stale = Boolean(chat.proposal && chat.proposalVersion !== version)
 useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(chat)) } catch { /* Keep live conversation if storage is full. */ } }, [key, chat])
 useEffect(() => () => abort.current?.abort(), [])
 useEffect(() => { const resize = () => { if (window.matchMedia("(max-width: 1023px)").matches) setMode(current => current === "docked" ? "expanded" : current) }; window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize) }, [])
 useEffect(() => {
   if (mode !== "expanded") return
   const before = document.activeElement as HTMLElement | null; panel.current?.focus()
   const overflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"
   const blocked: Array<[HTMLElement, boolean]> = []
   let branch: HTMLElement | null = panel.current
   while (branch && branch !== document.body) { for (const sibling of branch.parentElement?.children ?? []) if (sibling !== branch && sibling instanceof HTMLElement) { blocked.push([sibling, sibling.inert]); sibling.inert = true } branch = branch.parentElement }
   const keydown = (event: KeyboardEvent) => {
     if (event.key === "Escape") { event.preventDefault(); setMode(window.matchMedia("(max-width: 1023px)").matches ? "collapsed" : "docked") }
     if (event.key === "Tab" && panel.current) {
       const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href]')); const first = elements[0], last = elements[elements.length - 1]
       if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
       else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
     }
   }
   document.addEventListener("keydown", keydown); return () => { document.documentElement.style.overflow = overflow; document.removeEventListener("keydown", keydown); blocked.forEach(([element, inert]) => { element.inert = inert }); before?.focus() }
 }, [mode])
 const open = () => setMode(window.matchMedia("(max-width: 1023px)").matches ? "expanded" : "docked")
 async function draft(task: AiTask) {
   if (busy || !editable) return; open(); setBusy("Menyusun proposal…"); setError("")
   try { await flush(); const snapshot = useRpsStore.getState().data.updatedAt; const proposal = await api.draft(rpsId, task); setChat(current => ({ ...current, proposal, proposalVersion: snapshot })) } catch (reason) { setError(reason instanceof Error ? reason.message : "Proposal gagal dibuat.") } finally { setBusy("") }
 }
 useImperativeHandle(ref, () => ({ draft }))
 async function decide(approve: boolean) {
   if (!chat.proposal || busy) return; setBusy("Menyimpan keputusan…"); setError(""); onApplying(true)
   try { if (approve) { if (stale) throw new Error("RPS berubah sejak proposal dibuat."); await flush(); if (useRpsStore.getState().data.updatedAt !== chat.proposalVersion) throw new Error("RPS berubah. Buat proposal baru."); const next = await api.send<RpsDocument>(`/api/ai/suggestions/${chat.proposal.suggestionId}/approve`, "POST"); onApplied(next) } else await api.send(`/api/ai/suggestions/${chat.proposal.suggestionId}/reject`, "POST"); setChat(current => ({ ...current, proposal: null, proposalVersion: "" })) } catch (reason) { setError(reason instanceof Error ? reason.message : "Keputusan gagal disimpan.") } finally { setBusy(""); onApplying(false) }
 }
 async function send(question = chat.prompt.trim(), retry = false) {
   if (!question || busy) return; const controller = new AbortController(); abort.current = controller; setBusy("Menjawab…"); setError("")
   const history = retry ? chat.messages.slice(0, -2) : chat.messages
   setChat(current => ({ ...current, prompt: "", messages: [...history, { role: "user", content: question }, { role: "assistant", content: "" }] }))
   try { await flush(); await api.streamChat({ rpsId, prompt: question, history: history.slice(-20).map(message => ({ ...message, content: message.content.slice(-20000) })), signal: controller.signal, onChunk: text => setChat(current => ({ ...current, messages: current.messages.map((message, index) => index === current.messages.length - 1 ? { ...message, content: message.content + text } : message) })) }) } catch (reason) { setError(controller.signal.aborted ? "Jawaban dihentikan. Anda dapat mencoba lagi." : reason instanceof Error ? reason.message : "Chat gagal.") } finally { setBusy(""); abort.current = null }
 }
 if (mode === "collapsed") return <Button ref={trigger} className="fixed right-5 bottom-5 z-40 shadow-md" onClick={open}><Bot />Asisten RPS{busy ? " · Memproses…" : ""}</Button>
 return <aside ref={panel} tabIndex={-1} role={mode === "expanded" ? "dialog" : "complementary"} aria-modal={mode === "expanded" ? true : undefined} aria-label="Asisten RPS" style={mode === "docked" ? { width, minWidth: 300, maxWidth: "48%" } : undefined} className={mode === "expanded" ? "fixed inset-0 z-50 flex flex-col bg-white p-5 lg:inset-6 lg:rounded-lg lg:border lg:shadow-xl" : "sticky top-5 flex flex-col border rounded-md bg-white p-4 max-h-[85svh]"}>
 <header className="flex items-center justify-between gap-2 border-b pb-3"><h2 className="flex items-center gap-2"><Bot className="size-4 text-primary" />Asisten RPS</h2><div className="flex gap-1"><Button size="icon-sm" variant="ghost" aria-label={mode === "expanded" ? "Kembalikan panel" : "Perbesar chat"} onClick={() => setMode(mode === "expanded" ? window.matchMedia("(max-width: 1023px)").matches ? "collapsed" : "docked" : "expanded")}>{mode === "expanded" ? <Minimize2 /> : <Maximize2 />}</Button><Button size="icon-sm" variant="ghost" aria-label="Ciutkan chat" onClick={() => setMode("collapsed")}><ChevronDown /></Button></div></header>
 {mode === "docked" && <label className="flex items-center gap-3 py-2 text-xs text-muted-foreground">Lebar panel<input aria-label="Lebar panel chat" type="range" min="300" max="650" value={width} onChange={e => setWidth(Number(e.target.value))} /></label>}
 <div className="flex-1 min-h-0 overflow-auto py-3 space-y-4">{!ai.configured && <p className="text-sm text-muted-foreground">Asisten belum tersedia. Hubungi administrator untuk mengaktifkannya.</p>}{!chat.messages.length && !chat.proposal && ai.configured && <p className="text-sm text-muted-foreground">Tanyakan tentang RPS ini atau gunakan bantuan AI pada bagian yang sedang disusun.</p>}
 {chat.messages.map((message, index) => <article className={`text-sm ${message.role === "user" ? "border-l-2 border-primary bg-slate-50 p-3" : "py-2"}`} key={index}><b className="text-xs text-muted-foreground">{message.role === "user" ? "Anda" : "Asisten"}</b><div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (busy ? "Menyiapkan jawaban…" : "Jawaban belum tersedia.")}</ReactMarkdown></div></article>)}
 {chat.proposal && <article className="border rounded-md p-4 space-y-3 text-sm"><h3 className="font-semibold">{chat.proposal.draft.label}</h3><p className="text-xs text-muted-foreground">Tinjau usulan berikut sebelum menerapkannya.</p><ProposalContent value={chat.proposal.draft.payload} />{chat.proposal.draft.warnings.length > 0 && <p className="text-amber-700">{chat.proposal.draft.warnings.join(" · ")}</p>}{stale && <p role="alert" className="text-amber-700">RPS berubah sejak proposal dibuat. Buat proposal baru.</p>}<div className="flex gap-2">{chat.proposal.draft.task !== "review" && <Button size="sm" disabled={!editable || stale || Boolean(busy)} onClick={() => void decide(true)}><Check />Terapkan</Button>}<Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void decide(false)}><X />Tolak</Button></div></article>}
 {error && <div className="error" role="alert">{error}{chat.messages.some(message => message.role === "user") && <Button className="mt-2" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void send([...chat.messages].reverse().find(message => message.role === "user")!.content, true)}>Coba lagi</Button>}</div>}
 </div><footer className="border-t pt-3 space-y-2">{busy && <p role="status" className="text-xs text-primary">{busy}</p>}<textarea aria-label="Pesan untuk asisten" placeholder="Tanyakan tentang RPS ini…" value={chat.prompt} disabled={!ai.configured || Boolean(busy)} onChange={e => setChat(current => ({ ...current, prompt: e.target.value }))} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }} /><div className="flex justify-end">{busy === "Menjawab…" ? <Button variant="outline" onClick={() => abort.current?.abort()}><Square />Hentikan</Button> : <Button disabled={!ai.configured || Boolean(busy) || !chat.prompt.trim()} onClick={() => void send()}><Send />Kirim</Button>}</div></footer>
 </aside>
}
