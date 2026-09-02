import { CPL_KEYS, detectBloom, type RpsData } from "@/schemas/rps-schema"
import type { StepId } from "@/stores/rps-store"

export type IssueLevel = "pass" | "warning" | "error"
export type ValidationIssue = {
  id: string
  level: IssueLevel
  step: StepId
  title: string
  detail: string
}

const sum = (values: number[]) => values.reduce((total, value) => total + (Number(value) || 0), 0)

export function validateRps(data: RpsData): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const add = (level: IssueLevel, step: StepId, id: string, title: string, detail: string) => {
    issues.push({ level, step, id, title, detail })
  }

  const requiredMeta = ["institution", "faculty", "program", "courseName", "code", "kbk", "review", "descriptionId"] as const
  const missingMeta = requiredMeta.filter((key) => !String(data.meta[key]).trim())
  add(
    missingMeta.length ? "error" : "pass",
    "identity",
    "identity",
    missingMeta.length ? "Identitas belum lengkap" : "Identitas RPS lengkap",
    missingMeta.length ? `Kosong: ${missingMeta.join(", ")}` : "Header dan deskripsi utama tersedia.",
  )

  const activeCpl = data.cpl.filter((item) => item.description.trim())
  add(activeCpl.length ? "pass" : "error", "outcomes", "cpl", activeCpl.length ? "CPL tersedia" : "CPL kosong", activeCpl.length ? `${activeCpl.length} CPL aktif.` : "Isi minimal satu CPL resmi program studi.")

  const emptyCpmk = data.cpmk.filter((item) => !item.text.trim())
  add(emptyCpmk.length ? "error" : "pass", "outcomes", "cpmk", emptyCpmk.length ? "CPMK belum lengkap" : "CPMK lengkap", emptyCpmk.length ? `${emptyCpmk.length} CPMK masih kosong.` : `${data.cpmk.length} CPMK telah dirumuskan.`)

  const noMapping = data.cpmk.filter((item) => !CPL_KEYS.some((key) => item.maps[key] > 0))
  add(noMapping.length ? "error" : "pass", "outcomes", "mapping", noMapping.length ? "Mapping CPL belum lengkap" : "Mapping CPL–CPMK lengkap", noMapping.length ? noMapping.map((item) => item.code).join(", ") : "Setiap CPMK memiliki kontribusi CPL.")

  const unknownBloom = data.cpmk.filter((item) => item.text.trim() && detectBloom(item.text) === "?")
  add(unknownBloom.length ? "warning" : "pass", "outcomes", "bloom", unknownBloom.length ? "Kata kerja Bloom belum dikenali" : "Kata kerja terukur", unknownBloom.length ? unknownBloom.map((item) => item.code).join(", ") : "Semua rumusan memakai kata kerja yang dikenali.")

  const cpmkWeight = sum(data.cpmk.map((item) => item.weight))
  add(Math.abs(cpmkWeight - 100) > 0.01 ? "error" : "pass", "outcomes", "cpmk-weight", `Bobot CPMK ${cpmkWeight}%`, Math.abs(cpmkWeight - 100) > 0.01 ? "Total wajib 100%." : "Total bobot konsisten.")

  const scheduleMissing = data.schedule.filter((item) => ![8, 16].includes(item.week) && (!item.topic.trim() || !item.outcome.trim() || !item.method.trim() || !item.assessment.trim()))
  add(scheduleMissing.length ? "warning" : "pass", "schedule", "schedule", scheduleMissing.length ? "Jadwal belum lengkap" : "Jadwal 16 minggu lengkap", scheduleMissing.length ? `${scheduleMissing.length} minggu masih membutuhkan topik, outcome, metode, atau assessment.` : "Termasuk UTS dan UAS.")

  const validWeeks = new Set(data.schedule.map((item) => item.week)).size === 16 && data.schedule.some((item) => item.week === 8 && item.assessment.toUpperCase().includes("UTS")) && data.schedule.some((item) => item.week === 16 && item.assessment.toUpperCase().includes("UAS"))
  add(validWeeks ? "pass" : "error", "schedule", "schedule-weeks", validWeeks ? "Struktur semester valid" : "Struktur minggu tidak valid", validWeeks ? "Minggu 1–16 unik, termasuk UTS dan UAS." : "Pastikan minggu 1–16 unik, minggu 8 memuat UTS, dan minggu 16 memuat UAS.")

  const assessmentWeight = sum(data.assessments.map((item) => item.weight))
  add(Math.abs(assessmentWeight - 100) > 0.01 ? "error" : "pass", "assessment", "assessment-weight", `Bobot assessment ${assessmentWeight}%`, Math.abs(assessmentWeight - 100) > 0.01 ? "Total wajib 100%." : "Total bobot konsisten.")

  const unmappedAssessment = data.assessments.filter((item) => !item.cpmk.length)
  add(unmappedAssessment.length ? "error" : "pass", "assessment", "assessment-map", unmappedAssessment.length ? "Assessment belum dipetakan" : "Assessment–CPMK terpetakan", unmappedAssessment.length ? unmappedAssessment.map((item) => item.name).join(", ") : "Semua assessment memiliki outcome.")

  const unmeasuredCpmk = data.cpmk.filter((cpmk) => !data.assessments.some((assessment) => assessment.cpmk.includes(cpmk.code)))
  add(unmeasuredCpmk.length ? "error" : "pass", "assessment", "cpmk-coverage", unmeasuredCpmk.length ? "Ada CPMK yang belum diukur" : "Semua CPMK terukur", unmeasuredCpmk.length ? unmeasuredCpmk.map((item) => item.code).join(", ") : "Setiap CPMK terhubung ke minimal satu assessment.")

  const incompleteRubric = data.rubrics.filter((item) => !item.level4.trim() || !item.level3.trim() || !item.level2.trim() || !item.level1.trim())
  add(incompleteRubric.length ? "warning" : "pass", "assessment", "rubric", incompleteRubric.length ? "Rubrik belum lengkap" : "Rubrik analitik lengkap", incompleteRubric.length ? `${incompleteRubric.length} kriteria belum memiliki seluruh deskriptor.` : "Seluruh level 4–1 terdefinisi.")

  const rubricWeight = sum(data.rubrics.map((item) => item.weight))
  add(Math.abs(rubricWeight - 100) > 0.01 ? "error" : "pass", "assessment", "rubric-weight", `Bobot rubrik ${rubricWeight}%`, Math.abs(rubricWeight - 100) > 0.01 ? "Total wajib 100%." : "Total bobot konsisten.")

  const referenceCount = [...data.references.main, ...data.references.additional].filter((item) => item.trim()).length
  add(referenceCount < 2 ? "warning" : "pass", "identity", "references", referenceCount < 2 ? "Referensi masih minim" : "Referensi tersedia", `${referenceCount} referensi tercatat; tetap verifikasi sumber secara manual.`)

  const missingValidator = [data.validation.author, data.validation.coordinator, data.validation.head].filter((item) => !item.trim()).length
  add(missingValidator ? "error" : "pass", "final", "validator", missingValidator ? "Validator belum lengkap" : "Validator lengkap", missingValidator ? "Penyusun, koordinator, dan ketua program studi wajib diisi." : "Tiga peran validasi tersedia.")
  return issues
}

export function stepCompletion(data: RpsData, step: StepId): number {
  const relevant = validateRps(data).filter((issue) => issue.step === step)
  if (!relevant.length) return step === "final" ? 100 : 0
  const score = relevant.reduce((total, issue) => total + (issue.level === "pass" ? 1 : issue.level === "warning" ? 0.5 : 0), 0)
  return Math.round(100 * score / relevant.length)
}

export function overallCompletion(data: RpsData): number {
  const issues = validateRps(data)
  const score = issues.reduce((total, issue) => total + (issue.level === "pass" ? 1 : issue.level === "warning" ? 0.5 : 0), 0)
  return Math.round(100 * score / Math.max(1, issues.length))
}
