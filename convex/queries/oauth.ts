import { v } from "convex/values";

import { query } from "../_generated/server";

export const getClientByClientId = query({
  args: {
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .unique();

    if (!client || client.revokedAt !== undefined) {
      return null;
    }

    return {
      clientId: client.clientId,
      clientSecretHash: client.clientSecretHash,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      redirectUris: client.redirectUris,
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      scope: client.scope,
      clientName: client.clientName,
      clientUri: client.clientUri,
      createdAt: client.createdAt,
    };
  },
});
