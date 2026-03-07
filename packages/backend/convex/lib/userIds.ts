import type { UserIdentity } from "convex/server";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type UserLookupCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function addCandidate(candidates: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length > 0) {
    candidates.add(trimmedValue);
  }
}

function addUserDocumentCandidates(
  candidates: Set<string>,
  user: Doc<"users"> | null,
) {
  if (!user) {
    return;
  }

  addCandidate(candidates, user.clerkUserId);
  addCandidate(candidates, user.discordId);
}

export async function getStatsUserIdCandidatesForIdentity(
  ctx: QueryCtx,
  identity: UserIdentity,
) {
  const candidates = new Set<string>();

  addCandidate(candidates, identity.subject);
  addCandidate(candidates, identity.tokenIdentifier);

  const linkedUser = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();

  addUserDocumentCandidates(candidates, linkedUser);

  return Array.from(candidates);
}

export async function getStatsUserIdCandidatesForInvalidation(
  ctx: UserLookupCtx,
  userId: string,
) {
  const candidates = new Set<string>();

  addCandidate(candidates, userId);

  const [byClerkUserId, byDiscordId] = await Promise.all([
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
      .unique(),
    ctx.db
      .query("users")
      .withIndex("by_discordId", (q) => q.eq("discordId", userId))
      .unique(),
  ]);

  addUserDocumentCandidates(candidates, byClerkUserId);
  addUserDocumentCandidates(candidates, byDiscordId);

  return Array.from(candidates);
}
