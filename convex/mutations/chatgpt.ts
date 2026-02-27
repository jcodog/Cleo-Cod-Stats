import { v } from "convex/values";

import { mutation } from "../_generated/server";

export const touchConnectionLastUsedAt = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("chatgptAppConnections")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!connection || connection.status !== "active") {
      return {
        ok: false as const,
      };
    }

    const touchedAt = Date.now();

    await ctx.db.patch(connection._id, {
      lastUsedAt: touchedAt,
      updatedAt: touchedAt,
    });

    return {
      ok: true as const,
      touchedAt,
    };
  },
});

export const disconnectByUserId = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return {
        ok: false as const,
        error: "user_not_found" as const,
      };
    }

    const now = Date.now();

    const tokens = await ctx.db
      .query("oauthTokens")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", "chatgpt_app"),
      )
      .collect();

    let revokedTokenCount = 0;

    for (const token of tokens) {
      if (token.revokedAt === undefined) {
        revokedTokenCount += 1;
        await ctx.db.patch(token._id, {
          revokedAt: now,
          lastUsedAt: now,
        });
      }
    }

    const connection = await ctx.db
      .query("chatgptAppConnections")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const scopeSource = tokens.find((token) => token.scopes.length > 0);
    const scopes = scopeSource?.scopes ?? connection?.scopes ?? [];

    if (connection) {
      await ctx.db.patch(connection._id, {
        status: "revoked",
        scopes,
        revokedAt: now,
        lastUsedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("chatgptAppConnections", {
        userId: args.userId,
        status: "revoked",
        scopes,
        linkedAt: user.chatgptLinkedAt ?? now,
        revokedAt: now,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(user._id, {
      chatgptLinked: false,
      chatgptLinkedAt: user.chatgptLinkedAt,
      chatgptRevokedAt: now,
      updatedAt: now,
    });

    return {
      ok: true as const,
      revokedTokenCount,
      revokedAt: now,
    };
  },
});
