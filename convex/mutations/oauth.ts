import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type MutationCtx } from "../_generated/server";

const OAUTH_PROVIDER = "chatgpt_app" as const;

function isScopeSubset(requestedScopes: string[], grantedScopes: string[]) {
  const grantedSet = new Set(grantedScopes);
  return requestedScopes.every((scope) => grantedSet.has(scope));
}

async function revokeActiveRefreshTokensForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
) {
  const tokens = await ctx.db
    .query("oauthTokens")
    .withIndex("by_user_provider", (q) =>
      q.eq("userId", userId).eq("provider", OAUTH_PROVIDER),
    )
    .collect();

  for (const token of tokens) {
    if (token.revokedAt === undefined) {
      await ctx.db.patch(token._id, {
        revokedAt: now,
        lastUsedAt: now,
      });
    }
  }
}

async function upsertChatGptConnection(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    scopes: string[];
    now: number;
    status: "active" | "revoked";
    revokedAt?: number;
  },
) {
  const connection = await ctx.db
    .query("chatgptAppConnections")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .unique();

  if (!connection) {
    await ctx.db.insert("chatgptAppConnections", {
      userId: args.userId,
      status: args.status,
      scopes: args.scopes,
      linkedAt: args.now,
      revokedAt: args.revokedAt,
      lastUsedAt: args.now,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return;
  }

  await ctx.db.patch(connection._id, {
    status: args.status,
    scopes: args.scopes,
    linkedAt: args.status === "active" ? args.now : connection.linkedAt,
    revokedAt: args.revokedAt,
    lastUsedAt: args.now,
    updatedAt: args.now,
  });
}

async function updateLinkedUser(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    now: number;
    linked: boolean;
  },
) {
  await ctx.db.patch(user._id, {
    chatgptLinked: args.linked,
    chatgptLinkedAt: args.linked ? args.now : user.chatgptLinkedAt,
    chatgptRevokedAt: args.linked ? undefined : args.now,
    updatedAt: args.now,
  });
}

export const registerClient = mutation({
  args: {
    clientId: v.string(),
    clientSecretHash: v.optional(v.string()),
    tokenEndpointAuthMethod: v.union(
      v.literal("none"),
      v.literal("client_secret_post"),
      v.literal("client_secret_basic"),
    ),
    redirectUris: v.array(v.string()),
    grantTypes: v.array(v.string()),
    responseTypes: v.array(v.string()),
    scope: v.optional(v.string()),
    clientName: v.optional(v.string()),
    clientUri: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("oauthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();

    if (existing && existing.revokedAt === undefined) {
      throw new Error("client_id_already_exists");
    }

    const now = Date.now();

    await ctx.db.insert("oauthClients", {
      clientId: args.clientId,
      clientSecretHash: args.clientSecretHash,
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      redirectUris: args.redirectUris,
      grantTypes: args.grantTypes,
      responseTypes: args.responseTypes,
      scope: args.scope,
      clientName: args.clientName,
      clientUri: args.clientUri,
      revokedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true as const };
  },
});

export const createAuthorizationCode = mutation({
  args: {
    clientId: v.string(),
    resource: v.string(),
    codeHash: v.string(),
    stateHash: v.string(),
    sessionId: v.string(),
    redirectUri: v.string(),
    scopes: v.array(v.string()),
    expiresAt: v.number(),
    codeChallenge: v.optional(v.string()),
    codeChallengeMethod: v.optional(v.literal("S256")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("user_not_found");
    }

    const now = Date.now();
    const stateEntries = await ctx.db
      .query("oauthAuthCodes")
      .withIndex("by_session_state", (q) =>
        q.eq("sessionId", args.sessionId).eq("stateHash", args.stateHash),
      )
      .collect();

    for (const entry of stateEntries) {
      if (entry.expiresAt > now) {
        throw new Error("state_already_used");
      }

      await ctx.db.delete(entry._id);
    }

    await ctx.db.insert("oauthAuthCodes", {
      userId: user._id,
      clientId: args.clientId,
      resource: args.resource,
      codeHash: args.codeHash,
      stateHash: args.stateHash,
      sessionId: args.sessionId,
      redirectUri: args.redirectUri,
      scopes: args.scopes,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      expiresAt: args.expiresAt,
      createdAt: now,
    });

    return { ok: true as const, userId: user._id };
  },
});

export const exchangeAuthorizationCode = mutation({
  args: {
    clientId: v.string(),
    resource: v.string(),
    codeHash: v.string(),
    redirectUri: v.string(),
    codeVerifierHash: v.optional(v.string()),
    refreshTokenHash: v.string(),
    refreshTokenExpiresAt: v.number(),
    requestedScopes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const authCode = await ctx.db
      .query("oauthAuthCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();

    if (!authCode) {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    if (authCode.expiresAt <= now) {
      await ctx.db.delete(authCode._id);
      return { ok: false as const, error: "invalid_grant" as const };
    }

    await ctx.db.delete(authCode._id);

    if (
      authCode.redirectUri !== args.redirectUri ||
      authCode.clientId !== args.clientId ||
      authCode.resource !== args.resource
    ) {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    if (authCode.codeChallenge) {
      if (!args.codeVerifierHash || args.codeVerifierHash !== authCode.codeChallenge) {
        return { ok: false as const, error: "invalid_grant" as const };
      }
    }

    const user = await ctx.db.get(authCode.userId);
    if (!user || user.status !== "active") {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    const scopes =
      args.requestedScopes && args.requestedScopes.length > 0
        ? args.requestedScopes
        : authCode.scopes;

    if (!isScopeSubset(scopes, authCode.scopes)) {
      return { ok: false as const, error: "invalid_scope" as const };
    }

    await revokeActiveRefreshTokensForUser(ctx, user._id, now);

    await ctx.db.insert("oauthTokens", {
      userId: user._id,
      provider: OAUTH_PROVIDER,
      clientId: args.clientId,
      resource: args.resource,
      refreshTokenHash: args.refreshTokenHash,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      scopes,
      createdAt: now,
      lastUsedAt: now,
    });

    await updateLinkedUser(ctx, user, { now, linked: true });
    await upsertChatGptConnection(ctx, {
      userId: user._id,
      scopes,
      now,
      status: "active",
      revokedAt: undefined,
    });

    return {
      ok: true as const,
      userId: user._id,
      clerkUserId: user.clerkUserId,
      scopes,
      resource: args.resource,
    };
  },
});

export const rotateRefreshToken = mutation({
  args: {
    clientId: v.string(),
    resource: v.string(),
    refreshTokenHash: v.string(),
    newRefreshTokenHash: v.string(),
    newRefreshTokenExpiresAt: v.number(),
    requestedScopes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingToken = await ctx.db
      .query("oauthTokens")
      .withIndex("by_refreshTokenHash", (q) =>
        q.eq("refreshTokenHash", args.refreshTokenHash),
      )
      .unique();

    if (!existingToken) {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    if (
      existingToken.provider !== OAUTH_PROVIDER ||
      existingToken.revokedAt !== undefined ||
      existingToken.refreshTokenExpiresAt <= now ||
      existingToken.clientId !== args.clientId ||
      existingToken.resource !== args.resource
    ) {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    const user = await ctx.db.get(existingToken.userId);
    if (!user || user.status !== "active") {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    const scopes =
      args.requestedScopes && args.requestedScopes.length > 0
        ? args.requestedScopes
        : existingToken.scopes;

    if (!isScopeSubset(scopes, existingToken.scopes)) {
      return { ok: false as const, error: "invalid_scope" as const };
    }

    await ctx.db.patch(existingToken._id, {
      revokedAt: now,
      lastUsedAt: now,
    });

    await ctx.db.insert("oauthTokens", {
      userId: existingToken.userId,
      provider: OAUTH_PROVIDER,
      clientId: args.clientId,
      resource: args.resource,
      refreshTokenHash: args.newRefreshTokenHash,
      refreshTokenExpiresAt: args.newRefreshTokenExpiresAt,
      scopes,
      createdAt: now,
      lastUsedAt: now,
    });

    await updateLinkedUser(ctx, user, { now, linked: true });
    await upsertChatGptConnection(ctx, {
      userId: existingToken.userId,
      scopes,
      now,
      status: "active",
      revokedAt: undefined,
    });

    return {
      ok: true as const,
      userId: existingToken.userId,
      clerkUserId: user.clerkUserId,
      scopes,
      resource: args.resource,
    };
  },
});

export const revokeForCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      return { ok: true as const, revoked: false as const };
    }

    const now = Date.now();

    const tokens = await ctx.db
      .query("oauthTokens")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", user._id).eq("provider", OAUTH_PROVIDER),
      )
      .collect();

    let hasActiveToken = false;

    for (const token of tokens) {
      if (token.revokedAt === undefined) {
        hasActiveToken = true;
        await ctx.db.patch(token._id, {
          revokedAt: now,
          lastUsedAt: now,
        });
      }
    }

    const connection = await ctx.db
      .query("chatgptAppConnections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    const hasActiveConnection = connection?.status === "active";
    const shouldMarkUserRevoked =
      hasActiveToken || user.chatgptLinked || hasActiveConnection;

    if (shouldMarkUserRevoked) {
      await updateLinkedUser(ctx, user, { now, linked: false });
    }

    if (hasActiveToken || user.chatgptLinked || connection) {
      const scopeSource = tokens.find((token) => token.scopes.length > 0);
      const scopes = scopeSource?.scopes ?? connection?.scopes ?? [];

      await upsertChatGptConnection(ctx, {
        userId: user._id,
        scopes,
        now,
        status: "revoked",
        revokedAt: now,
      });
    }

    return {
      ok: true as const,
      revoked: shouldMarkUserRevoked,
      userId: user._id,
    };
  },
});

export const revokeByRefreshToken = mutation({
  args: {
    clientId: v.string(),
    refreshTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const token = await ctx.db
      .query("oauthTokens")
      .withIndex("by_refreshTokenHash", (q) =>
        q.eq("refreshTokenHash", args.refreshTokenHash),
      )
      .unique();

    if (
      !token ||
      token.provider !== OAUTH_PROVIDER ||
      token.clientId !== args.clientId
    ) {
      return { ok: true as const, revoked: false as const };
    }

    await revokeActiveRefreshTokensForUser(ctx, token.userId, now);

    const user = await ctx.db.get(token.userId);
    if (user) {
      await updateLinkedUser(ctx, user, { now, linked: false });
    }

    await upsertChatGptConnection(ctx, {
      userId: token.userId,
      scopes: token.scopes,
      now,
      status: "revoked",
      revokedAt: now,
    });

    return {
      ok: true as const,
      revoked: true as const,
      userId: token.userId,
    };
  },
});
