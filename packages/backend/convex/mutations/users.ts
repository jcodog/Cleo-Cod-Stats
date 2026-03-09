import { v, Validator } from "convex/values"
import { internalMutation, MutationCtx } from "../_generated/server"
import type { UserJSON } from "@clerk/nextjs/server"
import { DataModel } from "../_generated/dataModel"
import { parseUserRole } from "../lib/staffRoles"

export const upsertFromClerk = internalMutation({
  args: { data: v.any() as Validator<UserJSON> },
  handler: async (ctx, { data }) => {
    const clerkUserId = data.id
    const discordId = getDiscordIdFromClerk(data)

    if (!discordId) {
      throw new Error(
        "Discord account not linked in Clerk. A Discord ID is required for CleoAI Cod Stats Service."
      )
    }

    const name = data.username ?? `Slayer ${discordId.slice(-4)}`
    const publicMetadataRole = parseUserRole(data.public_metadata?.role)
    const now = Date.now()

    const existingByClerk = await userByClerkUserId(ctx, clerkUserId)

    const existingByDiscord = await userByDiscordId(ctx, discordId)

    if (
      existingByClerk &&
      existingByDiscord &&
      existingByClerk._id !== existingByDiscord._id
    ) {
      throw new Error(
        "Account conflict: this clerk user and Discord ID are linked to different CleoAI Cod Stats Service users."
      )
    }

    const doc = existingByClerk ?? existingByDiscord

    if (!doc) {
      await ctx.db.insert("users", {
        clerkUserId,
        discordId,
        name,
        plan: "free",
        status: "active",
        role: publicMetadataRole ?? "user",
        cleoDashLinked: false,
        chatgptLinked: false,
        chatgptLinkedAt: undefined,
        chatgptRevokedAt: undefined,
        createdAt: now,
        updatedAt: now,
      })
      return
    }

    const patch: Partial<DataModel["users"]["document"]> = {}

    if (doc.clerkUserId !== clerkUserId) {
      patch.clerkUserId = clerkUserId
    }

    if (doc.discordId !== discordId) {
      patch.discordId = discordId
    }

    if (doc.name !== name) {
      patch.name = name
    }

    if (doc.status !== "active") {
      patch.status = "active"
    }

    if (publicMetadataRole && doc.role !== publicMetadataRole) {
      patch.role = publicMetadataRole
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now
      await ctx.db.patch(doc._id, patch)
    }

    return
  },
})

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await userByClerkUserId(ctx, clerkUserId)

    if (!user) {
      console.log(
        `Ignoring Clerk user deletion for missing local user: ${clerkUserId}`
      )
      return
    }

    await ctx.db.delete(user._id)
  },
})

export const updateFromClerk = internalMutation({
  args: { data: v.any() as Validator<UserJSON> },
  handler: async (ctx, { data }) => {
    const clerkUserId = data.id

    const existing = await userByClerkUserId(ctx, clerkUserId)
    if (!existing) {
      return
    }

    const discordId = getDiscordIdFromClerk(data)
    if (!discordId) {
      throw new Error(
        "Discord account not linked in Clerk. A Discord ID is required for CleoAI Cod Stats Service."
      )
    }

    const name = data.username ?? `Slayer ${discordId.slice(-4)}`
    const publicMetadataRole = parseUserRole(data.public_metadata?.role)
    const now = Date.now()

    if (existing.discordId !== discordId) {
      const byDiscord = await userByDiscordId(ctx, discordId)
      if (byDiscord && byDiscord._id !== existing._id) {
        throw new Error(
          "Account conflict: this Discord ID is already linked to a different CleoAI Cod Stats Service user."
        )
      }
    }

    const patch: Partial<DataModel["users"]["document"]> = {}
    if (existing.discordId !== discordId) patch.discordId = discordId
    if (existing.name !== name) patch.name = name
    if (existing.clerkUserId !== clerkUserId) patch.clerkUserId = clerkUserId
    if (existing.status !== "active") patch.status = "active"
    if (publicMetadataRole && existing.role !== publicMetadataRole) {
      patch.role = publicMetadataRole
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now
      await ctx.db.patch(existing._id, patch)
    }

    return
  },
})

const getDiscordIdFromClerk = (data: UserJSON): string | null => {
  const accounts = Array.isArray(data.external_accounts)
    ? data.external_accounts
    : []
  const discord = accounts.find(
    (acc) => (acc.provider ?? "").toLowerCase() === "oauth_discord"
  )

  return typeof discord?.provider_user_id === "string" &&
    discord.provider_user_id.length > 0
    ? discord.provider_user_id
    : null
}

const userByClerkUserId = async (
  ctx: MutationCtx,
  clerkUserId: string
): Promise<DataModel["users"]["document"] | null> => {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
    .unique()
}

const userByDiscordId = async (
  ctx: MutationCtx,
  discordId: string
): Promise<DataModel["users"]["document"] | null> => {
  return await ctx.db
    .query("users")
    .withIndex("by_discordId", (q) => q.eq("discordId", discordId))
    .unique()
}
