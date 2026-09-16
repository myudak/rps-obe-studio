import { useCallback, useEffect, useState } from "react"
import { BookCopy, BookOpen, ChartColumn, CheckSquare, Database, GraduationCap, House, LibraryBig, RotateCcw, ShieldCheck } from "lucide-react"
import { WorkspaceHeader } from "./WorkspaceHeader"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { ApiError, api, type PlatformData } from "./api"
import { Dashboard, Login, RpsList } from "./PlatformApp"
import { PlatformEditor } from "./Editor"
import { OutcomesPage } from "./OutcomesPage"
import { MasterPage } from "./MasterPage"
import { ClassesPage, ApprovalsPage, CqiPage } from "./AcademicPages"
import "./workspace.css"
import { mayNavigate } from "./navigation"
import { AdminStudio } from "./AdminStudio"
import { CourseWorkspace, CurriculumWorkspace } from "./OutcomeWorkspaces"

const links = [["dashboard", "Beranda", House], ["courses", "Mata Kuliah", BookCopy], ["curricula", "Kurikulum & CPL", LibraryBig], ["rps", "Dokumen RPS", BookOpen], ["classes", "Kelas", GraduationCap], ["outcomes", "Nilai & Capaian", ChartColumn], ["approvals", "Persetujuan", CheckSquare], ["cqi", "CQI", RotateCcw], ["master", "Master Data", Database], ["admin", "Admin Studio", ShieldCheck]] as const
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
  const superadmin = data.access.roles.some(role => role.code === "SUPERADMIN")
  const staff = data.access.roles.some(role => ["SUPERADMIN", "ADMIN_PRODI", "GPM", "KAPRODI", "DOSEN_PENGAMPU"].includes(role.code))
  const classes = data.classes.filter(item => (!program || item.programId === program) && (!period || item.periodId === period))
  const filtered: PlatformData = { ...data, classes, rps: data.rps.filter(item => classes.some(section => section.id === item.classId)), programs: data.programs.filter(item => !program || item.id === program), curricula: data.curricula.filter(item => !program || item.programId === program), cohorts: data.cohorts.filter(item => !program || item.programId === program), courses: data.courses.filter(item => !program || item.programId === program), curriculumCourses: data.curriculumCourses.filter(item => !program || item.programId === program) }
  filtered.totals = { ...data.totals, rps: filtered.rps.length }
  const allowedLinks = links.filter(([view]) => view === "admin" ? superadmin : view === "master" ? admin && !superadmin : ["approvals", "cqi"].includes(view) ? staff : true)
  const allowed = allowedLinks.some(([view]) => route.view === view) || route.view === "editor"
  const tasks = filtered.rps.filter(item => ["draft", "needs_revision", "submitted"].includes(item.status))
  return <SidebarProvider className="workspace">
    <AppSidebar links={allowedLinks} active={route.view} name={data.access.user.name} />
    <SidebarInset className="workspace-body">{data.access.impersonation ? <div className="impersonation-banner" role="status"><div><ShieldCheck /><span>Anda sedang melihat sebagai <b>{data.access.user.name}</b>. Admin asli: {data.access.impersonation.impersonatedByName}. Semua aksi dicatat.</span></div><Button size="sm" variant="outline" onClick={async () => { try { await api.send("/api/auth/admin/stop-impersonating", "POST"); window.location.hash = "/admin"; window.location.reload() } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal kembali ke akun admin.") } }}>Kembali ke akun admin</Button></div> : null}<WorkspaceHeader data={data} route={route} program={program} period={period} setProgram={setProgram} setPeriod={setPeriod} reload={() => void load()} logout={() => { void api.send("/api/auth/sign-out", "POST").then(() => setData(null)).catch(reason => setError(reason instanceof Error ? reason.message : "Gagal keluar.")) }} />
    <main className="workspace-main">{error && <div role="alert" className="error mb-5">{error}</div>}
    {!allowed ? <p>Halaman tidak tersedia untuk peran Anda.</p> : route.view === "editor" ? <PlatformEditor key={route.id} rpsId={route.id} access={data.access} ai={data.ai} onBack={() => navigate("rps")} onChanged={load} />
      : route.view === "admin" ? <AdminStudio platform={filtered} reloadPlatform={load} />
      : route.view === "courses" ? <CourseWorkspace key={route.id} platform={filtered} id={route.id} />
      : route.view === "curricula" ? <CurriculumWorkspace key={route.id} platform={filtered} id={route.id} />
      : route.view === "master" ? <MasterPage data={filtered} reload={load} />
      : route.view === "classes" ? <ClassesPage key={route.id} platform={filtered} id={route.id} reload={load} />
      : route.view === "approvals" ? <ApprovalsPage platform={filtered} />
      : route.view === "cqi" ? <CqiPage key={route.id} platform={filtered} id={route.id} />
      : route.view === "outcomes" ? <OutcomesPage key={classes.map(item => item.id).join(",") + route.id} platform={filtered} initialClassId={route.id} />
      : route.view === "rps" ? <RpsList data={filtered} reload={load} onOpen={id => navigate("editor", id)} />
      : <div className="space-y-5"><Dashboard data={filtered} onOpenRps={id => navigate("editor", id)} /><section className="panel"><h2>Perlu ditindaklanjuti</h2>{tasks.length ? tasks.map(item => <a className="flex justify-between border-b py-3 text-sm" key={item.id} href={`#/editor/${item.id}`}><span>{item.title}</span><span className="status">{item.status === "submitted" ? "Menunggu review" : item.status === "needs_revision" ? "Perlu revisi" : "Lengkapi draft"}</span></a>) : <p className="empty">Tidak ada RPS yang perlu ditindaklanjuti.</p>}</section></div>}
    </main></SidebarInset>
  </SidebarProvider>
}
