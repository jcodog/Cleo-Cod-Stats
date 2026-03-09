import "server-only"

import { flag, dedupe } from "flags/next"
import { vercelAdapter } from "@flags-sdk/vercel"
import { auth, currentUser } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { api } from "@workspace/backend/convex/_generated/api"
import type { UserRole } from "@workspace/backend/convex/lib/staffRoles"

export type Plan = "free" | "premium" | "creator"
export type Role = UserRole

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
  overlays: makeBooleanFlag(
    "overlays",
    "Enable the user to use the overlays configurator"
  ),
  dashboardStatsEditor: makeBooleanFlag(
    "dashboard-stats-editor",
    "Enables the user to be able to create a new session, end their session and log stats as well as tweak SR in case of SR loss returns and missed match logging"
  ),
  checkout: makeBooleanFlag(
    "checkout",
    "Enables the new checkout page for the user"
  ),
} as const

export type AppFlagKey = keyof typeof flags

export async function isFlagEnabled(flagKey: AppFlagKey) {
  return flags[flagKey]()
}
