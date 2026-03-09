/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  billingCustomers: {
    document: {
      active: boolean;
      clerkUserId: string;
      createdAt: number;
      email?: string;
      stripeCustomerId: string;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"billingCustomers">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "active"
      | "clerkUserId"
      | "createdAt"
      | "email"
      | "stripeCustomerId"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_active: ["active", "_creationTime"];
      by_clerkUserId: ["clerkUserId", "_creationTime"];
      by_stripeCustomerId: ["stripeCustomerId", "_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingEntitlements: {
    document: {
      clerkUserId: string;
      createdAt: number;
      enabled: boolean;
      endsAt?: number;
      featureKey: string;
      notes?: string;
      source: "plan" | "manual" | "promo" | "creator_approval";
      startsAt?: number;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"billingEntitlements">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "clerkUserId"
      | "createdAt"
      | "enabled"
      | "endsAt"
      | "featureKey"
      | "notes"
      | "source"
      | "startsAt"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_clerkUserId: ["clerkUserId", "_creationTime"];
      by_featureKey: ["featureKey", "_creationTime"];
      by_userId: ["userId", "_creationTime"];
      by_userId_featureKey: ["userId", "featureKey", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingFeatures: {
    document: {
      active: boolean;
      appliesTo?: "entitlement" | "marketing" | "both";
      archivedAt?: number;
      category?: string;
      createdAt: number;
      description: string;
      key: string;
      name: string;
      sortOrder: number;
      stripeFeatureId?: string;
      updatedAt: number;
      _id: Id<"billingFeatures">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "active"
      | "appliesTo"
      | "archivedAt"
      | "category"
      | "createdAt"
      | "description"
      | "key"
      | "name"
      | "sortOrder"
      | "stripeFeatureId"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_active: ["active", "_creationTime"];
      by_key: ["key", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingPlanFeatures: {
    document: {
      createdAt: number;
      enabled: boolean;
      featureKey: string;
      planKey: string;
      updatedAt: number;
      _id: Id<"billingPlanFeatures">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "enabled"
      | "featureKey"
      | "planKey"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_featureKey: ["featureKey", "_creationTime"];
      by_planKey: ["planKey", "_creationTime"];
      by_planKey_featureKey: ["planKey", "featureKey", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingPlans: {
    document: {
      active: boolean;
      archivedAt?: number;
      createdAt: number;
      currency: string;
      description: string;
      key: string;
      monthlyPriceAmount: number;
      monthlyPriceId?: string;
      name: string;
      planType: "free" | "paid";
      sortOrder: number;
      stripeProductId?: string;
      updatedAt: number;
      yearlyPriceAmount: number;
      yearlyPriceId?: string;
      _id: Id<"billingPlans">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "active"
      | "archivedAt"
      | "createdAt"
      | "currency"
      | "description"
      | "key"
      | "monthlyPriceAmount"
      | "monthlyPriceId"
      | "name"
      | "planType"
      | "sortOrder"
      | "stripeProductId"
      | "updatedAt"
      | "yearlyPriceAmount"
      | "yearlyPriceId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_active: ["active", "_creationTime"];
      by_key: ["key", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  billingSubscriptions: {
    document: {
      cancelAtPeriodEnd: boolean;
      canceledAt?: number;
      clerkUserId: string;
      createdAt: number;
      currentPeriodEnd?: number;
      currentPeriodStart?: number;
      interval: "month" | "year";
      planKey: string;
      status:
        | "incomplete"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused"
        | "incomplete_expired";
      stripeCustomerId: string;
      stripePriceId: string;
      stripeProductId?: string;
      stripeSubscriptionId: string;
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"billingSubscriptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "cancelAtPeriodEnd"
      | "canceledAt"
      | "clerkUserId"
      | "createdAt"
      | "currentPeriodEnd"
      | "currentPeriodStart"
      | "interval"
      | "planKey"
      | "status"
      | "stripeCustomerId"
      | "stripePriceId"
      | "stripeProductId"
      | "stripeSubscriptionId"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_clerkUserId: ["clerkUserId", "_creationTime"];
      by_stripeCustomerId: ["stripeCustomerId", "_creationTime"];
      by_stripeSubscriptionId: ["stripeSubscriptionId", "_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  chatgptAppConnections: {
    document: {
      createdAt: number;
      lastUsedAt?: number;
      linkedAt: number;
      revokedAt?: number;
      scopes: Array<string>;
      status: "active" | "revoked";
      updatedAt: number;
      userId: Id<"users">;
      _id: Id<"chatgptAppConnections">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "lastUsedAt"
      | "linkedAt"
      | "revokedAt"
      | "scopes"
      | "status"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  featureFlags: {
    document: {
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
      _id: Id<"featureFlags">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "adminBypass"
      | "allowlistUserIds"
      | "creatorBypass"
      | "enabled"
      | "key"
      | "premiumBypass"
      | "rolloutPercent"
      | "staffBypass"
      | "syncedAt"
      | "syncedFrom";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_key: ["key", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  games: {
    document: {
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
      _id: Id<"games">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "deaths"
      | "defuses"
      | "enemyScore"
      | "hillTimeSeconds"
      | "kills"
      | "lossProtected"
      | "mode"
      | "outcome"
      | "overloads"
      | "plants"
      | "sessionId"
      | "srChange"
      | "teamScore"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_createdat: ["createdAt", "_creationTime"];
      by_session: ["sessionId", "_creationTime"];
      by_session_createdat: ["sessionId", "createdAt", "_creationTime"];
      by_user_createdat: ["userId", "createdAt", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  landingGlobalStats: {
    document: {
      activeSessions: number;
      key: "global";
      losses: number;
      matchesIndexed: number;
      sessionsTracked: number;
      updatedAt: number;
      wins: number;
      _id: Id<"landingGlobalStats">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activeSessions"
      | "key"
      | "losses"
      | "matchesIndexed"
      | "sessionsTracked"
      | "updatedAt"
      | "wins";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_key: ["key", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  landingUserStats: {
    document: {
      activeSessions: number;
      losses: number;
      matchesIndexed: number;
      sessionsTracked: number;
      updatedAt: number;
      userId: string;
      wins: number;
      _id: Id<"landingUserStats">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activeSessions"
      | "losses"
      | "matchesIndexed"
      | "sessionsTracked"
      | "updatedAt"
      | "userId"
      | "wins";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  oauthAuthCodes: {
    document: {
      clientId: string;
      codeChallenge?: string;
      codeChallengeMethod?: "S256";
      codeHash: string;
      createdAt: number;
      expiresAt: number;
      redirectUri: string;
      resource: string;
      scopes: Array<string>;
      sessionId: string;
      stateHash: string;
      userId: Id<"users">;
      _id: Id<"oauthAuthCodes">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "clientId"
      | "codeChallenge"
      | "codeChallengeMethod"
      | "codeHash"
      | "createdAt"
      | "expiresAt"
      | "redirectUri"
      | "resource"
      | "scopes"
      | "sessionId"
      | "stateHash"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_codeHash: ["codeHash", "_creationTime"];
      by_expiresAt: ["expiresAt", "_creationTime"];
      by_session_state: ["sessionId", "stateHash", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  oauthClients: {
    document: {
      clientId: string;
      clientName?: string;
      clientSecretHash?: string;
      clientUri?: string;
      createdAt: number;
      grantTypes: Array<string>;
      redirectUris: Array<string>;
      responseTypes: Array<string>;
      revokedAt?: number;
      scope?: string;
      tokenEndpointAuthMethod:
        | "none"
        | "client_secret_post"
        | "client_secret_basic";
      updatedAt: number;
      _id: Id<"oauthClients">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "clientId"
      | "clientName"
      | "clientSecretHash"
      | "clientUri"
      | "createdAt"
      | "grantTypes"
      | "redirectUris"
      | "responseTypes"
      | "revokedAt"
      | "scope"
      | "tokenEndpointAuthMethod"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_clientId: ["clientId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  oauthTokens: {
    document: {
      clientId: string;
      createdAt: number;
      lastUsedAt?: number;
      provider: "chatgpt_app";
      refreshTokenExpiresAt: number;
      refreshTokenHash: string;
      resource: string;
      revokedAt?: number;
      scopes: Array<string>;
      userId: Id<"users">;
      _id: Id<"oauthTokens">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "clientId"
      | "createdAt"
      | "lastUsedAt"
      | "provider"
      | "refreshTokenExpiresAt"
      | "refreshTokenHash"
      | "resource"
      | "revokedAt"
      | "scopes"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_expiresAt: ["refreshTokenExpiresAt", "_creationTime"];
      by_refreshTokenHash: ["refreshTokenHash", "_creationTime"];
      by_user_provider: ["userId", "provider", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  sessions: {
    document: {
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
      _id: Id<"sessions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "bestStreak"
      | "codTitle"
      | "currentSr"
      | "deaths"
      | "endedAt"
      | "kills"
      | "losses"
      | "season"
      | "startedAt"
      | "startSr"
      | "streak"
      | "userId"
      | "uuid"
      | "wins";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_user: ["userId", "_creationTime"];
      by_user_cod_season: ["userId", "codTitle", "season", "_creationTime"];
      by_uuid: ["uuid", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  staffAuditLogs: {
    document: {
      action: string;
      actorClerkUserId: string;
      actorName: string;
      actorRole: "user" | "staff" | "admin" | "super_admin";
      createdAt: number;
      details?: string;
      entityId: string;
      entityLabel?: string;
      entityType: string;
      result: "success" | "warning" | "error";
      summary: string;
      _id: Id<"staffAuditLogs">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "action"
      | "actorClerkUserId"
      | "actorName"
      | "actorRole"
      | "createdAt"
      | "details"
      | "entityId"
      | "entityLabel"
      | "entityType"
      | "result"
      | "summary";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_actorClerkUserId: ["actorClerkUserId", "_creationTime"];
      by_createdAt: ["createdAt", "_creationTime"];
      by_entityType: ["entityType", "_creationTime"];
      by_entityType_createdAt: ["entityType", "createdAt", "_creationTime"];
      by_entityType_entityId: ["entityType", "entityId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  users: {
    document: {
      chatgptLinked: boolean;
      chatgptLinkedAt?: number;
      chatgptRevokedAt?: number;
      cleoDashLinked: boolean;
      clerkUserId: string;
      createdAt: number;
      discordId: string;
      name: string;
      plan: "free" | "premium" | "creator";
      role?: "user" | "admin" | "staff" | "super_admin";
      status: "active" | "disabled";
      updatedAt: number;
      _id: Id<"users">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "chatgptLinked"
      | "chatgptLinkedAt"
      | "chatgptRevokedAt"
      | "cleoDashLinked"
      | "clerkUserId"
      | "createdAt"
      | "discordId"
      | "name"
      | "plan"
      | "role"
      | "status"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_clerkUserId: ["clerkUserId", "_creationTime"];
      by_discordId: ["discordId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
