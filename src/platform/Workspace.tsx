import { useCallback, useEffect, useState } from "react"
import { BookOpen, ChartColumn, CheckSquare, Database, GraduationCap, House, LogOut, RefreshCw, RotateCcw } from "lucide-react"
import logo from "@/assets/logo-undip.png?inline"
import { Button } from "@/components/ui/button"
import { ApiError, api, type PlatformData } from "./api"
import { Dashboard, Login, RpsList } from "./PlatformApp"
import { PlatformEditor } from "./Editor"
import { OutcomesPage } from "./OutcomesPage"
import { MasterPage } from "./MasterPage"
import { ClassesPage, ApprovalsPage, CqiPage } from "./AcademicPages"
import "./workspace.css"
import { mayNavigate } from "./navigation"

const links = [["dashboard", "Beranda", House], ["rps", "Dokumen RPS", BookOpen], ["classes", "Kelas", GraduationCap], ["outcomes", "Nilai & Capaian", ChartColumn], ["approvals", "Persetujuan", CheckSquare], ["cqi", "CQI", RotateCcw], ["master", "Master Data", Database]] as const
function navigate(view: string, id = "") { window.location.hash = `/${view}${id ? `/${id}` : ""}` }
function locationState() { const [view = "dashboard", id = ""] = window.location.hash.replace(/^#\/?/, "").split("/"); return { view: view || "dashboard", id } }
export default function Workspace() {
  const [route, setRoute] = useState(locationState)
  const [data, setData] = useState<PlatformData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [program, setProgram] = useState("")
  const [period, setPeriod] = useState("")
  const load = useCallback(async () => {
    try { setData(await api.get<PlatformData>("/api/platform")); setError("") }
    catch (reason) { if (reason instanceof ApiError && reason.status === 401) { setData(null); setError("") } else setError(reason instanceof Error ? reason.message : "Workspace tidak dapat dihubungi.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); let currentHash = window.location.hash; const change = async () => { const destination = window.location.hash; if (await mayNavigate()) { currentHash = destination; setRoute(locationState()) } else window.history.replaceState(null, "", window.location.pathname + window.location.search + currentHash) }; window.addEventListener("hashchange", change); return () => { clearTimeout(timer); window.removeEventListener("hashchange", change) } }, [load])
  if (loading) return <main className="grid min-h-svh place-items-center">Memuat workspace…</main>
  if (!data) return error ? <main className="grid min-h-svh place-items-center"><div className="space-y-4"><h1>Workspace tidak dapat dimuat</h1><p role="alert">{error}</p><Button onClick={() => void load()}>Coba lagi</Button><a className="ml-4 text-sm underline" href="?portable">Buka editor portable</a></div></main> : <Login onSuccess={load} />
  const admin = data.access.roles.some(role => ["SUPERADMIN", "ADMIN_PRODI"].includes(role.code))
  const staff = data.access.roles.some(role => ["SUPERADMIN", "ADMIN_PRODI", "GPM", "KAPRODI", "DOSEN_PENGAMPU"].includes(role.code))
  const classes = data.classes.filter(item => (!program || item.programId === program) && (!period || item.periodId === period))
  const filtered: PlatformData = { ...data, classes, rps: data.rps.filter(item => classes.some(section => section.id === item.classId)), programs: data.programs.filter(item => !program || item.id === program), curricula: data.curricula.filter(item => !program || item.programId === program), cohorts: data.cohorts.filter(item => !program || item.programId === program), courses: data.courses.filter(item => !program || item.programId === program), curriculumCourses: data.curriculumCourses.filter(item => !program || item.programId === program) }
  filtered.totals = { ...data.totals, rps: filtered.rps.length }
  const allowedLinks = links.filter(([view]) => view === "master" ? admin : ["approvals", "cqi"].includes(view) ? staff : true)
  const allowed = allowedLinks.some(([view]) => route.view === view) || route.view === "editor"
  const tasks = filtered.rps.filter(item => ["draft", "needs_revision", "submitted"].includes(item.status))
  return <div className="workspace">
    <aside className="workspace-sidebar"><div className="workspace-brand"><img src={logo} alt="UNDIP" /><div><strong>RPS OBE Studio</strong><small>FSM · Informatika</small></div></div><nav className="workspace-nav" aria-label="Navigasi utama">{allowedLinks.map(([view, label, Icon]) => <a href={`#/${view}`} key={view} aria-current={route.view === view || (view === "rps" && route.view === "editor") ? "page" : undefined}><Icon />{label}</a>)}</nav></aside>
    <div className="workspace-body"><header className="workspace-top"><div className="flex flex-wrap gap-2"><select aria-label="Filter program studi" value={program} onChange={e => setProgram(e.target.value)}><option value="">Semua program studi</option>{data.programs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter semester" value={period} onChange={e => setPeriod(e.target.value)}><option value="">Semua periode</option>{data.periods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="flex items-center gap-3"><div className="text-right text-xs"><b>{data.access.user.name}</b><div className="mt-1 text-muted-foreground">{data.access.roles.map(role => role.name).join(" · ")}</div></div><Button variant="ghost" size="icon-sm" aria-label="Muat ulang" onClick={() => void load()}><RefreshCw /></Button><Button variant="ghost" size="icon-sm" aria-label="Keluar" onClick={async () => { try { await api.send("/api/auth/sign-out", "POST"); setData(null) } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal keluar.") } }}><LogOut /></Button></div></header>
    <main className="workspace-main">{error && <div role="alert" className="error mb-5">{error}</div>}
    {!allowed ? <p>Halaman tidak tersedia untuk peran Anda.</p> : route.view === "editor" ? <PlatformEditor key={route.id} rpsId={route.id} access={data.access} ai={data.ai} onBack={() => navigate("rps")} onChanged={load} />
      : route.view === "master" ? <MasterPage data={filtered} reload={load} />
      : route.view === "classes" ? <ClassesPage key={route.id} platform={filtered} id={route.id} reload={load} />
      : route.view === "approvals" ? <ApprovalsPage platform={filtered} />
      : route.view === "cqi" ? <CqiPage key={route.id} platform={filtered} id={route.id} />
      : route.view === "outcomes" ? <OutcomesPage key={classes.map(item => item.id).join(",") + route.id} platform={filtered} initialClassId={route.id} />
      : route.view === "rps" ? <RpsList data={filtered} reload={load} onOpen={id => navigate("editor", id)} />
      : <div className="space-y-5"><Dashboard data={filtered} onOpenRps={id => navigate("editor", id)} /><section className="panel"><h2>Perlu ditindaklanjuti</h2>{tasks.length ? tasks.map(item => <a className="flex justify-between border-b py-3 text-sm" key={item.id} href={`#/editor/${item.id}`}><span>{item.title}</span><span className="status">{item.status === "submitted" ? "Menunggu review" : item.status === "needs_revision" ? "Perlu revisi" : "Lengkapi draft"}</span></a>) : <p className="empty">Tidak ada RPS yang perlu ditindaklanjuti.</p>}</section></div>}
    </main></div>
  </div>
}
