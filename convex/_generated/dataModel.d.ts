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
  chatgptAppConnections: {
    document: {
      accessTokenEnc?: string;
      createdAt: number;
      expiresAt?: number;
      lastUsedAt?: number;
      refreshTokenEnc?: string;
      revokedAt?: number;
      scopes: Array<string>;
      updatedAt: number;
      userId: string;
      _id: Id<"chatgptAppConnections">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accessTokenEnc"
      | "createdAt"
      | "expiresAt"
      | "lastUsedAt"
      | "refreshTokenEnc"
      | "revokedAt"
      | "scopes"
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
      plan: "free" | "premium";
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
