import { useRef, useState } from "react"
import { Database, Download, HardDrive, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import type { PersistenceStatus, StorageDetails } from "@/hooks/use-app-persistence"

function formatBytes(value: number | null) {
  if (value === null) return "Tidak tersedia"
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

const statusLabel: Record<PersistenceStatus, string> = {
  loading: "Memuat",
  saving: "Menyimpan",
  saved: "Tersimpan",
  error: "Gagal",
  "memory-only": "Memory saja",
}

export function StoragePrivacyDialog({ open, onOpenChange, status, error, lastSavedAt, details, onRequestPersistence, onExport, onImport, onClear }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: PersistenceStatus
  error: string
  lastSavedAt: string | null
  details: StorageDetails
  onRequestPersistence: () => Promise<boolean>
  onExport: () => Promise<void>
  onImport: (file: File) => Promise<void>
  onClear: () => Promise<void>
}) {
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const run = async (label: string, action: () => Promise<void>, success: string) => {
    setBusy(label); setMessage("")
    try { await action(); setMessage(success) }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Operasi penyimpanan gagal.") }
    finally { setBusy("") }
  }
  const requestPersistence = () => run("persist", async () => {
    const granted = await onRequestPersistence()
    if (!granted) throw new Error("Browser belum memberikan persistent storage. Data tetap disimpan dalam mode best-effort.")
  }, "Persistent storage aktif. Browser tidak akan menghapus data kecuali atas tindakan pengguna.")
  const importFile = async (file?: File) => {
    if (!file) return
    await run("import", () => onImport(file), "Workspace berhasil dipulihkan dari backup.")
    if (fileRef.current) fileRef.current.value = ""
  }
  const clear = async () => {
    if (!window.confirm("Hapus seluruh RPS, chat, preferensi, cache model, dan API key yang tersimpan di perangkat ini? Tindakan ini tidak dapat dibatalkan.")) return
    await run("clear", onClear, "Seluruh data lokal berhasil dihapus.")
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Database className="size-4 text-primary" />Storage & Privacy</DialogTitle><DialogDescription>RPS, chat, dan preferensi disimpan di IndexedDB pada browser ini. Credential OpenRouter dikelola terpisah.</DialogDescription></DialogHeader>
      <div className="space-y-5">
        <div className="border-l-2 border-primary bg-muted/30 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Status autosave</p><p className="mt-1 text-xs text-muted-foreground">{lastSavedAt ? `Terakhir ${new Date(lastSavedAt).toLocaleString("id-ID")}` : "Belum ada penyimpanan"}</p></div><Badge variant={status === "error" || status === "memory-only" ? "destructive" : "outline"}>{status === "saving" && <Loader2 className="animate-spin" />}{statusLabel[status]}</Badge></div>{error && <p className="mt-3 text-xs text-destructive">{error}</p>}</div>
        <div className="grid grid-cols-2 divide-x border-y"><div className="p-3"><p className="text-xs text-muted-foreground">Digunakan</p><p className="mt-1 text-sm font-semibold">{formatBytes(details.usage)}</p></div><div className="p-3"><p className="text-xs text-muted-foreground">Retention</p><p className="mt-1 text-sm font-semibold">{details.persistent === true ? "Persistent" : details.persistent === false ? "Best effort" : "Tidak diketahui"}</p></div></div>
        {details.quota !== null && <p className="text-xs text-muted-foreground">Estimasi kuota origin: {formatBytes(details.quota)}.</p>}
        {details.persistent !== true && <Button variant="outline" onClick={() => void requestPersistence()} disabled={Boolean(busy)}>{busy === "persist" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Aktifkan penyimpanan permanen</Button>}
        <Separator />
        <div><h3 className="text-sm font-semibold">Backup workspace</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Backup mencakup RPS, chat, dan preferensi non-secret. API key tidak pernah masuk file backup.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void run("export", onExport, "Backup berhasil diunduh.")} disabled={Boolean(busy)}>{busy === "export" ? <Loader2 className="animate-spin" /> : <Download />}Backup workspace</Button><Button variant="outline" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>{busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />}Pulihkan backup</Button><input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></div></div>
        <Alert><HardDrive /><AlertTitle>Catatan portable HTML</AlertTitle><AlertDescription>Pertahankan lokasi dan nama file HTML agar browser memakai storage origin yang sama. Memindahkan file atau memakai private browsing dapat membuat data terlihat seperti workspace baru.</AlertDescription></Alert>
        {message && <Alert><ShieldCheck /><AlertTitle>Status operasi</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
        <Separator />
        <div className="border-t border-destructive/30 pt-4"><h3 className="text-sm font-semibold text-destructive">Hapus data perangkat</h3><p className="mt-1 text-xs text-muted-foreground">Menghapus IndexedDB, chat, cache model, preferensi, serta credential tersimpan.</p><Button className="mt-3" variant="destructive" onClick={() => void clear()} disabled={Boolean(busy)}>{busy === "clear" ? <Loader2 className="animate-spin" /> : <Trash2 />}Hapus semua data lokal</Button></div>
      </div>
      <DialogFooter><Button onClick={() => onOpenChange(false)}>Selesai</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
