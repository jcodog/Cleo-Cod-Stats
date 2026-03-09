import "server-only"

import { flag, dedupe } from "flags/next"
import { vercelAdapter } from "@flags-sdk/vercel"
import { auth, currentUser } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { api } from "@workspace/backend/convex/_generated/api"

export type Plan = "free" | "premium" | "creator"
export type Role = "user" | "staff" | "admin"

type FlagEntities = {
  user?: {
    id: string
    plan: Plan
    role: Role
    email?: string
  }
}

const identify = dedupe(async (): Promise<FlagEntities> => {
  const { userId, getToken } = await auth()

  if (!userId) {
    return {}
  }

  const token = (await getToken()) ?? undefined

  const [dbUser, clerkUser] = await Promise.all([
    fetchQuery(api.queries.users.current, {}, { token }),
    currentUser(),
  ])

  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress

  const plan: Plan = dbUser?.plan ?? "free"
  const role: Role = dbUser?.role ?? "user"

  return {
    user: {
      id: userId,
      plan,
      role,
      email,
    },
  }
})

function makeBooleanFlag(key: string, description?: string) {
  return flag<boolean, FlagEntities>({
    key,
    adapter: vercelAdapter(),
    defaultValue: false,
    description,
    identify,
    options: [
      { value: true, label: "Enabled" },
      { value: false, label: "Disabled" },
    ],
  })
}

export const flags = {
  overlays: makeBooleanFlag("overlays"),
  dashboardStatsEditor: makeBooleanFlag("dashboard-stats-editor"),
  checkout: makeBooleanFlag("checkout"),
} as const

export type AppFlagKey = keyof typeof flags

export async function isFlagEnabled(flagKey: AppFlagKey) {
  return flags[flagKey]()
}
