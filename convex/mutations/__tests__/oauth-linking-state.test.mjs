import { describe, expect, it } from "bun:test";

import {
  exchangeAuthorizationCode,
  revokeForCurrentUser,
} from "../oauth.ts";

const INDEX_FIELDS = {
  users: {
    by_clerkUserId: ["clerkUserId"],
  },
  oauthAuthCodes: {
    by_codeHash: ["codeHash"],
    by_session_state: ["sessionId", "stateHash"],
  },
  oauthTokens: {
    by_refreshTokenHash: ["refreshTokenHash"],
    by_user_provider: ["userId", "provider"],
  },
  chatgptAppConnections: {
    by_userId: ["userId"],
  },
};

class FakeQuery {
  #db;
  #table;
  #filters = [];

  constructor(db, table) {
    this.#db = db;
    this.#table = table;
  }

  withIndex(indexName, selector) {
    const indexFields = INDEX_FIELDS[this.#table]?.[indexName];
    if (!indexFields) {
      throw new Error(`unsupported_index:${this.#table}:${indexName}`);
    }

    const filters = [];
    const builder = {
      eq(field, value) {
        if (!indexFields.includes(field)) {
          throw new Error(`unsupported_index_field:${indexName}:${field}`);
        }
        filters.push([field, value]);
        return builder;
      },
    };

    selector(builder);
    this.#filters = filters;

    return this;
  }

  async unique() {
    const matches = this.#applyFilters();
    if (matches.length > 1) {
      throw new Error(`unique_expected:${this.#table}`);
    }

    return matches[0] ?? null;
  }

  async collect() {
    return this.#applyFilters();
  }

  #applyFilters() {
    const table = this.#db.tables[this.#table] ?? [];

    return table.filter((doc) =>
      this.#filters.every(([field, value]) => doc[field] === value),
    );
  }
}

class FakeDb {
  constructor(initialTables) {
    this.tables = {
      users: [],
      oauthAuthCodes: [],
      oauthTokens: [],
      chatgptAppConnections: [],
      ...(initialTables ?? {}),
    };
    this.idCounter = 0;
  }

  query(table) {
    return new FakeQuery(this, table);
  }

  async get(id) {
    return this.#findById(id);
  }

  async insert(table, value) {
    this.idCounter += 1;
    const doc = {
      _id: `${table}:${this.idCounter}`,
      ...value,
    };

    this.tables[table].push(doc);
    return doc._id;
  }

  async patch(id, patch) {
    const doc = this.#findById(id);
    if (!doc) {
      throw new Error(`missing_doc:${id}`);
    }

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete doc[key];
      } else {
        doc[key] = value;
      }
    }
  }

  async delete(id) {
    for (const table of Object.keys(this.tables)) {
      const current = this.tables[table];
      const index = current.findIndex((doc) => doc._id === id);

      if (index >= 0) {
        current.splice(index, 1);
        return;
      }
    }
  }

  #findById(id) {
    for (const table of Object.keys(this.tables)) {
      const found = this.tables[table].find((doc) => doc._id === id);
      if (found) {
        return found;
      }
    }

    return null;
  }
}

function createTestContext({ clerkUserId, initialTables }) {
  const db = new FakeDb(initialTables);

  return {
    db,
    ctx: {
      auth: {
        getUserIdentity: async () => ({ subject: clerkUserId }),
      },
      db,
    },
  };
}

describe("oauth linking lifecycle", () => {
  it("marks user linked and clears revoked timestamp on authorization exchange", async () => {
    const now = Date.now();
    const userId = "users:1";

    const { ctx, db } = createTestContext({
      clerkUserId: "clerk_user_link",
      initialTables: {
        users: [
          {
            _id: userId,
            clerkUserId: "clerk_user_link",
            status: "active",
            chatgptLinked: false,
            chatgptLinkedAt: undefined,
            chatgptRevokedAt: now - 10_000,
            updatedAt: now - 10_000,
          },
        ],
        oauthAuthCodes: [
          {
            _id: "oauthAuthCodes:1",
            userId,
            clientId: "client_test",
            resource: "https://app.example.com",
            codeHash: "code_hash_test",
            stateHash: "state_hash_test",
            sessionId: "session_test",
            redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
            scopes: ["profile.read", "stats.read"],
            expiresAt: now + 120_000,
            createdAt: now - 1_000,
          },
        ],
      },
    });

    const exchangeHandler = exchangeAuthorizationCode._handler;
    const result = await exchangeHandler(ctx, {
      clientId: "client_test",
      resource: "https://app.example.com",
      codeHash: "code_hash_test",
      redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
      refreshTokenHash: "refresh_hash_test",
      refreshTokenExpiresAt: now + 86_400_000,
    });

    const user = db.tables.users[0];
    const token = db.tables.oauthTokens[0];
    const connection = db.tables.chatgptAppConnections[0];

    expect(result.ok).toBe(true);
    expect(db.tables.oauthAuthCodes).toHaveLength(0);

    expect(user.chatgptLinked).toBe(true);
    expect(typeof user.chatgptLinkedAt).toBe("number");
    expect(user.chatgptLinkedAt).toBeGreaterThanOrEqual(now);
    expect(user.chatgptRevokedAt).toBeUndefined();

    expect(token.userId).toBe(userId);
    expect(token.revokedAt).toBeUndefined();
    expect(token.scopes).toEqual(["profile.read", "stats.read"]);

    expect(connection.status).toBe("active");
    expect(connection.scopes).toEqual(["profile.read", "stats.read"]);
    expect(connection.revokedAt).toBeUndefined();
  });

  it("marks user revoked while preserving linkedAt on settings disconnect", async () => {
    const now = Date.now();
    const linkedAt = now - 60_000;
    const userId = "users:2";

    const { ctx, db } = createTestContext({
      clerkUserId: "clerk_user_revoke",
      initialTables: {
        users: [
          {
            _id: userId,
            clerkUserId: "clerk_user_revoke",
            status: "active",
            chatgptLinked: true,
            chatgptLinkedAt: linkedAt,
            chatgptRevokedAt: undefined,
            updatedAt: linkedAt,
          },
        ],
        oauthTokens: [
          {
            _id: "oauthTokens:1",
            userId,
            provider: "chatgpt_app",
            clientId: "client_test",
            resource: "https://app.example.com",
            refreshTokenHash: "refresh_hash_active",
            refreshTokenExpiresAt: now + 86_400_000,
            scopes: ["stats.read"],
            revokedAt: undefined,
            createdAt: linkedAt,
            lastUsedAt: linkedAt,
          },
        ],
        chatgptAppConnections: [
          {
            _id: "chatgptAppConnections:1",
            userId,
            status: "active",
            scopes: ["stats.read"],
            linkedAt,
            revokedAt: undefined,
            createdAt: linkedAt,
            updatedAt: linkedAt,
            lastUsedAt: linkedAt,
          },
        ],
      },
    });

    const revokeHandler = revokeForCurrentUser._handler;
    const result = await revokeHandler(ctx, {});

    const user = db.tables.users[0];
    const token = db.tables.oauthTokens[0];
    const connection = db.tables.chatgptAppConnections[0];

    expect(result.ok).toBe(true);
    expect(result.revoked).toBe(true);

    expect(user.chatgptLinked).toBe(false);
    expect(user.chatgptLinkedAt).toBe(linkedAt);
    expect(typeof user.chatgptRevokedAt).toBe("number");
    expect(user.chatgptRevokedAt).toBeGreaterThanOrEqual(now);

    expect(typeof token.revokedAt).toBe("number");
    expect(token.revokedAt).toBeGreaterThanOrEqual(now);

    expect(connection.status).toBe("revoked");
    expect(connection.linkedAt).toBe(linkedAt);
    expect(typeof connection.revokedAt).toBe("number");
  });
});
