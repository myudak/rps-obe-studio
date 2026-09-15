import { createApp } from "./app.ts"
import { closeDatabase } from "./db/client.ts"
import { env } from "./env.ts"
const app = await createApp(true)
const shutdown = async () => { await app.close(); await closeDatabase() }
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
await app.listen({ port: env.port, host: "0.0.0.0" })
