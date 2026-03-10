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
  actions: {
    staff: {
      billing: {
        archiveFeature: FunctionReference<
          "action",
          "public",
          { confirmationToken: string; featureKey: string },
          any
        >;
        archivePlan: FunctionReference<
          "action",
          "public",
          {
            cancelAtPeriodEnd: boolean;
            confirmationToken: string;
            planKey: string;
          },
          any
        >;
        getDashboard: FunctionReference<"action", "public", {}, any>;
        previewFeatureArchive: FunctionReference<
          "action",
          "public",
          { featureKey: string },
          any
        >;
        previewFeatureAssignmentChange: FunctionReference<
          "action",
          "public",
          { enabled: boolean; featureKey: string; planKey: string },
          any
        >;
        previewFeatureAssignmentSync: FunctionReference<
          "action",
          "public",
          { featureKey: string; planKeys: Array<string> },
          any
        >;
        previewPlanArchive: FunctionReference<
          "action",
          "public",
          { planKey: string },
          any
        >;
        previewPlanFeatureSync: FunctionReference<
          "action",
          "public",
          { featureKeys: Array<string>; planKey: string },
          any
        >;
        previewPriceReplacement: FunctionReference<
          "action",
          "public",
          { interval: "month" | "year"; planKey: string },
          any
        >;
        replacePlanPrice: FunctionReference<
          "action",
          "public",
          {
            amount: number;
            confirmationToken: string;
            interval: "month" | "year";
            planKey: string;
          },
          any
        >;
        runCatalogSync: FunctionReference<"action", "public", {}, any>;
        setFeatureAssignment: FunctionReference<
          "action",
          "public",
          { enabled: boolean; featureKey: string; planKey: string },
          any
        >;
        syncFeatureAssignments: FunctionReference<
          "action",
          "public",
          { featureKey: string; planKeys: Array<string> },
          any
        >;
        upsertFeature: FunctionReference<
          "action",
          "public",
          {
            active: boolean;
            appliesTo: "entitlement" | "marketing" | "both";
            category?: string;
            description: string;
            key: string;
            name: string;
            sortOrder: number;
          },
          any
        >;
        upsertPlan: FunctionReference<
          "action",
          "public",
          {
            active: boolean;
            currency: string;
            description: string;
            featureKeys: Array<string>;
            key: string;
            monthlyPriceAmount: number;
            name: string;
            planType: "free" | "paid";
            sortOrder: number;
            yearlyPriceAmount: number;
          },
          any
        >;
      };
      management: {
        getDashboard: FunctionReference<"action", "public", {}, any>;
        updateUserRole: FunctionReference<
          "action",
          "public",
          { nextRole: "user" | "staff" | "admin"; targetClerkUserId: string },
          any
        >;
      };
      overview: {
        getDashboard: FunctionReference<"action", "public", {}, any>;
      };
    };
  };
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
    billing: {
      entitlements: {
        currentUserHasFeature: FunctionReference<
          "query",
          "public",
          { featureKey: string },
          any
        >;
        getCurrentUserEntitlements: FunctionReference<
          "query",
          "public",
          {},
          any
        >;
      };
      state: {
        getCurrentUserBillingCustomer: FunctionReference<
          "query",
          "public",
          {},
          any
        >;
        getCurrentUserBillingState: FunctionReference<
          "query",
          "public",
          {},
          any
        >;
        getCurrentUserSubscription: FunctionReference<
          "query",
          "public",
          {},
          any
        >;
      };
    };
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
    billing: {
      syncCatalogToStripe: {
        syncCatalogToStripe: FunctionReference<"action", "internal", {}, any>;
      };
    };
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
    billing: {
      catalog: {
        updateFeatureStripeId: FunctionReference<
          "mutation",
          "internal",
          { featureKey: string; stripeFeatureId: string },
          any
        >;
        updatePlanStripeIds: FunctionReference<
          "mutation",
          "internal",
          {
            monthlyPriceId?: string;
            planKey: string;
            stripeProductId?: string;
            yearlyPriceId?: string;
          },
          any
        >;
      };
    };
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
    staff: {
      internal: {
        insertAuditLog: FunctionReference<
          "mutation",
          "internal",
          {
            action: string;
            actorClerkUserId: string;
            actorName: string;
            actorRole: "user" | "staff" | "admin" | "super_admin";
            details?: string;
            entityId: string;
            entityLabel?: string;
            entityType: string;
            result: "success" | "warning" | "error";
            summary: string;
          },
          any
        >;
        setFeatureActiveState: FunctionReference<
          "mutation",
          "internal",
          { active: boolean; archivedAt?: number; featureKey: string },
          any
        >;
        setPlanActiveState: FunctionReference<
          "mutation",
          "internal",
          { active: boolean; archivedAt?: number; planKey: string },
          any
        >;
        setPlanFeatureAssignment: FunctionReference<
          "mutation",
          "internal",
          { enabled: boolean; featureKey: string; planKey: string },
          any
        >;
        setUserRole: FunctionReference<
          "mutation",
          "internal",
          {
            clerkUserId: string;
            role: "user" | "staff" | "admin" | "super_admin";
          },
          any
        >;
        syncPlanFeatureAssignmentsForFeature: FunctionReference<
          "mutation",
          "internal",
          { featureKey: string; planKeys: Array<string> },
          any
        >;
        syncPlanFeatureAssignmentsForPlan: FunctionReference<
          "mutation",
          "internal",
          { featureKeys: Array<string>; planKey: string },
          any
        >;
        updateSubscriptionsAfterCancel: FunctionReference<
          "mutation",
          "internal",
          {
            updates: Array<{
              cancelAtPeriodEnd: boolean;
              canceledAt?: number;
              currentPeriodEnd?: number;
              status?:
                | "incomplete"
                | "trialing"
                | "active"
                | "past_due"
                | "canceled"
                | "unpaid"
                | "paused"
                | "incomplete_expired";
              stripeSubscriptionId: string;
            }>;
          },
          any
        >;
        upsertFeature: FunctionReference<
          "mutation",
          "internal",
          {
            active: boolean;
            appliesTo: "entitlement" | "marketing" | "both";
            category?: string;
            description: string;
            key: string;
            name: string;
            sortOrder: number;
          },
          any
        >;
        upsertPlan: FunctionReference<
          "mutation",
          "internal",
          {
            active: boolean;
            currency: string;
            description: string;
            key: string;
            monthlyPriceAmount: number;
            name: string;
            planType: "free" | "paid";
            sortOrder: number;
            yearlyPriceAmount: number;
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
  queries: {
    billing: {
      catalog: {
        getBillingFeatures: FunctionReference<"query", "internal", {}, any>;
        getBillingPlans: FunctionReference<"query", "internal", {}, any>;
        getPlanFeatures: FunctionReference<
          "query",
          "internal",
          { planKey: string },
          any
        >;
        getPricingCatalog: FunctionReference<"query", "internal", {}, any>;
      };
    };
    staff: {
      internal: {
        getBillingRecords: FunctionReference<"query", "internal", {}, any>;
        getManagementRecords: FunctionReference<"query", "internal", {}, any>;
        getOverviewRecords: FunctionReference<"query", "internal", {}, any>;
        getUserByClerkUserId: FunctionReference<
          "query",
          "internal",
          { clerkUserId: string },
          any
        >;
      };
    };
  };
};

export declare const components: {};
