import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"

import { env } from "../env.ts"
import * as schema from "./schema.ts"

export const sqlClient = postgres(env.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(sqlClient, { schema })

export async function closeDatabase() {
  await sqlClient.end({ timeout: 5 })
}

