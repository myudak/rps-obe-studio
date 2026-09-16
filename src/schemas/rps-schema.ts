import { z } from "zod"

export const CPL_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const
export type CplKey = (typeof CPL_KEYS)[number]
export type MappingLevel = 0 | 1 | 2 | 3

const mappingSchema = z.object({
  a: z.number().int().min(0).max(3),
  b: z.number().int().min(0).max(3),
  c: z.number().int().min(0).max(3),
  d: z.number().int().min(0).max(3),
  e: z.number().int().min(0).max(3),
  f: z.number().int().min(0).max(3),
  g: z.number().int().min(0).max(3),
  h: z.number().int().min(0).max(3),
  i: z.number().int().min(0).max(3),
  j: z.number().int().min(0).max(3),
})

export const rpsSchema = z.object({
  schemaVersion: z.literal(1),
  meta: z.object({
    institution: z.string(),
    faculty: z.string(),
    program: z.string(),
    courseName: z.string(),
    courseNameEn: z.string(),
    code: z.string(),
    kbk: z.string(),
    sks: z.number().min(0),
    semester: z.number().int().min(1).max(14),
    review: z.string(),
    descriptionId: z.string(),
    descriptionEn: z.string(),
    prerequisites: z.string(),
  }),
  cpl: z.array(z.object({
    code: z.string(),
    description: z.string(),
    en: z.string(),
  })).min(1).max(10),
  cpmk: z.array(z.object({
    code: z.string(),
    text: z.string(),
    en: z.string(),
    weight: z.number().min(0).max(100),
    maps: mappingSchema,
  })).min(1).max(20),
  references: z.object({
    main: z.array(z.string()).max(20),
    additional: z.array(z.string()).max(20),
  }),
  schedule: z.array(z.object({
    week: z.number().int().min(1).max(16),
    cpmk: z.string(),
    topic: z.string(),
    subtopic: z.string(),
    outcome: z.string(),
    method: z.string(),
    media: z.string(),
    assessment: z.string(),
  })).length(16),
  assessments: z.array(z.object({
    name: z.string(),
    weight: z.number().min(0).max(100),
    cpmk: z.array(z.string()),
    notes: z.string(),
  })).min(1).max(30),
  rubrics: z.array(z.object({
    criterion: z.string(),
    cpmk: z.string(),
    weight: z.number().min(0).max(100),
    level4: z.string(),
    level3: z.string(),
    level2: z.string(),
    level1: z.string(),
  })).min(1).max(30),
  validation: z.object({
    author: z.string(),
    authorId: z.string(),
    coordinator: z.string(),
    head: z.string(),
    date: z.string(),
  }),
  updatedAt: z.string(),
})

export type RpsData = z.infer<typeof rpsSchema>
export type RpsMeta = RpsData["meta"]
export type Cpl = RpsData["cpl"][number]
export type Cpmk = RpsData["cpmk"][number]
export type ScheduleRow = RpsData["schedule"][number]
export type Assessment = RpsData["assessments"][number]
export type Rubric = RpsData["rubrics"][number]

export const blankMapping = (): Record<CplKey, MappingLevel> => ({
  a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0, i: 0, j: 0,
})

export function createEmptyRps(): RpsData {
  return {
    schemaVersion: 1,
    meta: {
      institution: "Universitas Diponegoro",
      faculty: "Fakultas Sains dan Matematika (FSM)",
      program: "Informatika",
      courseName: "",
      courseNameEn: "",
      code: "",
      kbk: "",
      sks: 3,
      semester: 1,
      review: "",
      descriptionId: "",
      descriptionEn: "",
      prerequisites: "Tidak ada",
    },
    cpl: CPL_KEYS.map((key) => ({ code: `(${key})`, description: "", en: "" })),
    cpmk: Array.from({ length: 6 }, (_, index) => ({
      code: `CPMK ${index + 1}`,
      text: "",
      en: "",
      weight: index < 4 ? 17 : 16,
      maps: blankMapping(),
    })),
    references: { main: ["", "", ""], additional: ["", "", ""] },
    schedule: Array.from({ length: 16 }, (_, index) => ({
      week: index + 1,
      cpmk: index === 7 ? "UTS" : index === 15 ? "UAS" : "CPMK 1",
      topic: index === 7 ? "Ujian Tengah Semester" : index === 15 ? "Ujian Akhir Semester" : "",
      subtopic: "",
      outcome: "",
      method: index === 7 || index === 15 ? "Assessment" : "",
      media: "",
      assessment: index === 7 ? "UTS" : index === 15 ? "UAS" : "",
    })),
    assessments: [
      { name: "Kuis", weight: 10, cpmk: ["CPMK 1"], notes: "" },
      { name: "Tugas", weight: 20, cpmk: ["CPMK 1", "CPMK 2"], notes: "" },
      { name: "UTS", weight: 20, cpmk: ["CPMK 1", "CPMK 2", "CPMK 3"], notes: "" },
      { name: "Proyek", weight: 30, cpmk: ["CPMK 3", "CPMK 4", "CPMK 5"], notes: "" },
      { name: "UAS", weight: 15, cpmk: ["CPMK 4", "CPMK 5", "CPMK 6"], notes: "" },
      { name: "Presentasi", weight: 5, cpmk: ["CPMK 6"], notes: "" },
    ],
    rubrics: Array.from({ length: 5 }, (_, index) => ({
      criterion: `Kriteria ${index + 1}`,
      cpmk: `CPMK ${Math.min(index + 1, 6)}`,
      weight: 20,
      level4: "",
      level3: "",
      level2: "",
      level1: "",
    })),
    validation: { author: "", authorId: "", coordinator: "", head: "", date: "" },
    updatedAt: new Date().toISOString(),
  }
}

export function createExampleRps(): RpsData {
  const data = createEmptyRps()
  data.meta = {
    institution: "Universitas Diponegoro",
    faculty: "Fakultas Sains dan Matematika (FSM)",
    program: "Informatika",
    courseName: "Dasar Pemrograman",
    courseNameEn: "Programming Fundamentals",
    code: "MIK1624102",
    kbk: "Pengembangan Perangkat Lunak",
    sks: 3,
    semester: 1,
    review: "September 2026",
    descriptionId: "Mata kuliah Dasar Pemrograman merupakan mata kuliah awal dalam kelompok pengembangan perangkat lunak. Pembelajaran berfokus pada dasar pemecahan masalah komputasional dan paradigma fungsional menggunakan notasi pemrograman yang sesuai.",
    descriptionEn: "Programming Fundamentals is an introductory course in the software development course group. It focuses on computational problem solving and the functional programming paradigm using appropriate programming notation.",
    prerequisites: "Tidak ada",
  }
  const cplText = [
    ["Mampu menunjukkan sikap profesional, etis, dan bertanggung jawab.", "Able to demonstrate professional, ethical, and responsible conduct."],
    ["Mampu menerapkan pemikiran komputasional untuk menyelesaikan masalah.", "Able to apply computational thinking to solve problems."],
    ["Mampu menerapkan konsep matematika dan ilmu komputer.", "Able to apply mathematical and computer science concepts."],
    ["Mampu merancang dan mengembangkan solusi komputasi.", "Able to design and develop computing solutions."],
    ["Mampu menganalisis dan mengevaluasi sistem komputasi.", "Able to analyze and evaluate computing systems."],
    ["Mampu berkomunikasi dan bekerja sama secara efektif.", "Able to communicate and collaborate effectively."],
  ]
  cplText.forEach(([description, en], index) => {
    data.cpl[index] = { ...data.cpl[index], description, en }
  })
  const cpmkText = [
    ["Mahasiswa mampu menjelaskan konsep algoritma dan representasi program.", "Students are able to explain algorithm concepts and program representations."],
    ["Mahasiswa mampu menerapkan struktur kontrol untuk menyelesaikan masalah.", "Students are able to apply control structures to solve problems."],
    ["Mahasiswa mampu menganalisis masalah menjadi langkah algoritmik.", "Students are able to decompose problems into algorithmic steps."],
    ["Mahasiswa mampu merancang program modular menggunakan fungsi.", "Students are able to design modular programs using functions."],
    ["Mahasiswa mampu mengevaluasi kualitas solusi melalui pengujian dan debugging.", "Students are able to evaluate solution quality through testing and debugging."],
    ["Mahasiswa mampu mengembangkan mini project dan mengomunikasikan hasilnya.", "Students are able to develop a mini-project and communicate the results."],
  ]
  cpmkText.forEach(([text, en], index) => {
    data.cpmk[index] = { ...data.cpmk[index], text, en }
  })
  const mappingPairs: Array<[number, CplKey, MappingLevel]> = [
    [0, "b", 2], [0, "c", 1], [1, "b", 3], [1, "d", 2], [2, "b", 3],
    [2, "d", 2], [3, "d", 3], [3, "c", 1], [4, "e", 3], [4, "d", 2],
    [5, "d", 3], [5, "f", 2],
  ]
  mappingPairs.forEach(([index, key, level]) => { data.cpmk[index].maps[key] = level })
  data.references.main = [
    "Cormen, T. H., et al. Introduction to Algorithms. MIT Press, 2022.",
    "Downey, A. Think Python. O'Reilly Media, 2015.",
    "Python Software Foundation. Python Documentation.",
  ]
  data.references.additional = ["Materi LMS dosen pengampu.", "Artikel terpilih sesuai topik.", ""]
  const topics = [
    "Pengantar algoritma", "Variabel dan tipe data", "Percabangan", "Perulangan",
    "Fungsi dan modularisasi", "Array dan list", "String", "Ujian Tengah Semester",
    "File I/O", "Debugging", "Pencarian", "Pengurutan", "Desain mini project",
    "Implementasi mini project", "Evaluasi mini project", "Ujian Akhir Semester",
  ]
  data.schedule = data.schedule.map((row, index) => ({
    ...row,
    cpmk: index === 7 ? "UTS" : index === 15 ? "UAS" : `CPMK ${Math.min(6, Math.floor(index * 6 / 15) + 1)}`,
    topic: topics[index],
    subtopic: index === 7 || index === 15 ? "Instrumen ujian" : `Bahan ajar minggu ${index + 1}`,
    outcome: index === 7 || index === 15 ? "CPMK yang diukur" : `Mahasiswa mampu menerapkan kompetensi minggu ${index + 1}`,
    method: index === 7 || index === 15 ? "Assessment" : index > 11 ? "Project-based learning" : "Diskusi dan praktikum",
    media: index === 7 || index === 15 ? "Soal dan rubrik" : "LMS, slide, IDE",
    assessment: index === 7 ? "UTS" : index === 15 ? "UAS" : index > 11 ? "Proyek" : index % 3 === 0 ? "Kuis" : "Latihan",
  }))
  data.rubrics = ["Ketepatan konsep", "Kebenaran solusi", "Kualitas implementasi", "Analisis", "Komunikasi"].map((criterion, index) => ({
    criterion,
    cpmk: `CPMK ${Math.min(index + 1, 6)}`,
    weight: 20,
    level4: "Sangat tepat, lengkap, mandiri, dan konsisten.",
    level3: "Tepat dengan kekurangan minor.",
    level2: "Sebagian benar, masih ada kekeliruan penting.",
    level1: "Belum menunjukkan kompetensi minimum.",
  }))
  data.validation = { author: "Dosen Penyusun", authorId: "NIP/NIDN", coordinator: "Koordinator/GPM", head: "Ketua Program Studi", date: "24 Agustus 2026" }
  data.updatedAt = new Date().toISOString()
  return data
}

export function detectBloom(text: string): string {
  const value = text.toLowerCase()
  const rules: Array<[string, string[]]> = [
    ["C6", ["menciptakan", "merancang", "mengembangkan", "membangun", "menghasilkan"]],
    ["C5", ["mengevaluasi", "menilai", "membandingkan", "memvalidasi"]],
    ["C4", ["menganalisis", "menguraikan", "mengidentifikasi", "membedakan"]],
    ["C3", ["menerapkan", "menggunakan", "mengimplementasikan", "menghitung"]],
    ["C2", ["menjelaskan", "mengklasifikasikan", "merangkum", "menginterpretasikan"]],
    ["C1", ["mengingat", "menyebutkan", "mengenali"]],
  ]
  return rules.find(([, verbs]) => verbs.some((verb) => value.includes(verb)))?.[0] ?? "?"
}
