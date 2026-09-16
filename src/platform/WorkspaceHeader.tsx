import { ChevronDown, LogOut, RefreshCw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import type { PlatformData } from "./api"

const names: Record<string, string> = { dashboard: "Beranda", courses: "Mata Kuliah", curricula: "Kurikulum & CPL", rps: "Dokumen RPS", classes: "Kelas", outcomes: "Nilai & Capaian", approvals: "Persetujuan", cqi: "CQI", master: "Master Data", admin: "Admin Studio", editor: "Dokumen RPS" }

export function WorkspaceHeader({ data, route, program, period, setProgram, setPeriod, reload, logout }: {
  data: PlatformData; route: { view: string; id: string }; program: string; period: string
  setProgram: (value: string) => void; setPeriod: (value: string) => void
  reload: () => void; logout: () => void
}) {
  const user = data.access.user
  const initials = user.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()
  const title = names[route.view] ?? "Workspace"
  const record = route.view === "editor" ? data.rps.find(row => row.id === route.id)?.title : route.view === "classes" ? data.classes.find(row => row.id === route.id)?.name : route.view === "courses" ? data.curriculumCourses.find(row => row.id === route.id)?.courseName : route.view === "curricula" ? data.curricula.find(row => row.id === route.id)?.name : undefined
  return <header className="workspace-header">
    <div className="workspace-header-navigation">
      <SidebarTrigger className="-ml-1" aria-label="Buka atau tutup navigasi" />
      <span className="h-4 w-px bg-border" aria-hidden="true" />
      <Breadcrumb className="min-w-0"><BreadcrumbList className="flex-nowrap">
        {route.view !== "dashboard" ? <><BreadcrumbItem className="hidden md:inline-flex"><BreadcrumbLink href="#/dashboard">Beranda</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" /></> : null}
        <BreadcrumbItem className="min-w-0">{route.id ? <BreadcrumbLink className="truncate" href={route.view === "editor" ? "#/rps" : `#/${route.view}`}>{title}</BreadcrumbLink> : <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>}</BreadcrumbItem>
        {route.id ? <><BreadcrumbSeparator /><BreadcrumbItem className="min-w-0"><BreadcrumbPage className="max-w-52 truncate">{record ?? "Detail"}</BreadcrumbPage></BreadcrumbItem></> : null}
      </BreadcrumbList></Breadcrumb>
    </div>
    <div className="workspace-header-filters">
      <select aria-label="Filter program studi" value={program} onChange={event => setProgram(event.target.value)}><option value="">Semua program studi</option>{data.programs.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      <select aria-label="Filter semester" value={period} onChange={event => setPeriod(event.target.value)}><option value="">Semua periode</option>{data.periods.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
    </div>
    <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" className="workspace-profile-trigger h-9 gap-2 px-1.5" aria-label="Menu akun" />}><span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span><ChevronDown className="size-3.5 text-muted-foreground" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup><DropdownMenuLabel><span className="block text-sm font-semibold text-foreground">{user.name}</span><span className="block truncate font-normal">{user.email}</span></DropdownMenuLabel><div className="px-1.5 pb-2 text-xs text-muted-foreground">{[...new Set(data.access.roles.map(role => role.name))].join(" · ")}</div></DropdownMenuGroup>
        <DropdownMenuSeparator />
        {data.access.roles.some(role => role.code === "SUPERADMIN") ? <DropdownMenuItem onClick={() => { window.location.hash = "/admin" }}><ShieldCheck />Admin Studio</DropdownMenuItem> : null}
        <DropdownMenuItem onClick={reload}><RefreshCw />Muat ulang data</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={logout}><LogOut />Keluar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </header>
}
