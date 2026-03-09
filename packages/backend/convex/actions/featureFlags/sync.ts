"use node"

import { internal } from "../../_generated/api"
import { internalAction } from "../../_generated/server"

type VercelFlagListItem = {
  id?: string
  slug?: string
  key?: string
  name?: string
  [key: string]: unknown
}

export const syncFromVercel = internalAction({
  args: {},
  handler: async (ctx) => {
    const token = process.env.VERCEL_ACCESS_TOKEN
    const project = process.env.VERCEL_PROJECT_ID_OR_NAME
    const teamId = process.env.VERCEL_TEAM_ID

    if (!token) throw new Error("Missing VERCEL_ACCESS_TOKEN")
    if (!project) throw new Error("Missing VERCEL_PROJECT_ID_OR_NAME")
    if (!teamId) throw new Error("Missing VERCEL_TEAM_ID")

    const url = new URL(
      `https://api.vercel.com/v1/projects/${project}/feature-flags/flags`
    )
    url.searchParams.set("teamId", teamId)

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      throw new Error(
        `Failed to list Vercel flags: ${res.status} ${await res.text()}`
      )
    }

    const data = await res.json()

    const flags: VercelFlagListItem[] = Array.isArray(data?.flags)
      ? data.flags
      : Array.isArray(data)
        ? data
        : []

    for (const rawFlag of flags) {
      const mapped = mapVercelFlagToConvex(rawFlag)

      await ctx.runMutation(
        internal.mutations.featureFlags.internal.upsertFromVercel,
        {
          ...mapped,
          syncedFrom: "vercel",
          syncedAt: Date.now(),
        }
      )
    }

    return { count: flags.length }
  },
})

function mapVercelFlagToConvex(rawFlag: VercelFlagListItem) {
  const key =
    typeof rawFlag.slug === "string"
      ? rawFlag.slug
      : typeof rawFlag.key === "string"
        ? rawFlag.key
        : "unknown"

  return {
    key,
    enabled: true,
    rolloutPercent: 0,
    premiumBypass: false,
    creatorBypass: false,
    adminBypass: false,
    staffBypass: false,
    allowlistUserIds: [],
  }
}
