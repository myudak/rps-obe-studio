import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx"

import { CPL_KEYS, type RpsData } from "@/schemas/rps-schema"

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] ?? character))

const safeName = (value: string) => value.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "RPS"
const star = (value: number) => value === 3 ? "***" : value === 2 ? "**" : value === 1 ? "*" : ""
const table = (headers: string[], rows: Array<Array<string | number>>) => `
  <table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`

export function renderRpsBody(data: RpsData): string {
  const activeCpl = data.cpl.filter((item) => item.description.trim())
  return `
    <section class="rps-page cover-page">
      <div class="document-kicker">RENCANA PEMBELAJARAN SEMESTER (RPS)</div>
      <h1>${escapeHtml(data.meta.courseName || "Nama Mata Kuliah")}</h1>
      <p class="subtitle"><em>${escapeHtml(data.meta.courseNameEn)}</em></p>
      ${table(["Institusi", "Fakultas", "Program Studi"], [[escapeHtml(data.meta.institution), escapeHtml(data.meta.faculty), escapeHtml(data.meta.program)]])}
      ${table(["Kode", "Kelompok MK", "SKS", "Semester", "Waktu Review"], [[escapeHtml(data.meta.code), escapeHtml(data.meta.kbk), data.meta.sks, data.meta.semester, escapeHtml(data.meta.review)]])}
      <h2>Deskripsi Mata Kuliah <em>/ Course Description</em></h2>
      <p>${escapeHtml(data.meta.descriptionId)}</p>
      <p><em>${escapeHtml(data.meta.descriptionEn)}</em></p>
      <h2>Capaian Pembelajaran Lulusan (CPL)</h2>
      ${table(["Kode", "Deskripsi CPL / PLO description"], activeCpl.map((item) => [escapeHtml(item.code), `${escapeHtml(item.description)}<br><em>${escapeHtml(item.en)}</em>`]))}
    </section>
    <section class="rps-page">
      <h2>Capaian Pembelajaran Mata Kuliah (CPMK)</h2>
      ${table(["Kode", "Rumusan CPMK", "CLO", "Bobot"], data.cpmk.map((item) => [escapeHtml(item.code), escapeHtml(item.text), `<em>${escapeHtml(item.en)}</em>`, `${item.weight}%`]))}
      <h2>Matriks CPL–CPMK</h2>
      ${table(["CPMK", ...CPL_KEYS.map((key) => `(${key})`)], data.cpmk.map((item) => [escapeHtml(item.code), ...CPL_KEYS.map((key) => star(item.maps[key]))]))}
      <p class="note">Keterangan: * kontribusi rendah; ** kontribusi sedang; *** kontribusi utama.</p>
      <h2>Prasyarat & Referensi</h2>
      <p><strong>Prasyarat:</strong> ${escapeHtml(data.meta.prerequisites)}</p>
      <div class="reference-grid"><div><h3>Referensi utama</h3><ol>${data.references.main.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div><div><h3>Referensi pendukung</h3><ol>${data.references.additional.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></div></div>
    </section>
    <section class="rps-page landscape-page">
      <h2>Jadwal Perkuliahan / Learning Schedule</h2>
      ${table(["Mgg", "CPMK", "Topik", "Subtopik", "Sub-CPMK", "Metode", "Media", "Assessment"], data.schedule.map((item) => [item.week, escapeHtml(item.cpmk), escapeHtml(item.topic), escapeHtml(item.subtopic), escapeHtml(item.outcome), escapeHtml(item.method), escapeHtml(item.media), escapeHtml(item.assessment)]))}
    </section>
    <section class="rps-page">
      <h2>Rencana Evaluasi</h2>
      ${table(["Metode", "Bobot", "CPMK yang diukur", "Catatan"], data.assessments.map((item) => [escapeHtml(item.name), `${item.weight}%`, escapeHtml(item.cpmk.join(", ")), escapeHtml(item.notes)]))}
      <h2>Rubrik Analitik</h2>
      ${table(["Kriteria", "CPMK", "Bobot", "4 — Sangat Baik", "3 — Baik", "2 — Cukup", "1 — Kurang"], data.rubrics.map((item) => [escapeHtml(item.criterion), escapeHtml(item.cpmk), `${item.weight}%`, escapeHtml(item.level4), escapeHtml(item.level3), escapeHtml(item.level2), escapeHtml(item.level1)]))}
    </section>
    <section class="rps-page validation-page">
      <h2>Validasi Dokumen</h2>
      <div class="signature-grid">
        <div><strong>Penyusun RPS</strong><span class="signature-space"></span><b>${escapeHtml(data.validation.author)}</b><small>${escapeHtml(data.validation.authorId)}</small></div>
        <div><strong>Koordinator/GPM</strong><span class="signature-space"></span><b>${escapeHtml(data.validation.coordinator)}</b><small>${escapeHtml(data.validation.date)}</small></div>
        <div><strong>Ketua Program Studi</strong><span class="signature-space"></span><b>${escapeHtml(data.validation.head)}</b><small>${escapeHtml(data.validation.date)}</small></div>
      </div>
      <p class="generated-at">Dihasilkan oleh RPS OBE Studio · ${new Date(data.updatedAt).toLocaleString("id-ID")}</p>
    </section>`
}

export const documentStyles = `
  *{box-sizing:border-box}body{margin:0;background:#e7ebef;color:#17212b;font-family:Inter,Arial,sans-serif;font-size:10px;line-height:1.45}.rps-document{padding:24px}.rps-page{width:210mm;min-height:297mm;margin:0 auto 20px;background:#fff;padding:14mm;box-shadow:0 12px 32px rgba(18,35,50,.12);page-break-after:always}.rps-page:last-child{page-break-after:auto}.document-kicker{text-align:center;font-size:10px;font-weight:800;letter-spacing:.16em;color:#176da3}.rps-page h1{text-align:center;font-size:24px;margin:12px 0 2px}.subtitle{text-align:center;color:#556875;margin-bottom:24px}.rps-page h2{font-size:13px;margin:18px 0 8px;color:#0f4f78;border-bottom:2px solid #85b8d6;padding-bottom:4px}.rps-page h3{font-size:10px;margin:8px 0}.rps-page p{margin:7px 0}.rps-page table{border-collapse:collapse;width:100%;margin:8px 0 12px;table-layout:fixed}.rps-page th,.rps-page td{border:1px solid #a9b9c5;padding:5px;vertical-align:top;overflow-wrap:anywhere}.rps-page th{background:#e7f1f8;color:#0f4f78;font-weight:700}.note{color:#5a6d79;font-size:9px}.reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.signature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px}.signature-grid>div{border:1px solid #a9b9c5;text-align:center;padding:12px;display:flex;flex-direction:column;gap:3px}.signature-space{height:70px}.generated-at{margin-top:40px!important;text-align:center;color:#71808a}.landscape-page{width:297mm;min-height:210mm}.landscape-page table{font-size:8px}.generated-at small{display:block}@media(max-width:900px){body{background:#fff}.rps-document{padding:0;overflow:auto}.rps-page,.landscape-page{width:100%;min-height:auto;margin:0;padding:20px;box-shadow:none}.reference-grid,.signature-grid{grid-template-columns:1fr}}@media print{body{background:#fff}.rps-document{padding:0}.rps-page{margin:0;box-shadow:none}.landscape-page{width:210mm;min-height:297mm}.landscape-page table{font-size:7px}}`

export function buildStandaloneHtml(data: RpsData): string {
  return `<!doctype html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(data.meta.code)} — ${escapeHtml(data.meta.courseName)}</title><style>${documentStyles}</style></head><body><main class="rps-document">${renderRpsBody(data)}</main></body></html>`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => { URL.revokeObjectURL(url); anchor.remove() }, 500)
}

export function exportJson(data: RpsData) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${safeName(data.meta.code || data.meta.courseName)}-rps.json`)
}

export function exportHtml(data: RpsData) {
  downloadBlob(new Blob([buildStandaloneHtml(data)], { type: "text/html;charset=utf-8" }), `${safeName(data.meta.code || data.meta.courseName)}-rps.html`)
}

const WORD_BLUE = "135E96"
const WORD_BLUE_LIGHT = "DCEAF5"
const WORD_BORDER = "AAB8C2"
const wordBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: WORD_BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: WORD_BORDER },
  left: { style: BorderStyle.SINGLE, size: 2, color: WORD_BORDER },
  right: { style: BorderStyle.SINGLE, size: 2, color: WORD_BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: WORD_BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: WORD_BORDER },
}

function wordText(value: unknown, options: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) {
  const lines = String(value ?? "").split("\n")
  return lines.map((line, index) => new TextRun({
    text: line || " ",
    break: index ? 1 : undefined,
    font: "Arial",
    size: options.size ?? 18,
    bold: options.bold,
    italics: options.italics,
    color: options.color,
  }))
}

function wordParagraph(value: unknown, options: { bold?: boolean; italics?: boolean; size?: number; color?: string; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; keepNext?: boolean } = {}) {
  return new Paragraph({
    children: wordText(value || "—", options),
    alignment: options.alignment,
    keepNext: options.keepNext,
    spacing: { before: options.before ?? 0, after: options.after ?? 80, line: 250 },
  })
}

function wordHeading(value: string, level: 1 | 2 = 1) {
  return wordParagraph(value, {
    bold: true,
    size: level === 1 ? 25 : 21,
    color: WORD_BLUE,
    before: level === 1 ? 200 : 120,
    after: 100,
    keepNext: true,
  })
}

function wordCell(value: unknown, header = false, fontSize = 16) {
  return new TableCell({
    children: [wordParagraph(value, { bold: header, size: fontSize, color: header ? WORD_BLUE : undefined, after: 0 })],
    shading: header ? { fill: WORD_BLUE_LIGHT } : undefined,
    margins: { top: 75, bottom: 75, left: 75, right: 75 },
  })
}

function wordTable(headers: string[], rows: Array<Array<string | number>>, fontSize = 16) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.AUTOFIT,
    borders: wordBorders,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((header) => wordCell(header, true, fontSize)) }),
      ...rows.map((row) => new TableRow({ cantSplit: false, children: row.map((cell) => wordCell(cell, false, fontSize)) })),
    ],
  })
}

const portraitPage = {
  size: { orientation: PageOrientation.PORTRAIT },
  margin: { top: 720, right: 650, bottom: 720, left: 650 },
}

export async function buildDocxBlob(data: RpsData) {
  const activeCpl = data.cpl.filter((item) => item.description.trim())
  const doc = new Document({
    creator: "RPS OBE Studio UNDIP",
    title: `${data.meta.code} — ${data.meta.courseName}`,
    subject: "Rencana Pembelajaran Semester berbasis OBE",
    description: "Dokumen RPS yang dibuat melalui RPS OBE Studio UNDIP.",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 20, color: "17211D" },
          paragraph: { spacing: { after: 90, line: 260 } },
        },
      },
    },
    sections: [
      {
        properties: { page: portraitPage },
        children: [
          wordParagraph("RENCANA PEMBELAJARAN SEMESTER (RPS)", { bold: true, size: 32, color: WORD_BLUE, alignment: AlignmentType.CENTER, after: 70 }),
          wordParagraph("LEARNING PLAN", { bold: true, size: 20, color: WORD_BLUE, alignment: AlignmentType.CENTER, after: 180 }),
          wordParagraph(`${data.meta.courseName || "Nama Mata Kuliah"} / ${data.meta.courseNameEn || "Course Name"}`, { bold: true, size: 25, alignment: AlignmentType.CENTER, after: 180 }),
          wordTable(["Institusi", "Fakultas", "Program Studi"], [[data.meta.institution, data.meta.faculty, data.meta.program]], 17),
          wordTable(["Kode", "Kelompok MK", "SKS", "Semester", "Waktu Review"], [[data.meta.code, data.meta.kbk, data.meta.sks, data.meta.semester, data.meta.review]], 16),
          wordHeading("Deskripsi Mata Kuliah / Course Description"),
          wordParagraph(data.meta.descriptionId, { size: 19 }),
          wordParagraph(data.meta.descriptionEn, { size: 19, italics: true }),
          wordHeading("Capaian Pembelajaran Lulusan (CPL) / Program Learning Outcomes"),
          wordTable(["Kode", "Deskripsi CPL / PLO description"], activeCpl.map((item) => [item.code, `${item.description}\n${item.en}`]), 17),
          wordHeading("Capaian Pembelajaran Mata Kuliah (CPMK) / Course Learning Outcomes"),
          wordTable(["Kode", "Rumusan CPMK", "English CLO", "Bobot"], data.cpmk.map((item) => [item.code, item.text, item.en, `${item.weight}%`]), 16),
          wordHeading("Matriks CPL–CPMK / PLO–CLO Matrix"),
          wordTable(["CPMK", ...CPL_KEYS.map((key) => `(${key})`)], data.cpmk.map((item) => [item.code, ...CPL_KEYS.map((key) => star(item.maps[key]))]), 15),
          wordParagraph("Keterangan: * kontribusi rendah; ** kontribusi sedang; *** kontribusi utama.", { size: 16, italics: true }),
          wordHeading("Prasyarat & Referensi"),
          wordParagraph(`Prasyarat: ${data.meta.prerequisites}`),
          wordHeading("Referensi utama", 2),
          ...data.references.main.filter(Boolean).map((item, index) => wordParagraph(`${index + 1}. ${item}`, { size: 18 })),
          wordHeading("Referensi pendukung", 2),
          ...data.references.additional.filter(Boolean).map((item, index) => wordParagraph(`${index + 1}. ${item}`, { size: 18 })),
        ],
      },
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 600, right: 500, bottom: 600, left: 500 },
          },
        },
        children: [
          wordHeading("Jadwal Perkuliahan / Learning Schedule"),
          wordTable(
            ["Mgg", "CPMK", "Topik", "Subtopik", "Sub-CPMK", "Metode", "Media", "Assessment"],
            data.schedule.map((item) => [item.week, item.cpmk, item.topic, item.subtopic, item.outcome, item.method, item.media, item.assessment]),
            13,
          ),
        ],
      },
      {
        properties: { page: portraitPage },
        children: [
          wordHeading("Rencana Evaluasi"),
          wordTable(["Metode", "Bobot", "CPMK yang diukur", "Catatan"], data.assessments.map((item) => [item.name, `${item.weight}%`, item.cpmk.join(", "), item.notes]), 16),
          wordHeading("Rubrik Penilaian Analitik"),
          wordTable(
            ["Kriteria", "CPMK", "Bobot", "4 — Sangat Baik", "3 — Baik", "2 — Cukup", "1 — Kurang"],
            data.rubrics.map((item) => [item.criterion, item.cpmk, `${item.weight}%`, item.level4, item.level3, item.level2, item.level1]),
            13,
          ),
        ],
      },
      {
        properties: { page: portraitPage },
        children: [
          wordHeading("Validasi Dokumen / Document Validation"),
          wordTable(
            ["Penyusun RPS", "Koordinator/GPM", "Ketua Program Studi"],
            [[`${data.validation.author}\n${data.validation.authorId}`, data.validation.coordinator, data.validation.head]],
            17,
          ),
          wordParagraph("\n\n\nTanda tangan / persetujuan digital", { alignment: AlignmentType.CENTER, size: 16, italics: true, before: 300 }),
          wordParagraph(`Tanggal validasi: ${data.validation.date || "—"}`, { alignment: AlignmentType.CENTER, size: 17, before: 250 }),
          wordParagraph(`Dihasilkan oleh RPS OBE Studio UNDIP · ${new Date(data.updatedAt).toLocaleString("id-ID")}`, { alignment: AlignmentType.CENTER, size: 15, color: "62707A", before: 500 }),
        ],
      },
    ],
  })
  return Packer.toBlob(doc)
}

export async function exportDocx(data: RpsData) {
  downloadBlob(await buildDocxBlob(data), `${safeName(data.meta.code || data.meta.courseName)}-rps.docx`)
}
