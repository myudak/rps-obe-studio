import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, type PlatformData } from "./api"

type Entity = "programs" | "periods" | "curricula" | "cohorts" | "courses" | "classes"
type Values = Record<string, string | number>
const labels: Record<Entity, string> = { programs: "Program Studi", periods: "Periode", curricula: "Kurikulum", cohorts: "Angkatan", courses: "Mata Kuliah", classes: "Kelas" }
type Field = [string, string, string?]
const fields: Record<Entity, Field[]> = {
 programs: [["code", "Kode"], ["name", "Nama program"], ["faculty", "Fakultas"]],
 periods: [["code", "Kode"], ["name", "Nama periode"], ["startsOn", "Mulai", "date"], ["endsOn", "Selesai", "date"]],
 curricula: [["programId", "Program studi", "select"], ["code", "Kode"], ["name", "Nama kurikulum"], ["version", "Versi", "number"]],
 cohorts: [["programId", "Program studi", "select"], ["curriculumId", "Kurikulum", "select"], ["entryYear", "Tahun masuk", "number"], ["name", "Nama angkatan"]],
 courses: [["programId", "Program studi", "select"], ["curriculumId", "Kurikulum", "select"], ["code", "Kode"], ["name", "Nama mata kuliah"], ["nameEn", "Nama Inggris"], ["credits", "SKS", "number"], ["semester", "Semester", "number"]],
 classes: [["curriculumCourseId", "Mata kuliah kurikulum", "select"], ["cohortId", "Angkatan", "select"], ["periodId", "Periode", "select"], ["code", "Kode kelas"], ["name", "Nama kelas"], ["capacity", "Kapasitas", "number"]],
}
export function EntityForm({ entity, data, initial, onSaved, onCancel }: { entity: Entity; data: PlatformData; initial?: Values; onSaved: () => void | Promise<void>; onCancel?: () => void }) {
 const [values, setValues] = useState<Values>(() => initial ?? { version: 1, capacity: 40, programId: data.programs[0]?.id ?? "", nameEn: "" })
 const [error, setError] = useState(""); const [busy, setBusy] = useState(false)
 const editing = Boolean(initial?.id)
 let visibleFields = fields[entity].filter(([name]) => !editing || !["programId", "curriculumId", "curriculumCourseId", "cohortId", "periodId", "version", "entryYear", "semester"].includes(name))
 if (editing && ["curricula", "cohorts", "classes"].includes(entity)) visibleFields = [...visibleFields, ["status", "Status", "select"]]
 function options(name: string): Array<[string, string]> {
   if (name === "programId") return data.programs.map(item => [item.id, item.name])
   if (name === "curriculumId") return data.curricula.filter(item => item.programId === values.programId).map(item => [item.id, item.name])
   if (name === "curriculumCourseId") return data.curriculumCourses.map(item => [item.id, `${item.courseCode} · ${item.curriculumName}`])
   if (name === "cohortId") { const curriculum = data.curriculumCourses.find(item => item.id === values.curriculumCourseId)?.curriculumId; return data.cohorts.filter(item => item.curriculumId === curriculum).map(item => [item.id, item.name]) }
   if (name === "periodId") return data.periods.map(item => [item.id, item.name])
   return (entity === "classes" ? ["planned", "active", "closed"] : entity === "cohorts" ? ["active", "inactive"] : ["draft", "active", "archived"]).map(item => [item, item])
 }
 return <form className="space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await api.send(editing ? entity === "classes" ? `/api/classes/${initial!.id}` : `/api/admin/${entity}/${initial!.id}` : `/api/admin/${entity}`, editing ? "PATCH" : "POST", values); await onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : "Data gagal disimpan.") } finally { setBusy(false) } }}>
   {error && <div className="error" role="alert">{error}</div>}
   <div className="grid gap-4 md:grid-cols-2">{visibleFields.map(([name, label, type]) => <label key={name} className="field">{label}{type === "select" ? <select required value={values[name] ?? ""} onChange={event => setValues(current => ({ ...current, [name]: event.target.value, ...(name === "programId" ? { curriculumId: "" } : name === "curriculumCourseId" ? { cohortId: "" } : {}) }))}><option value="">Pilih {label.toLowerCase()}</option>{options(name).map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select> : <Input required={name !== "nameEn"} type={type || "text"} value={values[name] ?? ""} onChange={event => setValues(current => ({ ...current, [name]: type === "number" ? Number(event.target.value) : event.target.value }))} />}</label>)}</div>
   <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>{onCancel && <Button type="button" variant="outline" onClick={onCancel}>Batal</Button>}</div>
 </form>
}
export function MasterPage({ data, reload }: { data: PlatformData; reload: () => Promise<void> }) {
 const superadmin = data.access.roles.some(role => role.code === "SUPERADMIN")
 const [tab, setTab] = useState<Entity>(superadmin ? "programs" : "curricula")
 const [query, setQuery] = useState(""); const [selected, setSelected] = useState<Values | null | undefined>(undefined)
 const entities = (Object.keys(labels) as Entity[]).filter(item => item !== "classes" && (superadmin || !["programs", "periods"].includes(item)))
 const rows = data[tab].filter(item => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()))
 return <div className="space-y-5"><h1>Master Data</h1><nav className="flex gap-2 overflow-auto" aria-label="Jenis data">{entities.map(entity => <Button key={entity} variant={entity === tab ? "default" : "outline"} onClick={() => { setTab(entity); setSelected(undefined); setQuery("") }}>{labels[entity]}</Button>)}</nav>
 <div className="flex justify-between gap-4"><Input className="max-w-sm" aria-label="Cari data" placeholder={`Cari ${labels[tab].toLowerCase()}…`} value={query} onChange={e => setQuery(e.target.value)} /><Button onClick={() => setSelected(null)}>Tambah {labels[tab]}</Button></div>
 {selected !== undefined && <section className="panel"><h2 className="mb-5">{selected ? "Edit" : "Tambah"} {labels[tab]}</h2><EntityForm key={`${tab}-${selected?.id ?? "new"}`} entity={tab} data={data} initial={selected ?? undefined} onSaved={async () => { await reload(); setSelected(undefined) }} onCancel={() => setSelected(undefined)} /></section>}
 <div className="panel overflow-x-auto"><table><thead><tr><th>Nama</th><th>Kode / tahun</th><th>Konteks</th><th /></tr></thead><tbody>{rows.map(item => { const row = item as unknown as Values; return <tr key={item.id}><td><b>{row.name}</b></td><td>{row.code ?? row.entryYear ?? "—"}</td><td>{row.programName ?? row.faculty ?? row.startsOn ?? "—"}</td><td><Button size="sm" variant="ghost" onClick={() => setSelected(row)}>Edit</Button></td></tr> })}</tbody></table>{!rows.length && <p className="empty">Belum ada data yang sesuai.</p>}</div></div>
}
