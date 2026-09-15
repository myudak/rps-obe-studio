import { inflateRawSync } from "node:zlib"

// Bound decompression before handing untrusted XLSX XML to the workbook parser.
export function validateWorkbookArchive(buffer: Buffer) {
  const footer = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (footer < 0 || footer + 22 > buffer.length) throw new Error("Invalid ZIP")
  const entries = buffer.readUInt16LE(footer + 10)
  let cursor = buffer.readUInt32LE(footer + 16), total = 0
  if (entries > 200 || entries === 0) throw new Error("Too many ZIP entries")
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP directory")
    const method = buffer.readUInt16LE(cursor + 10), compressed = buffer.readUInt32LE(cursor + 20), size = buffer.readUInt32LE(cursor + 24), local = buffer.readUInt32LE(cursor + 42)
    if (size > 20 * 1024 * 1024 || total + size > 20 * 1024 * 1024 || local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("Workbook is too large")
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    if (start + compressed > buffer.length) throw new Error("Invalid ZIP entry")
    const bytes = buffer.subarray(start, start + compressed)
    const inflated = method === 0 ? bytes : method === 8 ? inflateRawSync(bytes, { maxOutputLength: 20 * 1024 * 1024 }) : null
    if (!inflated || inflated.length !== size) throw new Error("Invalid compressed entry")
    total += inflated.length
    cursor += 46 + buffer.readUInt16LE(cursor + 28) + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32)
  }
}
