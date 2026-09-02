import { renderRpsBody } from "@/lib/export"
import type { RpsData } from "@/schemas/rps-schema"

export function DocumentPreview({ data }: { data: RpsData }) {
  return <div className="document-preview-shell"><main className="rps-document" dangerouslySetInnerHTML={{ __html: renderRpsBody(data) }} /></div>
}
