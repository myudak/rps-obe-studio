import { loadEnvFile } from "node:process"

try {
  loadEnvFile()
} catch {
  // A local .env file is optional; defaults keep development setup predictable.
}

const value = (name: string, fallback: string) => process.env[name]?.trim() || fallback

export const env = {
  databaseUrl: value("DATABASE_URL", "postgresql://rps_obe:rps_obe@localhost:5433/rps_obe"),
  authSecret: value("BETTER_AUTH_SECRET", "local-development-secret-change-before-sharing"),
  authUrl: value("BETTER_AUTH_URL", "http://localhost:3001"),
  clientOrigin: value("CLIENT_ORIGIN", "http://localhost:5173"),
  openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() ?? "",
  openRouterModel: value("OPENROUTER_MODEL", "z-ai/glm-5.3-flash"),
  port: Number(value("PORT", "3001")),
}
