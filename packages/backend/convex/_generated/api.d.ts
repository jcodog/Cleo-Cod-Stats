/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  migrations: {
    stats: {
      game: {
        importGame: FunctionReference<
          "mutation",
          "public",
          {
            createdAt: number;
            deaths: number;
            defuses?: null | number;
            enemyScore?: null | number;
            hillTimeSeconds?: null | number;
            kills: number;
            lossProtected: boolean;
            mode: "hardpoint" | "snd" | "overload";
            outcome: "win" | "loss";
            overloads?: null | number;
            plants?: null | number;
            sessionId: string;
            srChange: number;
            teamScore?: null | number;
            userId: string;
          },
          any
        >;
      };
      session: {
        importSession: FunctionReference<
          "mutation",
          "public",
          {
            bestStreak: number;
            codTitle: string;
            currentSr: number;
            deaths: number;
            endedAt: null | number;
            kills: number;
            losses: number;
            season: number;
            startSr: number;
            startedAt: number;
            streak: number;
            userId: string;
            uuid: string;
            wins: number;
          },
          any
        >;
      };
    };
  };
  mutations: {
    chatgpt: {
      disconnectByUserId: FunctionReference<
        "mutation",
        "public",
        { userId: Id<"users"> },
        any
      >;
      touchConnectionLastUsedAt: FunctionReference<
        "mutation",
        "public",
        { userId: Id<"users"> },
        any
      >;
    };
    oauth: {
      createAuthorizationCode: FunctionReference<
        "mutation",
        "public",
        {
          clientId: string;
          codeChallenge?: string;
          codeChallengeMethod?: "S256";
          codeHash: string;
          expiresAt: number;
          redirectUri: string;
          resource: string;
          scopes: Array<string>;
          sessionId: string;
          stateHash: string;
        },
        any
      >;
      exchangeAuthorizationCode: FunctionReference<
        "mutation",
        "public",
        {
          clientId: string;
          codeHash: string;
          codeVerifierHash?: string;
          redirectUri: string;
          refreshTokenExpiresAt: number;
          refreshTokenHash: string;
          requestedScopes?: Array<string>;
          resource: string;
        },
        any
      >;
      registerClient: FunctionReference<
        "mutation",
        "public",
        {
          clientId: string;
          clientName?: string;
          clientSecretHash?: string;
          clientUri?: string;
          grantTypes: Array<string>;
          redirectUris: Array<string>;
          responseTypes: Array<string>;
          scope?: string;
          tokenEndpointAuthMethod:
            | "none"
            | "client_secret_post"
            | "client_secret_basic";
        },
        any
      >;
      revokeByRefreshToken: FunctionReference<
        "mutation",
        "public",
        { clientId: string; refreshTokenHash: string },
        any
      >;
      revokeForCurrentUser: FunctionReference<"mutation", "public", {}, any>;
      rotateRefreshToken: FunctionReference<
        "mutation",
        "public",
        {
          clientId: string;
          newRefreshTokenExpiresAt: number;
          newRefreshTokenHash: string;
          refreshTokenHash: string;
          requestedScopes?: Array<string>;
          resource: string;
        },
        any
      >;
    };
    stats: {
      games: {
        logMatch: FunctionReference<
          "mutation",
          "public",
          {
            deaths: number;
            defuses?: null | number;
            enemyScore?: null | number;
            hillTimeSeconds?: null | number;
            kills: number;
            lossProtected: boolean;
            mode: "hardpoint" | "snd" | "overload";
            outcome: "win" | "loss";
            overloads?: null | number;
            plants?: null | number;
            sessionUuid: string;
            srChange: number;
            teamScore?: null | number;
          },
          any
        >;
      };
      sessions: {
        createSession: FunctionReference<
          "mutation",
          "public",
          {
            codTitle: string;
            season: number;
            startSr: number;
            userId: string;
            uuid: string;
          },
          any
        >;
      };
    };
  };
  queries: {
    chatgpt: {
      getActiveSessionByDiscordId: FunctionReference<
        "query",
        "public",
        { discordId: string },
        any
      >;
      getDailyStatsByDiscordId: FunctionReference<
        "query",
        "public",
        { date: string; discordId: string },
        any
      >;
      getLastCompletedSessionByDiscordId: FunctionReference<
        "query",
        "public",
        { discordId: string },
        any
      >;
      getMatchById: FunctionReference<
        "query",
        "public",
        { discordId: string; matchId: string },
        any
      >;
      getMatchesByDiscordIdPaginated: FunctionReference<
        "query",
        "public",
        {
          discordId: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      getRecentStatsByDiscordId: FunctionReference<
        "query",
        "public",
        { discordId: string; limit: number },
        any
      >;
      getStatsSummaryByDiscordId: FunctionReference<
        "query",
        "public",
        { discordId: string },
        any
      >;
      getUserByOAuthSubject: FunctionReference<
        "query",
        "public",
        { sub: string },
        any
      >;
    };
    oauth: {
      getClientByClientId: FunctionReference<
        "query",
        "public",
        { clientId: string },
        any
      >;
    };
    stats: {
      daily: {
        getDailyGamesForSession: FunctionReference<
          "query",
          "public",
          { includeLossProtected: boolean; sessionId: string },
          any
        >;
      };
      games: {
        getGamesForSession: FunctionReference<
          "query",
          "public",
          { sessionId: string },
          any
        >;
        getSessionGamesWindow: FunctionReference<
          "query",
          "public",
          {
            filter: "all" | "wins" | "losses" | "no_loss_protection";
            from?: number;
            limit: number;
            sessionId: string;
            to?: number;
            userId: string;
          },
          any
        >;
      };
      landing: {
        getLandingMetrics: FunctionReference<"query", "public", {}, any>;
      };
      sessions: {
        getSessionAggregatedStats: FunctionReference<
          "query",
          "public",
          { includeLossProtected: boolean; sessionId: string },
          any
        >;
        getSessionForUser: FunctionReference<
          "query",
          "public",
          { codSeason: number; codTitle: string; userId: string },
          any
        >;
        getSessionsForUser: FunctionReference<
          "query",
          "public",
          {
            codSeason: number;
            codTitle: string;
            limit?: number;
            userId: string;
          },
          any
        >;
      };
    };
    users: {
      current: FunctionReference<"query", "public", {}, any>;
    };
  };
  stats: {
    createSession: FunctionReference<
      "mutation",
      "public",
      {
        codTitle: string;
        season: number;
        startSr: number;
        userId: string;
        uuid: string;
      },
      any
    >;
    getDailyGamesForSession: FunctionReference<
      "query",
      "public",
      { includeLossProtected: boolean; sessionId: string },
      any
    >;
    getGamesForSession: FunctionReference<
      "query",
      "public",
      { sessionId: string },
      any
    >;
    getLandingMetrics: FunctionReference<"query", "public", {}, any>;
    getSessionAggregatedStats: FunctionReference<
      "query",
      "public",
      { includeLossProtected: boolean; sessionId: string },
      any
    >;
    getSessionForUser: FunctionReference<
      "query",
      "public",
      { codSeason: number; codTitle: string; userId: string },
      any
    >;
    getSessionGamesWindow: FunctionReference<
      "query",
      "public",
      {
        filter: "all" | "wins" | "losses" | "no_loss_protection";
        from?: number;
        limit: number;
        sessionId: string;
        to?: number;
        userId: string;
      },
      any
    >;
    getSessionsForUser: FunctionReference<
      "query",
      "public",
      { codSeason: number; codTitle: string; limit?: number; userId: string },
      any
    >;
    logMatch: FunctionReference<
      "mutation",
      "public",
      {
        deaths: number;
        defuses?: null | number;
        enemyScore?: null | number;
        hillTimeSeconds?: null | number;
        kills: number;
        lossProtected: boolean;
        mode: "hardpoint" | "snd" | "overload";
        outcome: "win" | "loss";
        overloads?: null | number;
        plants?: null | number;
        sessionUuid: string;
        srChange: number;
        teamScore?: null | number;
      },
      any
    >;
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  actions: {
    featureFlags: {
      sync: {
        syncFromVercel: FunctionReference<"action", "internal", {}, any>;
      };
    };
    stats: {
      cache: {
        invalidateLandingMetricsCache: FunctionReference<
          "action",
          "internal",
          { invalidateAll?: boolean; userId?: string },
          any
        >;
      };
    };
  };
  mutations: {
    featureFlags: {
      internal: {
        upsertFromVercel: FunctionReference<
          "mutation",
          "internal",
          {
            adminBypass: boolean;
            allowlistUserIds: Array<string>;
            creatorBypass: boolean;
            enabled: boolean;
            key: string;
            premiumBypass: boolean;
            rolloutPercent: number;
            staffBypass: boolean;
            syncedAt: number;
            syncedFrom: string;
          },
          any
        >;
      };
    };
    stats: {
      landingMetrics: {
        rebuildLandingMetrics: FunctionReference<
          "mutation",
          "internal",
          {},
          any
        >;
      };
    };
    users: {
      deleteFromClerk: FunctionReference<
        "mutation",
        "internal",
        { clerkUserId: string },
        any
      >;
      updateFromClerk: FunctionReference<
        "mutation",
        "internal",
        { data: any },
        any
      >;
      upsertFromClerk: FunctionReference<
        "mutation",
        "internal",
        { data: any },
        any
      >;
    };
  };
};

export declare const components: {};
