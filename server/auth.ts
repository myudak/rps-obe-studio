import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"

import { db } from "./db/client.ts"
import { authSchema } from "./db/schema.ts"
import { env } from "./env.ts"

export const auth = betterAuth({
  appName: "RPS OBE Studio",
  baseURL: env.authUrl,
  basePath: "/api/auth",
  secret: env.authSecret,
  trustedOrigins: [env.clientOrigin, env.authUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  advanced: {
    database: {
      joins: false,
    },
    useSecureCookies: false,
  },
})

