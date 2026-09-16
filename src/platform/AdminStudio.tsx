import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { Activity, Database, FlaskConical, History, Network, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, type PlatformData } from "./api"
import { MasterPage } from "./MasterPage"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DataBrowser } from "./DataBrowser"
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer"

type UserRole = { profileId: string; roleCode: string; roleName: string; programId: string | null; programName: string | null }
type StudioUser = { id: string; name: string; email: string; role: string; banned: boolean; profileId: string | null; staffOrStudentId: string; status: "active" | "inactive"; createdAt: string; roles: UserRole[] }
type StudioData = {
  database: { connected: boolean; engine: string; migrations: Array<{ id: number; hash: string; created_at: number }>; tables: Array<{ table_name: string; label: string; row_estimate: string; size_bytes: string }> }
  users: StudioUser[]
  audit: Array<{ id: string; action: string; entityType: string; entityId: string; actorName: string | null; impersonatorProfileId: string | null; createdAt: string }>
  scenarios: Array<{ id: string; key: string; label: string; status: "active" | "reset"; createdAt: string; resetAt: string | null; manifest: Record<string, string[]> }>
}
type Health = { key: string; label: string; value: number; severity: string }
type Tab = "overview" | "users" | "academic" | "demo" | "audit" | "schema"

const tabs: Array<[Tab, string, typeof Activity]> = [["overview", "Overview", Activity], ["users", "Users & Access", Users], ["academic", "Academic Data", Database], ["demo", "Demo Scenarios", FlaskConical], ["audit", "Audit Log", History], ["schema", "Database & Relasi", Network]]
const roleOptions = ["ADMIN_PRODI", "KAPRODI", "GPM", "DOSEN_PENGAMPU", "MAHASISWA"] as const
const pageSize = 10

export function AdminStudio({ platform, reloadPlatform }: { platform: PlatformData; reloadPlatform: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("schema")
  const [data, setData] = useState<StudioData | null>(null)
  const [health, setHealth] = useState<Health[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query.toLowerCase())
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<StudioUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [impersonating, setImpersonating] = useState<StudioUser | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => {
    try {
      const [studio, healthRows] = await Promise.all([api.get<StudioData>("/api/admin/studio"), api.get<Health[]>("/api/admin/data-health")])
      setData(studio); setHealth(healthRows); setError("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Admin Studio tidak dapat dimuat.") }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  const visibleUsers = useMemo(() => data?.users.filter(item => `${item.name} ${item.email} ${item.staffOrStudentId} ${item.roles.map(role => role.roleCode).join(" ")}`.toLowerCase().includes(deferredQuery)) ?? [], [data?.users, deferredQuery])
  const pageRows = visibleUsers.slice(page * pageSize, (page + 1) * pageSize)

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("")
    try { await action(); await Promise.all([load(), reloadPlatform()]) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tindakan admin gagal.") }
    finally { setBusy(false) }
  }

  return <div className="admin-studio space-y-5">
    <header className="page-heading"><div><h1>Admin Studio</h1><p>Kelola akses, data akademik, kesehatan sistem, dan skenario demo.</p></div><span className="connection-state"><i /> PostgreSQL terhubung</span></header>
    <nav className="admin-tabs" aria-label="Bagian Admin Studio">{tabs.map(([value, label, Icon]) => <button key={value} aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value)}><Icon />{label}</button>)}</nav>
    {error ? <div className="error" role="alert">{error}</div> : null}
    {!data ? <section className="panel"><p className="empty">Memuat Admin Studio…</p></section> : tab === "overview" ? <>
      <section className="admin-metrics">
        <article><span>Pengguna</span><strong>{data.users.length}</strong><small>{data.users.filter(item => item.status === "active" && !item.banned).length} aktif</small></article>
        <article><span>Tabel domain</span><strong>{data.database.tables.length}</strong><small>{data.database.engine}</small></article>
        <article><span>Temuan data</span><strong>{health.reduce((sum, item) => sum + item.value, 0)}</strong><small>memerlukan perhatian</small></article>
        <article><span>Skenario demo</span><strong>{data.scenarios.filter(item => item.status === "active").length}</strong><small>aktif dan dapat di-reset</small></article>
      </section>
      <div className="admin-overview-grid"><section className="panel"><div className="section-heading"><div><h2>Data health</h2><p>Pemeriksaan relasi dan workflow yang dapat ditindaklanjuti.</p></div></div><div className="health-list">{health.map(item => <div key={item.key}><span>{item.label}</span><strong className={item.value ? item.severity : "ok"}>{item.value}</strong></div>)}</div></section>
      <section className="panel"><div className="section-heading"><div><h2>Aktivitas terbaru</h2><p>Jejak perubahan administratif dan akademik.</p></div><Button variant="ghost" size="sm" onClick={() => setTab("audit")}>Lihat semua</Button></div>{data.audit.slice(0, 6).map(item => <div className="audit-row" key={item.id}><div><b>{item.action.replaceAll("_", " ")}</b><small>{item.actorName ?? "Sistem"} · {item.entityType}</small></div><time>{new Date(item.createdAt).toLocaleString("id-ID")}</time></div>)}</section></div>
    </> : tab === "users" ? <>
      <section className="panel admin-toolbar"><Input aria-label="Cari pengguna" placeholder="Cari nama, email, ID, atau role…" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /><Button onClick={() => setCreating(true)}>Tambah pengguna</Button></section>
      <section className="panel data-grid"><table><thead><tr><th>Pengguna</th><th>ID</th><th>Akses</th><th>Status</th><th /></tr></thead><tbody>{pageRows.map(item => <tr key={item.id}><td><b>{item.name}</b><small>{item.email}</small></td><td>{item.staffOrStudentId || "—"}</td><td><div className="role-stack">{item.roles.length ? item.roles.map(role => <span key={`${role.roleCode}-${role.programId}`}>{role.roleCode}<small>{role.programName}</small></span>) : <em>Belum ada role</em>}</div></td><td><span className={`status ${item.status === "active" && !item.banned ? "success" : "warning"}`}>{item.banned ? "Diblokir" : item.status}</span></td><td><div className="row-actions"><Button size="sm" variant="ghost" onClick={() => setSelected(item)}>Edit</Button>{item.role !== "admin" ? <Button size="sm" variant="outline" onClick={() => { setImpersonating(item); setReason("") }}>Impersonate</Button> : null}</div></td></tr>)}</tbody></table>{!pageRows.length ? <p className="empty">Tidak ada pengguna yang sesuai.</p> : null}<footer className="grid-footer"><span>{visibleUsers.length} pengguna</span><div><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Sebelumnya</Button><span>Halaman {page + 1}</span><Button variant="ghost" size="sm" disabled={(page + 1) * pageSize >= visibleUsers.length} onClick={() => setPage(value => value + 1)}>Berikutnya</Button></div></footer></section>
    </> : tab === "academic" ? <MasterPage data={platform} reload={reloadPlatform} /> : tab === "demo" ? <section className="panel"><div className="section-heading"><div><h2>Demo scenarios</h2><p>Data sintetis diberi manifest dan hanya record milik skenario yang akan dihapus saat reset.</p></div></div><div className="scenario-create"><article><h3>Demo akademik lengkap</h3><p>12 kelas, 6 mata kuliah, 2 periode, 24 mahasiswa, nilai, radar CPL, curriculum map, review RPS, dan CQI.</p><Button disabled={busy || data.scenarios.some(item => item.key === "full-academic" && item.status === "active")} onClick={() => void run(() => api.send("/api/admin/demo/full", "POST"))}>{busy ? "Menyiapkan…" : "Isi demo lengkap"}</Button></article><article><h3>Library CPL & CPMK</h3><p>Menambahkan CPL, CPMK, Sub-CPMK, dan mapping untuk mencoba curriculum map.</p><Button disabled={busy || data.scenarios.some(item => item.key === "outcome-library" && item.status === "active")} onClick={() => void run(() => api.send("/api/admin/demo-scenarios", "POST", { key: "outcome-library" }))}>Populate</Button></article><article><h3>CQI di bawah target</h3><p>Menambahkan calculation run, capaian 58%, dan finding CQI yang dapat ditindaklanjuti.</p><Button disabled={busy || data.scenarios.some(item => item.key === "cqi-gap" && item.status === "active")} onClick={() => void run(() => api.send("/api/admin/demo-scenarios", "POST", { key: "cqi-gap" }))}>Populate</Button></article></div><h3 className="mt-7">Riwayat</h3>{data.scenarios.map(item => <div className="scenario-row" key={item.id}><div><b>{item.label}</b><small>Dibuat {new Date(item.createdAt).toLocaleString("id-ID")} · {Object.values(item.manifest).reduce((sum, ids) => sum + ids.length, 0)} record</small></div><span className={`status ${item.status === "active" ? "success" : ""}`}>{item.status}</span>{item.status === "active" ? <Button disabled={busy} variant="outline" size="sm" onClick={() => { if (window.confirm(`Reset ${item.label}? Hanya data dari skenario ini yang dihapus.`)) void run(() => api.send(`/api/admin/demo-scenarios/${item.id}`, "DELETE")) }}>Reset scenario</Button> : null}</div>)}</section>
    : tab === "audit" ? <section className="panel data-grid"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Entitas</th><th>Impersonation</th></tr></thead><tbody>{data.audit.map(item => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("id-ID")}</td><td>{item.actorName ?? "Sistem"}</td><td><b>{item.action.replaceAll("_", " ")}</b></td><td>{item.entityType}<small>{item.entityId}</small></td><td>{item.impersonatorProfileId ? "Ya" : "—"}</td></tr>)}</tbody></table></section>
    : <DataBrowser platform={platform} reloadPlatform={reloadPlatform} onManage={() => setTab("academic")} />}

    {creating ? <UserDrawer title="Tambah pengguna" platform={platform} busy={busy} onClose={() => setCreating(false)} onSave={values => void run(async () => { await api.send("/api/admin/users", "POST", values); setCreating(false) })} /> : null}
    {selected ? <UserDrawer title="Edit pengguna" platform={platform} user={selected} busy={busy} onClose={() => setSelected(null)} onSave={values => void run(async () => { await api.send(`/api/admin/users/${selected.id}`, "PATCH", { name: values.name, email: values.email, staffOrStudentId: values.staffOrStudentId, status: values.status, banned: values.banned }); if (!selected.roles.some(role => role.roleCode === "SUPERADMIN")) await api.send(`/api/admin/users/${selected.id}/roles`, "PUT", { roles: values.roles }); setSelected(null) })} /> : null}
    {impersonating ? <Dialog open onOpenChange={open => { if (!open) setImpersonating(null) }}><DialogContent><DialogHeader><DialogTitle>Masuk sebagai {impersonating.name}</DialogTitle><DialogDescription>Semua aksi menggunakan izin pengguna ini dan dicatat bersama identitas admin asli.</DialogDescription></DialogHeader><label className="field">Alasan impersonation<Input autoFocus value={reason} onChange={event => setReason(event.target.value)} placeholder="Contoh: memeriksa masalah akses kelas" /></label><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setImpersonating(null)}>Batal</Button><Button disabled={reason.trim().length < 5 || busy} onClick={async () => { setBusy(true); setError(""); try { await api.send("/api/auth/admin/impersonate-user", "POST", { userId: impersonating.id }, { "X-Impersonation-Reason": reason }); window.location.hash = "/dashboard"; window.location.reload() } catch (cause) { setError(cause instanceof Error ? cause.message : "Impersonation gagal."); setBusy(false) } }}>Mulai impersonation</Button></div></DialogContent></Dialog> : null}
  </div>
}

type UserValues = { name: string; email: string; password?: string; staffOrStudentId: string; status: "active" | "inactive"; banned: boolean; roles: Array<{ roleCode: string; programId: string }> }
function UserDrawer({ title, platform, user, busy, onClose, onSave }: { title: string; platform: PlatformData; user?: StudioUser; busy: boolean; onClose: () => void; onSave: (values: UserValues) => void }) {
  const initialRoles = user?.roles.filter(role => role.programId).map(role => ({ roleCode: role.roleCode, programId: role.programId! })) ?? []
  const [values, setValues] = useState<UserValues>({ name: user?.name ?? "", email: user?.email ?? "", password: "", staffOrStudentId: user?.staffOrStudentId ?? "", status: user?.status ?? "active", banned: user?.banned ?? false, roles: initialRoles })
  const [roleCode, setRoleCode] = useState<string>("DOSEN_PENGAMPU")
  const [programId, setProgramId] = useState(platform.programs[0]?.id ?? "")
  return <Drawer open onOpenChange={open => { if (!open) onClose() }} swipeDirection="right"><DrawerContent className="record-drawer"><div className="workspace user-drawer-content"><header><div><DrawerTitle>{title}</DrawerTitle><DrawerDescription>Identitas pengguna dan akses program studi.</DrawerDescription></div><Button variant="ghost" onClick={onClose}>Tutup</Button></header><div className="drawer-body"><label className="field">Nama<Input value={values.name} onChange={event => setValues(current => ({ ...current, name: event.target.value }))} /></label><label className="field">Email<Input type="email" value={values.email} onChange={event => setValues(current => ({ ...current, email: event.target.value }))} /></label>{!user ? <label className="field">Password awal<Input type="password" value={values.password} onChange={event => setValues(current => ({ ...current, password: event.target.value }))} /></label> : null}<label className="field">NIP / NIM / ID<Input value={values.staffOrStudentId} onChange={event => setValues(current => ({ ...current, staffOrStudentId: event.target.value }))} /></label>{user ? <div className="grid grid-cols-2 gap-3"><label className="field">Status<select value={values.status} onChange={event => setValues(current => ({ ...current, status: event.target.value as "active" | "inactive" }))}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label><label className="check-field"><input type="checkbox" checked={values.banned} onChange={event => setValues(current => ({ ...current, banned: event.target.checked }))} /> Blokir login</label></div> : null}<section className="role-editor"><h3>Akses program</h3>{values.roles.map((role, index) => <div key={`${role.roleCode}-${role.programId}-${index}`}><span><b>{role.roleCode}</b><small>{platform.programs.find(item => item.id === role.programId)?.name}</small></span><Button size="sm" variant="ghost" onClick={() => setValues(current => ({ ...current, roles: current.roles.filter((_, itemIndex) => itemIndex !== index) }))}>Hapus</Button></div>)}<div className="role-add"><select value={roleCode} onChange={event => setRoleCode(event.target.value)}>{roleOptions.map(role => <option key={role}>{role}</option>)}</select><select value={programId} onChange={event => setProgramId(event.target.value)}>{platform.programs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button type="button" variant="outline" onClick={() => { if (programId && !values.roles.some(role => role.roleCode === roleCode && role.programId === programId)) setValues(current => ({ ...current, roles: [...current.roles, { roleCode, programId }] })) }}>Tambah</Button></div></section></div><footer><Button variant="outline" onClick={onClose}>Batal</Button><Button disabled={busy || values.name.trim().length < 3 || !values.email.includes("@") || (!user && (values.password?.length ?? 0) < 8)} onClick={() => onSave(values)}>{busy ? "Menyimpan…" : "Simpan pengguna"}</Button></footer></div></DrawerContent></Drawer>
}
