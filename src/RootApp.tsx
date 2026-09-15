import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import AppV2 from "./AppV2"
import PlatformApp from "./platform/Workspace"

type Runtime = "checking" | "platform" | "portable"

export default function RootApp() {
  const forcedPortable = new URLSearchParams(window.location.search).has("portable")
  const [runtime, setRuntime] = useState<Runtime>(forcedPortable ? "portable" : "checking")
  useEffect(() => {
    if (forcedPortable) return
    const controller = new AbortController()
    let alive = true
    const timer = window.setTimeout(() => controller.abort(), 2_500)
    fetch("/api/health", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        const body = response.ok ? await response.json().catch(() => null) as { service?: string } | null : null
        if (alive) setRuntime(body?.service === "rps-obe-api" || import.meta.env.DEV ? "platform" : "portable")
      })
      .catch(() => { if (alive) setRuntime(import.meta.env.DEV ? "platform" : "portable") })
      .finally(() => window.clearTimeout(timer))
    return () => { alive = false; window.clearTimeout(timer); controller.abort() }
  }, [forcedPortable])
  if (runtime === "checking") return <div className="grid min-h-svh place-items-center bg-[#f4f7f9]"><div className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin text-primary" />Mendeteksi workspace…</div></div>
  return runtime === "platform" ? <PlatformApp /> : <AppV2 />
}
