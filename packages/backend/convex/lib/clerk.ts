"use node"

import { createClerkClient } from "@clerk/backend"

let cachedClerkClient:
  | ReturnType<typeof createClerkClient>
  | null = null
let cachedSecretKey: string | null = null

export function getClerkBackendClient() {
  const secretKey = process.env.CLERK_SECRET_KEY

  if (!secretKey) {
    throw new Error("Missing CLERK_SECRET_KEY")
  }

  if (cachedClerkClient && cachedSecretKey === secretKey) {
    return cachedClerkClient
  }

  cachedSecretKey = secretKey
  cachedClerkClient = createClerkClient({ secretKey })

  return cachedClerkClient
}

