import { CPL_KEYS, type RpsData } from "@/schemas/rps-schema"
import type { StepId } from "@/stores/rps-store"

export type EditorValue = string | number | string[]
export type EditorValueType = "string" | "number" | "string-array"

export type EditorTargetDefinition = {
  id: string
  label: string
  step: StepId
  valueType: EditorValueType
}

const metaLabels: Record<keyof RpsData["meta"], string> = {
  institution: "Universitas / Institusi",
  faculty: "Fakultas / Sekolah",
  program: "Program Studi",
  courseName: "Nama Mata Kuliah",
  courseNameEn: "Course Name",
  code: "Kode Mata Kuliah",
  kbk: "Kelompok Mata Kuliah / KBK",
  sks: "Bobot SKS",
  semester: "Semester",
  review: "Waktu Review",
  descriptionId: "Deskripsi mata kuliah (Indonesia)",
  descriptionEn: "Course description (English)",
  prerequisites: "Mata kuliah prasyarat",
}

const scheduleLabels: Record<Exclude<keyof RpsData["schedule"][number], "week">, string> = {
  cpmk: "CPMK",
  topic: "Topik",
  subtopic: "Subtopik / pustaka",
  outcome: "Sub-CPMK",
  method: "Metode",
  media: "Media",
  assessment: "Assessment",
}

const assessmentLabels: Record<keyof RpsData["assessments"][number], string> = {
  name: "Metode assessment",
  weight: "Bobot assessment",
  cpmk: "CPMK yang diukur",
  notes: "Catatan assessment",
}

const rubricLabels: Record<keyof RpsData["rubrics"][number], string> = {
  criterion: "Kriteria rubrik",
  cpmk: "CPMK rubrik",
  weight: "Bobot rubrik",
  level4: "Deskriptor level 4",
  level3: "Deskriptor level 3",
  level2: "Deskriptor level 2",
  level1: "Deskriptor level 1",
}

const validationLabels: Record<keyof RpsData["validation"], string> = {
  author: "Penyusun RPS",
  authorId: "NIP/NIDN Penyusun",
  coordinator: "Koordinator/GPM",
  head: "Ketua Program Studi",
  date: "Tanggal validasi",
}

function makeDefinitions(): EditorTargetDefinition[] {
  const definitions: EditorTargetDefinition[] = []
  for (const [key, label] of Object.entries(metaLabels)) {
    definitions.push({ id: `meta.${key}`, label, step: "identity", valueType: key === "sks" || key === "semester" ? "number" : "string" })
  }
  CPL_KEYS.forEach((key) => {
    definitions.push({ id: `cpl.${key}.description`, label: `CPL (${key}) — deskripsi`, step: "outcomes", valueType: "string" })
    definitions.push({ id: `cpl.${key}.en`, label: `CPL (${key}) — English`, step: "outcomes", valueType: "string" })
  })
  for (let position = 1; position <= 6; position += 1) {
    definitions.push({ id: `cpmk.${position}.code`, label: `CPMK ${position} — kode`, step: "outcomes", valueType: "string" })
    definitions.push({ id: `cpmk.${position}.text`, label: `CPMK ${position} — rumusan`, step: "outcomes", valueType: "string" })
    definitions.push({ id: `cpmk.${position}.en`, label: `CPMK ${position} — English`, step: "outcomes", valueType: "string" })
    definitions.push({ id: `cpmk.${position}.weight`, label: `CPMK ${position} — bobot`, step: "outcomes", valueType: "number" })
    CPL_KEYS.forEach((key) => definitions.push({ id: `cpmk.${position}.maps.${key}`, label: `Mapping CPMK ${position} ke CPL (${key})`, step: "outcomes", valueType: "number" }))
  }
  for (let position = 1; position <= 3; position += 1) {
    definitions.push({ id: `references.main.${position}`, label: `Referensi utama ${position}`, step: "identity", valueType: "string" })
    definitions.push({ id: `references.additional.${position}`, label: `Referensi pendukung ${position}`, step: "identity", valueType: "string" })
  }
  for (let week = 1; week <= 16; week += 1) {
    for (const [key, label] of Object.entries(scheduleLabels)) {
      definitions.push({ id: `schedule.${week}.${key}`, label: `Minggu ${week} — ${label}`, step: "schedule", valueType: "string" })
    }
  }
  for (let position = 1; position <= 6; position += 1) {
    for (const [key, label] of Object.entries(assessmentLabels)) {
      definitions.push({ id: `assessment.${position}.${key}`, label: `Assessment ${position} — ${label}`, step: "assessment", valueType: key === "weight" ? "number" : key === "cpmk" ? "string-array" : "string" })
    }
  }
  for (let position = 1; position <= 5; position += 1) {
    for (const [key, label] of Object.entries(rubricLabels)) {
      definitions.push({ id: `rubric.${position}.${key}`, label: `Rubrik ${position} — ${label}`, step: "assessment", valueType: key === "weight" ? "number" : "string" })
    }
  }
  for (const [key, label] of Object.entries(validationLabels)) {
    definitions.push({ id: `validation.${key}`, label, step: "final", valueType: "string" })
  }
  return definitions
}

export const EDITOR_TARGETS = makeDefinitions()
const targetMap = new Map(EDITOR_TARGETS.map((target) => [target.id, target]))

export function getEditorTarget(target: string) {
  return targetMap.get(target)
}

export function targetDomProps(target: string) {
  return { "data-editor-target": target }
}

export function getEditorValue(data: RpsData, target: string): EditorValue | undefined {
  const definition = getEditorTarget(target)
  if (!definition) return undefined
  const parts = target.split(".")
  if (parts[0] === "meta") return data.meta[parts[1] as keyof RpsData["meta"]]
  if (parts[0] === "validation") return data.validation[parts[1] as keyof RpsData["validation"]]
  if (parts[0] === "cpl") {
    const index = CPL_KEYS.indexOf(parts[1] as (typeof CPL_KEYS)[number])
    return index >= 0 ? data.cpl[index][parts[2] as "description" | "en"] : undefined
  }
  if (parts[0] === "cpmk") {
    const item = data.cpmk[Number(parts[1]) - 1]
    if (!item) return undefined
    if (parts[2] === "maps") return item.maps[parts[3] as (typeof CPL_KEYS)[number]]
    return item[parts[2] as "code" | "text" | "en" | "weight"]
  }
  if (parts[0] === "references") return data.references[parts[1] as "main" | "additional"][Number(parts[2]) - 1]
  if (parts[0] === "schedule") {
    const item = data.schedule[Number(parts[1]) - 1]
    return item?.[parts[2] as keyof typeof item] as EditorValue | undefined
  }
  if (parts[0] === "assessment") {
    const item = data.assessments[Number(parts[1]) - 1]
    return item?.[parts[2] as keyof typeof item] as EditorValue | undefined
  }
  if (parts[0] === "rubric") {
    const item = data.rubrics[Number(parts[1]) - 1]
    return item?.[parts[2] as keyof typeof item] as EditorValue | undefined
  }
  return undefined
}
