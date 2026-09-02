import { downloadBlob, renderRpsBody } from "@/lib/export"
import type { RpsData } from "@/schemas/rps-schema"

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] ?? character))

const safeName = (value: string) => value.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "RPS"

export const improvedDocumentStyles = `
  *{box-sizing:border-box}html{background:#e7ebef}body{margin:0;background:#e7ebef;color:#17212b;font-family:Inter,Arial,sans-serif;font-size:10px;line-height:1.45}.rps-document{padding:24px}.rps-page{width:210mm;min-height:297mm;margin:0 auto 20px;background:#fff;padding:14mm;box-shadow:0 12px 32px rgba(18,35,50,.12);break-after:page;page:rps-portrait}.rps-page:last-child{break-after:auto}.document-kicker{text-align:center;font-size:10px;font-weight:800;letter-spacing:.16em;color:#176da3}.rps-page h1{text-align:center;font-size:24px;margin:12px 0 2px}.subtitle{text-align:center;color:#556875;margin-bottom:24px}.rps-page h2{font-size:13px;margin:18px 0 8px;color:#0f4f78;border-bottom:2px solid #85b8d6;padding-bottom:4px}.rps-page h3{font-size:10px;margin:8px 0}.rps-page p{margin:7px 0}.rps-page table{border-collapse:collapse;width:100%;margin:8px 0 12px;table-layout:fixed}.rps-page th,.rps-page td{border:1px solid #a9b9c5;padding:5px;vertical-align:top;overflow-wrap:anywhere}.rps-page th{background:#e7f1f8;color:#0f4f78;font-weight:700}.rps-page thead{display:table-header-group}.rps-page tr{break-inside:avoid}.note{color:#5a6d79;font-size:9px}.reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.signature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px}.signature-grid>div{border:1px solid #a9b9c5;text-align:center;padding:12px;display:flex;flex-direction:column;gap:3px}.signature-space{height:70px}.generated-at{margin-top:40px!important;text-align:center;color:#71808a}.landscape-page{width:297mm;min-height:210mm;page:rps-landscape}.landscape-page table{font-size:8px}.generated-at small{display:block}@media(max-width:900px){html,body{background:#fff}.rps-document{padding:0;overflow:auto}.rps-page,.landscape-page{width:100%;min-height:auto;margin:0;padding:20px;box-shadow:none}.reference-grid,.signature-grid{grid-template-columns:1fr}}@page rps-portrait{size:A4 portrait;margin:0}@page rps-landscape{size:A4 landscape;margin:0}@media print{html,body{width:auto;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.rps-document{padding:0}.rps-page{width:210mm;min-height:297mm;margin:0;padding:14mm;box-shadow:none;page:rps-portrait}.rps-page.landscape-page{width:297mm;min-height:210mm;page:rps-landscape}.rps-page.landscape-page table{font-size:8px}.rps-page thead{display:table-header-group}.rps-page tr,.signature-grid>div{break-inside:avoid}.rps-page:last-child{break-after:auto}}
`

export function buildImprovedStandaloneHtml(data: RpsData): string {
  return `<!doctype html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(data.meta.code)} — ${escapeHtml(data.meta.courseName)}</title><style>${improvedDocumentStyles}</style></head><body><main class="rps-document">${renderRpsBody(data)}</main></body></html>`
}

export function exportImprovedHtml(data: RpsData) {
  const html = buildImprovedStandaloneHtml(data)
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeName(data.meta.code || data.meta.courseName)}-rps.html`)
}
