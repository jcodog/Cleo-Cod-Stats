import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { handleDisconnectPost } from "../disconnect/route.ts";
import { handleProfileGet } from "../profile/route.ts";
import { handleMatchDetailGet } from "../stats/matches/[id]/route.ts";
import { handleMatchHistoryGet } from "../stats/matches/route.ts";
import { handleRankLadderGet } from "../stats/rank/ladder/route.ts";
import { handleRankProgressGet } from "../stats/rank/progress/route.ts";
import { handleCurrentSessionGet } from "../stats/session/current/route.ts";
import { handleLastSessionGet } from "../stats/session/last/route.ts";
import { requireAuthenticatedAppRequest } from "../../../../lib/server/chatgpt-app-auth.ts";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_VIEWS,
} from "../../../../lib/server/chatgpt-app-contract.ts";
import { isPublicRoute } from "../../../../proxy.ts";

const ACTIVE_USER = {
  _id: "user_test_123",
  clerkUserId: "clerk_user_123",
  discordId: "discord_user_123",
  name: "Test User",
  plan: "free",
  status: "active",
  chatgptLinked: true,
  connectionStatus: "active",
  connectionScopes: ["profile.read", "stats.read"],
};

const VERIFIED_TOKEN = {
  iss: "https://example.test",
  aud: "https://example.test",
  sub: "clerk_user_123",
  iat: 1,
  exp: 9_999_999_999,
  scope: "stats.read",
  jti: "jti_test_123",
  scopes: ["stats.read"],
};

const ENV_KEYS = ["OAUTH_ISSUER", "OAUTH_JWT_SECRET", "OAUTH_ALLOWED_REDIRECT_URIS"];

const previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeAll(() => {
  process.env.OAUTH_ISSUER = "https://example.test";
  process.env.OAUTH_JWT_SECRET = "test-secret";
  process.env.OAUTH_ALLOWED_REDIRECT_URIS =
    "https://chatgpt.com/connector_platform_oauth_redirect,https://platform.openai.com/apps-manage/oauth";
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function createRequest(url) {
  return new Request(url);
}

function createProxyMatcherRequest(pathname) {
  return {
    nextUrl: {
      pathname,
    },
  };
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createContractError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message,
    },
    meta: {
      generatedAt: Date.now(),
    },
  };
}

function createAuthFailure(status, code = CHATGPT_APP_ERROR_CODES.unauthorized) {
  return {
    ok: false,
    response: jsonResponse(status, createContractError(code, "Auth failed")),
  };
}

function createAuthSuccess(scopes = ["stats.read"]) {
  return {
    ok: true,
    auth: {
      token: {
        ...VERIFIED_TOKEN,
        scope: scopes.join(" "),
        scopes,
      },
      user: ACTIVE_USER,
    },
  };
}

function expectContractSuccess(body, view) {
  expect(body.ok).toBe(true);
  expect(body.view).toBe(view);
  expect(typeof body.data).toBe("object");
  expect(body.data).not.toBeNull();
  expect(typeof body.meta.generatedAt).toBe("number");
}

function expectContractError(body, code) {
  expect(body.ok).toBe(false);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe("string");
  expect(typeof body.meta.generatedAt).toBe("number");
}

describe("proxy public route allowlist", () => {
  it("bypasses Clerk auth for ChatGPT app routes", () => {
    const publicPaths = [
      "/debug/chatgpt-app-config",
      "/mcp",
      "/ui/codstats/widget.html",
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
      "/oauth/authorize",
      "/oauth/token",
      "/oauth/revoke",
      "/oauth/register",
      "/api/app/profile",
      "/api/app/stats/session/current",
      "/api/app/stats/session/last",
      "/api/app/stats/matches",
      "/api/app/stats/matches/abc",
      "/api/app/stats/rank/ladder",
      "/api/app/stats/rank/progress",
    ];

    for (const path of publicPaths) {
      expect(isPublicRoute(createProxyMatcherRequest(path))).toBe(true);
    }
  });

  it("still protects non-allowlisted routes", () => {
    expect(isPublicRoute(createProxyMatcherRequest("/dashboard"))).toBe(false);
  });
});

describe("Bearer auth guard", () => {
  it("returns OAuth challenge and contract error when token is missing", async () => {
    const result = await requireAuthenticatedAppRequest(
      createRequest("https://example.test/api/app/profile"),
      ["profile.read"],
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    const body = await result.response.json();

    expect(result.response.status).toBe(401);
    expectContractError(body, CHATGPT_APP_ERROR_CODES.unauthorized);
    expect(body.error.message).toBe("Missing bearer token");
    expect(result.response.headers.get("www-authenticate")).toContain("Bearer");
    expect(result.response.headers.get("www-authenticate")).toContain(
      ".well-known/oauth-protected-resource",
    );
  });
});

describe("/api/app/stats/session/current", () => {
  it("returns 401 when auth fails", async () => {
    let queried = false;

    const response = await handleCurrentSessionGet(
      createRequest("https://example.test/api/app/stats/session/current"),
      {
        authenticate: async () => createAuthFailure(401),
        getActiveSessionByDiscordId: async () => {
          queried = true;
          return null;
        },
        touchConnectionLastUsedAt: async () => {},
      },
    );

    expect(response.status).toBe(401);
    expect(queried).toBe(false);
  });

  it("returns active=false when there is no active session", async () => {
    const response = await handleCurrentSessionGet(
      createRequest("https://example.test/api/app/stats/session/current"),
      {
        authenticate: async () => createAuthSuccess(),
        getActiveSessionByDiscordId: async () => null,
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.sessionCurrent);
    expect(body.data.active).toBe(false);
    expect(body.data.session).toBeUndefined();
  });

  it("returns only the active session payload", async () => {
    const activeSession = {
      sessionId: "session_doc_1",
      title: "MW3",
      season: 2,
      startedAt: 1700000,
      srCurrent: 3350,
    };

    const response = await handleCurrentSessionGet(
      createRequest("https://example.test/api/app/stats/session/current"),
      {
        authenticate: async () => createAuthSuccess(),
        getActiveSessionByDiscordId: async () => activeSession,
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.sessionCurrent);
    expect(body.data.active).toBe(true);
    expect(body.data.session).toEqual(activeSession);
    expect(body.data.lastSession).toBeUndefined();
  });
});

describe("/api/app/stats/session/last", () => {
  it("returns found=false when there is no completed session", async () => {
    const response = await handleLastSessionGet(
      createRequest("https://example.test/api/app/stats/session/last"),
      {
        authenticate: async () => createAuthSuccess(),
        getLastCompletedSessionByDiscordId: async () => null,
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.sessionLast);
    expect(body.data.found).toBe(false);
  });
});

describe("/api/app/stats/matches", () => {
  it("returns validation error for non-numeric limit", async () => {
    const response = await handleMatchHistoryGet(
      createRequest("https://example.test/api/app/stats/matches?limit=abc"),
      {
        authenticate: async () => createAuthSuccess(),
        getMatchesByDiscordIdPaginated: async () => ({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(400);
    expectContractError(body, CHATGPT_APP_ERROR_CODES.validation);
  });

  it("clamps limit to max 15 and returns contract shape", async () => {
    let receivedPaginationOpts = null;

    const response = await handleMatchHistoryGet(
      createRequest("https://example.test/api/app/stats/matches?limit=99&cursor=cursor_1"),
      {
        authenticate: async () => createAuthSuccess(),
        getMatchesByDiscordIdPaginated: async (_discordId, paginationOpts) => {
          receivedPaginationOpts = paginationOpts;
          return {
            items: [{ matchId: "m1", playedAt: 1, outcome: "win", mode: "hardpoint" }],
            nextCursor: "cursor_2",
            hasMore: true,
          };
        },
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPaginationOpts).toEqual({
      cursor: "cursor_1",
      numItems: 15,
    });
    expectContractSuccess(body, CHATGPT_APP_VIEWS.matchesHistory);
    expect(body.data.limit).toBe(15);
    expect(body.data.hasMore).toBe(true);
    expect(body.data.nextCursor).toBe("cursor_2");
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

describe("/api/app/stats/matches/[id]", () => {
  it("returns validation error when id is missing", async () => {
    const response = await handleMatchDetailGet(
      createRequest("https://example.test/api/app/stats/matches/%20"),
      "   ",
      {
        authenticate: async () => createAuthSuccess(),
        getMatchById: async () => null,
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(400);
    expectContractError(body, CHATGPT_APP_ERROR_CODES.validation);
  });

  it("returns not_found when match does not exist", async () => {
    const response = await handleMatchDetailGet(
      createRequest("https://example.test/api/app/stats/matches/missing"),
      "missing",
      {
        authenticate: async () => createAuthSuccess(),
        getMatchById: async () => null,
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(404);
    expectContractError(body, CHATGPT_APP_ERROR_CODES.notFound);
  });

  it("returns match detail with contract shape", async () => {
    const mockedMatch = {
      matchId: "m123",
      mode: "hardpoint",
      playedAt: 1700000,
      outcome: "win",
    };

    const response = await handleMatchDetailGet(
      createRequest("https://example.test/api/app/stats/matches/m123"),
      "m123",
      {
        authenticate: async () => createAuthSuccess(),
        getMatchById: async () => mockedMatch,
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.matchesDetail);
    expect(body.data.match).toEqual(mockedMatch);
  });
});

describe("/api/app/stats/rank/ladder", () => {
  it("returns explicit ladder ranges and metadata", async () => {
    const response = await handleRankLadderGet(
      createRequest("https://example.test/api/app/stats/rank/ladder"),
      {
        authenticate: async () => createAuthSuccess(),
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.rankLadder);
    expect(typeof body.data.title).toBe("string");
    expect(typeof body.data.ruleset).toBe("string");
    expect(Array.isArray(body.data.divisions)).toBe(true);
    expect(body.data.divisions.length).toBeGreaterThan(0);
    expect(typeof body.data.divisions[0].minSr).toBe("number");
    expect(typeof body.data.divisions[0].maxSr).toBe("number");
  });
});

describe("/api/app/stats/rank/progress", () => {
  it("returns not_found when no SR data exists", async () => {
    const response = await handleRankProgressGet(
      createRequest("https://example.test/api/app/stats/rank/progress"),
      {
        authenticate: async () => createAuthSuccess(),
        getActiveSessionByDiscordId: async () => null,
        getLastCompletedSessionByDiscordId: async () => null,
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(404);
    expectContractError(body, CHATGPT_APP_ERROR_CODES.notFound);
  });

  it("computes rank progress from the ladder without hardcoded thresholds", async () => {
    const response = await handleRankProgressGet(
      createRequest("https://example.test/api/app/stats/rank/progress"),
      {
        authenticate: async () => createAuthSuccess(),
        getActiveSessionByDiscordId: async () => ({ srCurrent: 3350 }),
        getLastCompletedSessionByDiscordId: async () => ({ srCurrent: 3200 }),
        touchConnectionLastUsedAt: async () => {},
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.rankProgress);
    expect(body.data.currentSr).toBe(3350);
    expect(body.data.current.rank).toBe("Gold");
    expect(body.data.current.division).toBe("III");
    expect(body.data.nextDivision.rank).toBe("Platinum");
    expect(body.data.nextDivision.division).toBe("I");
    expect(body.data.nextDivision.srNeeded).toBe(250);
    expect(body.data.nextRank.rank).toBe("Platinum");
    expect(body.data.nextRank.division).toBe("I");
    expect(body.data.nextRank.srNeeded).toBe(250);
    expect(body.data.prevDivision.rank).toBe("Gold");
    expect(body.data.prevDivision.division).toBe("II");
    expect(body.data.prevDivision.srBack).toBe(251);
    expect(body.data.prevRank.rank).toBe("Silver");
    expect(body.data.prevRank.division).toBe("III");
    expect(body.data.prevRank.srBack).toBe(1251);
  });
});

describe("/api/app/profile", () => {
  it("returns settings payload in contract shape", async () => {
    const response = await handleProfileGet(createRequest("https://example.test/api/app/profile"), {
      authenticate: async () => createAuthSuccess(["profile.read"]),
      touchConnectionLastUsedAt: async () => {},
    });

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.settings);
    expect(body.data.connected).toBe(true);
    expect(body.data.user.name).toBe("Test User");
    expect(body.data.user.plan).toBe("free");
    expect(body.data.user.discordId).toBeUndefined();
  });
});

describe("/api/app/disconnect", () => {
  it("returns internal error contract when mutation fails", async () => {
    const response = await handleDisconnectPost(
      createRequest("https://example.test/api/app/disconnect"),
      {
        authenticate: async () => createAuthSuccess(["profile.read"]),
        disconnectByUserId: async () => ({
          ok: false,
          error: "disconnect_failed",
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(500);
    expectContractError(body, CHATGPT_APP_ERROR_CODES.internal);
  });

  it("returns settings contract payload when disconnect succeeds", async () => {
    const response = await handleDisconnectPost(
      createRequest("https://example.test/api/app/disconnect"),
      {
        authenticate: async () => createAuthSuccess(["profile.read"]),
        disconnectByUserId: async () => ({
          ok: true,
          revokedTokenCount: 2,
          revokedAt: 123,
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expectContractSuccess(body, CHATGPT_APP_VIEWS.settings);
    expect(body.data.connected).toBe(false);
    expect(body.data.disconnected).toBe(true);
    expect(body.data.revokedTokenCount).toBe(2);
  });
});
