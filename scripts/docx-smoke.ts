import { writeFile } from "node:fs/promises"

import { buildDocxBlob } from "../src/lib/export"
import { createExampleRps } from "../src/schemas/rps-schema"

const output = "/tmp/rps-obe-studio-docx-smoke.docx"
const blob = await buildDocxBlob(createExampleRps())
await writeFile(output, new Uint8Array(await blob.arrayBuffer()))
console.log(`${output} (${blob.size} bytes)`)
