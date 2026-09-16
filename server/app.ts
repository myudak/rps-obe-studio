import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import Fastify from "fastify"
import { ZodError } from "zod"
import type { LanguageModel } from "ai"

import { env } from "./env.ts"
import { HttpError } from "./lib/access.ts"
import { registerAiRoutes } from "./routes/ai-routes.ts"
import { registerAuthRoutes } from "./routes/auth-routes.ts"
import { registerOutcomeRoutes } from "./routes/outcome-routes.ts"
import { registerPlatformRoutes } from "./routes/platform-routes.ts"
import { registerRpsRoutes } from "./routes/rps-routes.ts"
import { registerAcademicRoutes } from "./routes/academic-routes.ts"
import { registerImportRoutes } from "./routes/import-routes.ts"
import { registerAdminStudioRoutes } from "./routes/admin-studio-routes.ts"
import { registerOutcomeSystemRoutes } from "./routes/outcome-system-routes.ts"
import { registerDataBrowserRoutes } from "./routes/data-browser-routes.ts"
import { registerFullDemoRoutes } from "./routes/full-demo-routes.ts"

export async function createApp(logger = false, modelOverride?: LanguageModel) {
const app = Fastify({ logger })
app.addHook("onRequest", async request => {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin && ![env.clientOrigin, env.authUrl].includes(request.headers.origin)) throw new HttpError(403, "Origin permintaan tidak diizinkan.")
})
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4 } })

await app.register(cors, {
  origin: [env.clientOrigin, env.authUrl],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
})

app.get("/api/health", async () => ({ service: "rps-obe-api", status: "ok" }))
await registerAuthRoutes(app)
await registerPlatformRoutes(app)
await registerRpsRoutes(app)
await registerOutcomeRoutes(app)
await registerAiRoutes(app, modelOverride)
await registerAcademicRoutes(app)
await registerImportRoutes(app)
await registerAdminStudioRoutes(app)
await registerOutcomeSystemRoutes(app)
await registerDataBrowserRoutes(app)
await registerFullDemoRoutes(app)

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof HttpError) return reply.status(error.statusCode).send({ error: error.message })
  if (error instanceof ZodError) return reply.status(400).send({ error: "Data permintaan tidak valid.", issues: error.issues })
  const known = error as { code?: string; statusCode?: number; cause?: { code?: string } }
  if (known.code === "23505" || known.cause?.code === "23505") return reply.status(409).send({ error: "Data dengan kode atau relasi tersebut sudah ada." })
  if (known.code === "23503" || known.cause?.code === "23503") return reply.status(409).send({ error: "Relasi data tidak tersedia atau masih digunakan." })
  if (known.statusCode === 413) return reply.status(413).send({ error: "Berkas melebihi batas ukuran yang diizinkan." })
  app.log.error(error)
  return reply.status(500).send({ error: "Terjadi kesalahan pada server." })
})


return app
}
