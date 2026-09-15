import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://rps_obe:rps_obe@localhost:5433/rps_obe",
  },
  strict: true,
  verbose: true,
})
