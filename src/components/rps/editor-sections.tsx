
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AiTask } from "@/lib/openrouter"
import { CPL_KEYS, detectBloom, type CplKey, type MappingLevel, type RpsMeta } from "@/schemas/rps-schema"
import { useRpsStore } from "@/stores/rps-store"

type AiHandler = (task: AiTask) => void

const selectClass = "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"

const AI_ACTION_LABELS: Partial<Record<AiTask, string>> = {
  description: "Buat draft deskripsi",
  cpmk: "Buat draft CPMK",
  schedule: "Buat draft jadwal",
  assessment: "Buat draft assessment",
  review: "Review konsistensi",
}

function SectionHeading({ title, description, task, onAi }: { title: string; description: string; task?: AiTask; onAi: AiHandler }) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-start">
      <div><h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div>
      {task && <Button variant="outline" onClick={() => onAi(task)}>{AI_ACTION_LABELS[task]}</Button>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
}

export function IdentitySection({ onAi }: { onAi: AiHandler }) {
  const { data, updateMeta, updateReferences } = useRpsStore()
  const fields: Array<{ key: keyof RpsMeta; label: string; type?: string }> = [
    { key: "institution", label: "Universitas / Institusi" }, { key: "faculty", label: "Fakultas / Sekolah" },
    { key: "program", label: "Program Studi" }, { key: "courseName", label: "Nama Mata Kuliah" },
    { key: "courseNameEn", label: "Course Name" }, { key: "code", label: "Kode Mata Kuliah" },
    { key: "kbk", label: "Kelompok Mata Kuliah / KBK" }, { key: "sks", label: "Bobot SKS", type: "number" },
    { key: "semester", label: "Semester", type: "number" }, { key: "review", label: "Waktu Review" },
  ]
  return <div>
    <SectionHeading title="Identitas & konteks mata kuliah" description="Mulai dari fakta yang hanya diketahui dosen. AI tidak akan mengubah identitas atau CPL resmi program studi." task="description" onAi={onAi} />
    <Card>
      <CardHeader><CardTitle>Informasi dasar</CardTitle><CardDescription>Field ini menjadi konteks utama untuk semua draft AI.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => <Field key={field.key} label={field.label}><Input type={field.type} min={field.type === "number" ? 1 : undefined} value={String(data.meta[field.key])} onChange={(event) => updateMeta(field.key, field.type === "number" ? Number(event.target.value) : event.target.value)} /></Field>)}
      </CardContent>
    </Card>
    <Card className="mt-5">
      <CardHeader><CardTitle>Deskripsi mata kuliah</CardTitle><CardDescription>Gunakan ringkasan silabus, ruang lingkup, dan kontribusi mata kuliah.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <Field label="Deskripsi (Indonesia)"><Textarea className="min-h-32" value={data.meta.descriptionId} onChange={(event) => updateMeta("descriptionId", event.target.value)} /></Field>
        <Field label="Course description (English)"><Textarea className="min-h-32" value={data.meta.descriptionEn} onChange={(event) => updateMeta("descriptionEn", event.target.value)} /></Field>
        <Field label="Mata kuliah prasyarat"><Input value={data.meta.prerequisites} onChange={(event) => updateMeta("prerequisites", event.target.value)} /></Field>
      </CardContent>
    </Card>
    <Card className="mt-5">
      <CardHeader><CardTitle>Referensi</CardTitle><CardDescription>AI tidak memverifikasi buku atau DOI. Pastikan setiap sumber benar-benar ada.</CardDescription></CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {(["main", "additional"] as const).map((kind) => <div key={kind} className="space-y-3"><div className="text-sm font-medium">{kind === "main" ? "Referensi utama" : "Referensi pendukung"}</div>{data.references[kind].map((reference, index) => <Input key={index} value={reference} placeholder={`${index + 1}. Penulis. Judul. Tahun.`} onChange={(event) => updateReferences(kind, index, event.target.value)} />)}</div>)}
      </CardContent>
    </Card>
  </div>
}

export function OutcomesSection({ onAi }: { onAi: AiHandler }) {
  const { data, updateCpl, updateCpmk } = useRpsStore()
  const cycleMap = (index: number, key: CplKey) => {
    const current = data.cpmk[index]
    const next = ((current.maps[key] + 1) % 4) as MappingLevel
    updateCpmk(index, { maps: { ...current.maps, [key]: next } })
  }
  return <div>
    <SectionHeading title="CPL, CPMK & alignment OBE" description="Masukkan CPL resmi terlebih dahulu. Setelah itu AI dapat menyarankan CPMK yang terukur dan mapping awal untuk ditinjau." task="cpmk" onAi={onAi} />
    <Card>
      <CardHeader><CardTitle>CPL program studi</CardTitle><CardDescription>Kolom kosong tidak akan dipakai AI maupun dokumen final.</CardDescription></CardHeader>
      <CardContent>
        <div className="overflow-x-auto"><table className="editor-table min-w-[720px]"><thead><tr><th className="w-20">Kode</th><th>Deskripsi CPL</th><th>Official PLO description</th></tr></thead><tbody>{data.cpl.map((item, index) => <tr key={item.code}><td className="text-center font-semibold">{item.code}</td><td><Textarea value={item.description} onChange={(event) => updateCpl(index, { description: event.target.value })} /></td><td><Textarea value={item.en} onChange={(event) => updateCpl(index, { en: event.target.value })} /></td></tr>)}</tbody></table></div>
      </CardContent>
    </Card>
    <Card className="mt-5">
      <CardHeader><CardTitle>CPMK / CLO</CardTitle><CardDescription>Total bobot harus 100%. Badge Bloom dibaca dari kata kerja rumusan.</CardDescription><CardAction><Badge variant="outline">{data.cpmk.reduce((total, item) => total + item.weight, 0)}%</Badge></CardAction></CardHeader>
      <CardContent className="space-y-4">
        {data.cpmk.map((item, index) => <div key={item.code} className="border-b py-4 last:border-b-0"><div className="mb-3 flex items-center gap-2"><Input className="max-w-28 font-semibold" value={item.code} onChange={(event) => updateCpmk(index, { code: event.target.value })} /><Badge variant={detectBloom(item.text) === "?" ? "destructive" : "secondary"}>{detectBloom(item.text)}</Badge><div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Bobot <Input className="w-20" type="number" min={0} max={100} value={item.weight} onChange={(event) => updateCpmk(index, { weight: Number(event.target.value) })} />%</div></div><div className="grid gap-3 lg:grid-cols-2"><Textarea value={item.text} placeholder="Rumusan CPMK terukur..." onChange={(event) => updateCpmk(index, { text: event.target.value })} /><Textarea value={item.en} placeholder="English CLO..." onChange={(event) => updateCpmk(index, { en: event.target.value })} /></div></div>)}
      </CardContent>
    </Card>
    <Card className="mt-5">
      <CardHeader><CardTitle>Matriks CPL–CPMK</CardTitle><CardDescription>Klik setiap sel: kosong → * → ** → ***.</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><table className="matrix-table min-w-[720px]"><thead><tr><th>CPMK</th>{CPL_KEYS.map((key) => <th key={key}>({key})</th>)}</tr></thead><tbody>{data.cpmk.map((item, index) => <tr key={item.code}><td className="whitespace-nowrap font-semibold">{item.code}</td>{CPL_KEYS.map((key) => <td key={key}><button type="button" className={`mapping-cell level-${item.maps[key]}`} onClick={() => cycleMap(index, key)}>{item.maps[key] ? "*".repeat(item.maps[key]) : "·"}</button></td>)}</tr>)}</tbody></table></div></CardContent>
    </Card>
  </div>
}

export function ScheduleSection({ onAi }: { onAi: AiHandler }) {
  const { data, updateSchedule } = useRpsStore()
  return <div>
    <SectionHeading title="Jadwal pembelajaran 16 minggu" description="Topik, Sub-CPMK, metode, media, dan assessment harus membentuk satu alur yang konsisten." task="schedule" onAi={onAi} />
    <Card>
      <CardHeader><CardTitle>Learning schedule</CardTitle><CardDescription>Minggu 8 dan 16 dikunci sebagai UTS dan UAS pada draft AI.</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><table className="editor-table min-w-[1280px]"><thead><tr><th className="w-14">Mgg</th><th className="w-28">CPMK</th><th>Topik</th><th>Subtopik / pustaka</th><th>Sub-CPMK</th><th>Metode</th><th>Media</th><th>Assessment</th></tr></thead><tbody>{data.schedule.map((row, index) => <tr key={row.week} className={row.week === 8 || row.week === 16 ? "exam-row" : ""}><td className="text-center font-semibold">{row.week}</td><td>{row.week === 8 || row.week === 16 ? <Badge variant="secondary">{row.week === 8 ? "UTS" : "UAS"}</Badge> : <select className={selectClass} value={row.cpmk} onChange={(event) => updateSchedule(index, { cpmk: event.target.value })}>{data.cpmk.map((item) => <option key={item.code}>{item.code}</option>)}</select>}</td>{(["topic", "subtopic", "outcome", "method", "media", "assessment"] as const).map((key) => <td key={key}><Textarea className="min-h-20 min-w-36" value={row[key]} onChange={(event) => updateSchedule(index, { [key]: event.target.value })} /></td>)}</tr>)}</tbody></table></div></CardContent>
    </Card>
  </div>
}

export function AssessmentSection({ onAi }: { onAi: AiHandler }) {
  const { data, updateAssessment, updateRubric } = useRpsStore()
  const toggleCpmk = (assessmentIndex: number, code: string, checked: boolean) => {
    const current = data.assessments[assessmentIndex]
    updateAssessment(assessmentIndex, { cpmk: checked ? [...new Set([...current.cpmk, code])] : current.cpmk.filter((item) => item !== code) })
  }
  return <div>
    <SectionHeading title="Assessment & rubrik" description="Bobot dihitung oleh aplikasi. AI hanya menyiapkan draft instrumen dan deskriptor yang tetap harus diperiksa dosen." task="assessment" onAi={onAi} />
    <Card>
      <CardHeader><CardTitle>Rencana evaluasi</CardTitle><CardDescription>Centang CPMK yang benar-benar diukur oleh setiap metode.</CardDescription><CardAction><Badge variant="outline">{data.assessments.reduce((total, item) => total + item.weight, 0)}%</Badge></CardAction></CardHeader>
      <CardContent><div className="overflow-x-auto"><table className="editor-table min-w-[920px]"><thead><tr><th>Metode</th><th className="w-24">Bobot</th><th>CPMK yang diukur</th><th>Catatan</th></tr></thead><tbody>{data.assessments.map((item, index) => <tr key={index}><td><Input value={item.name} onChange={(event) => updateAssessment(index, { name: event.target.value })} /></td><td><Input type="number" min={0} max={100} value={item.weight} onChange={(event) => updateAssessment(index, { weight: Number(event.target.value) })} /></td><td><div className="flex min-w-96 flex-wrap gap-2">{data.cpmk.map((cpmk) => <label key={cpmk.code} className={`mapping-pill ${item.cpmk.includes(cpmk.code) ? "active" : ""}`}><input type="checkbox" checked={item.cpmk.includes(cpmk.code)} onChange={(event) => toggleCpmk(index, cpmk.code, event.target.checked)} />{cpmk.code}</label>)}</div></td><td><Input value={item.notes} onChange={(event) => updateAssessment(index, { notes: event.target.value })} /></td></tr>)}</tbody></table></div></CardContent>
    </Card>
    <Card className="mt-5">
      <CardHeader><CardTitle>Rubrik analitik</CardTitle><CardDescription>Lima kriteria, masing-masing dengan deskriptor performa 4–1.</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><table className="editor-table min-w-[1200px]"><thead><tr><th>Kriteria</th><th className="w-28">CPMK</th><th className="w-20">Bobot</th><th>4 — Sangat Baik</th><th>3 — Baik</th><th>2 — Cukup</th><th>1 — Kurang</th></tr></thead><tbody>{data.rubrics.map((item, index) => <tr key={index}><td><Input value={item.criterion} onChange={(event) => updateRubric(index, { criterion: event.target.value })} /></td><td><select className={selectClass} value={item.cpmk} onChange={(event) => updateRubric(index, { cpmk: event.target.value })}>{data.cpmk.map((cpmk) => <option key={cpmk.code}>{cpmk.code}</option>)}</select></td><td><Input type="number" value={item.weight} onChange={(event) => updateRubric(index, { weight: Number(event.target.value) })} /></td>{(["level4", "level3", "level2", "level1"] as const).map((key) => <td key={key}><Textarea className="min-h-24 min-w-40" value={item[key]} onChange={(event) => updateRubric(index, { [key]: event.target.value })} /></td>)}</tr>)}</tbody></table></div></CardContent>
    </Card>
  </div>
}

export function FinalSection({ onAi }: { onAi: AiHandler }) {
  const { data, updateValidation } = useRpsStore()
  const fields = [
    ["author", "Penyusun RPS"], ["authorId", "NIP/NIDN Penyusun"], ["coordinator", "Koordinator/GPM"],
    ["head", "Ketua Program Studi"], ["date", "Tanggal validasi"],
  ] as const
  return <div>
    <SectionHeading title="Finalisasi & dokumen" description="Lakukan review AI dan pemeriksaan manual. Export HTML adalah keluaran utama MVP; DOCX masih beta." task="review" onAi={onAi} />
    <Card>
      <CardHeader><CardTitle>Validator dokumen</CardTitle><CardDescription>Nama di sini akan ditampilkan pada halaman validasi dokumen.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{fields.map(([key, label]) => <Field key={key} label={label}><Input value={data.validation[key]} onChange={(event) => updateValidation(key, event.target.value)} /></Field>)}</CardContent>
    </Card>
  </div>
}
