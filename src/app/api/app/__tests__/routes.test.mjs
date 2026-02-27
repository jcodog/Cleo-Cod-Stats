import { describe, expect, it } from "bun:test";

import { handleDisconnectPost } from "../disconnect/route.ts";
import { handleProfileGet } from "../profile/route.ts";
import { handleDailyGet } from "../stats/daily/route.ts";
import { handleRecentGet } from "../stats/recent/route.ts";
import { handleSummaryGet } from "../stats/summary/route.ts";

const ACTIVE_USER = {
  _id: "user_test_123",
  clerkUserId: "clerk_user_123",
  discordId: "discord_user_123",
  name: "Test User",
  plan: "free",
  status: "active",
  chatgptLinked: true,
  connectionStatus: "active",
  connectionScopes: ["stats.read"],
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

function createRequest(url) {
  return new Request(url);
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createAuthFailure(status, error = "invalid_token") {
  return {
    ok: false,
    response: jsonResponse(status, { ok: false, error }),
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

describe("/api/app/profile", () => {
  it("returns 401 when auth fails", async () => {
    let touched = false;

    const response = await handleProfileGet(createRequest("https://example.test/api/app/profile"), {
      authenticate: async () => createAuthFailure(401),
      touchConnectionLastUsedAt: async () => {
        touched = true;
      },
    });

    expect(response.status).toBe(401);
    expect(touched).toBe(false);
  });

  it("returns 403 when scope check fails", async () => {
    let touched = false;

    const response = await handleProfileGet(createRequest("https://example.test/api/app/profile"), {
      authenticate: async () => createAuthFailure(403, "insufficient_scope"),
      touchConnectionLastUsedAt: async () => {
        touched = true;
      },
    });

    expect(response.status).toBe(403);
    expect(touched).toBe(false);
  });

  it("returns 200 with profile when auth succeeds", async () => {
    let touchedUserId = null;
    let requiredScopes = null;

    const response = await handleProfileGet(createRequest("https://example.test/api/app/profile"), {
      authenticate: async (_request, scopes) => {
        requiredScopes = scopes;
        return createAuthSuccess(["profile.read"]);
      },
      touchConnectionLastUsedAt: async (userId) => {
        touchedUserId = userId;
      },
    });

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(touchedUserId).toBe(ACTIVE_USER._id);
    expect(requiredScopes).toEqual(["profile.read"]);
    expect(body.ok).toBe(true);
    expect(body.profile.discordId).toBe(ACTIVE_USER.discordId);
  });
});

describe("/api/app/disconnect", () => {
  it("returns 401 when auth fails", async () => {
    let disconnected = false;

    const response = await handleDisconnectPost(
      createRequest("https://example.test/api/app/disconnect"),
      {
        authenticate: async () => createAuthFailure(401),
        disconnectByUserId: async () => {
          disconnected = true;
          return { ok: true, revokedTokenCount: 1, revokedAt: 1 };
        },
      },
    );

    expect(response.status).toBe(401);
    expect(disconnected).toBe(false);
  });

  it("returns 500 when disconnect mutation fails", async () => {
    const response = await handleDisconnectPost(
      createRequest("https://example.test/api/app/disconnect"),
      {
        authenticate: async () => createAuthSuccess(["profile.read"]),
        disconnectByUserId: async () => ({
          ok: false,
          error: "user_not_found",
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("disconnect_failed");
  });

  it("returns 200 when disconnect succeeds", async () => {
    let requiredScopes = null;
    let disconnectedUserId = null;

    const response = await handleDisconnectPost(
      createRequest("https://example.test/api/app/disconnect"),
      {
        authenticate: async (_request, scopes) => {
          requiredScopes = scopes;
          return createAuthSuccess(["profile.read"]);
        },
        disconnectByUserId: async (userId) => {
          disconnectedUserId = userId;
          return {
            ok: true,
            revokedTokenCount: 2,
            revokedAt: 123,
          };
        },
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requiredScopes).toEqual(["profile.read"]);
    expect(disconnectedUserId).toBe(ACTIVE_USER._id);
    expect(body.ok).toBe(true);
    expect(body.disconnected).toBe(true);
    expect(body.revokedTokenCount).toBe(2);
  });
});

describe("/api/app/stats/summary", () => {
  it("returns 401 when auth fails", async () => {
    let queried = false;
    let touched = false;

    const response = await handleSummaryGet(
      createRequest("https://example.test/api/app/stats/summary"),
      {
        authenticate: async () => createAuthFailure(401),
        getSummaryByDiscordId: async () => {
          queried = true;
          return { totalMatches: 0 };
        },
        touchConnectionLastUsedAt: async () => {
          touched = true;
        },
      },
    );

    expect(response.status).toBe(401);
    expect(queried).toBe(false);
    expect(touched).toBe(false);
  });

  it("returns 403 when scope check fails", async () => {
    let queried = false;
    let touched = false;

    const response = await handleSummaryGet(
      createRequest("https://example.test/api/app/stats/summary"),
      {
        authenticate: async () => createAuthFailure(403, "insufficient_scope"),
        getSummaryByDiscordId: async () => {
          queried = true;
          return { totalMatches: 0 };
        },
        touchConnectionLastUsedAt: async () => {
          touched = true;
        },
      },
    );

    expect(response.status).toBe(403);
    expect(queried).toBe(false);
    expect(touched).toBe(false);
  });

  it("returns 200 with summary when auth succeeds", async () => {
    let queriedDiscordId = null;
    let touchedUserId = null;
    let requiredScopes = null;
    const mockedSummary = { totalMatches: 42, wins: 23 };

    const response = await handleSummaryGet(
      createRequest("https://example.test/api/app/stats/summary"),
      {
        authenticate: async (_request, scopes) => {
          requiredScopes = scopes;
          return createAuthSuccess();
        },
        getSummaryByDiscordId: async (discordId) => {
          queriedDiscordId = discordId;
          return mockedSummary;
        },
        touchConnectionLastUsedAt: async (userId) => {
          touchedUserId = userId;
        },
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queriedDiscordId).toBe(ACTIVE_USER.discordId);
    expect(touchedUserId).toBe(ACTIVE_USER._id);
    expect(requiredScopes).toEqual(["stats.read"]);
    expect(body.ok).toBe(true);
    expect(body.summary).toEqual(mockedSummary);
  });
});

describe("/api/app/stats/daily", () => {
  it("returns 401 when auth fails", async () => {
    let queried = false;
    let touched = false;

    const response = await handleDailyGet(
      createRequest("https://example.test/api/app/stats/daily?date=2026-02-27"),
      {
        authenticate: async () => createAuthFailure(401),
        getDailyByDiscordId: async () => {
          queried = true;
          return { totalMatches: 0 };
        },
        touchConnectionLastUsedAt: async () => {
          touched = true;
        },
      },
    );

    expect(response.status).toBe(401);
    expect(queried).toBe(false);
    expect(touched).toBe(false);
  });

  it("returns 403 when scope check fails", async () => {
    let queried = false;
    let touched = false;

    const response = await handleDailyGet(
      createRequest("https://example.test/api/app/stats/daily?date=2026-02-27"),
      {
        authenticate: async () => createAuthFailure(403, "insufficient_scope"),
        getDailyByDiscordId: async () => {
          queried = true;
          return { totalMatches: 0 };
        },
        touchConnectionLastUsedAt: async () => {
          touched = true;
        },
      },
    );

    expect(response.status).toBe(403);
    expect(queried).toBe(false);
    expect(touched).toBe(false);
  });

  it("returns 200 with daily stats when auth succeeds", async () => {
    let queriedDiscordId = null;
    let queriedDate = null;
    let touchedUserId = null;
    let requiredScopes = null;
    const mockedDaily = { totalMatches: 4, wins: 3 };

    const response = await handleDailyGet(
      createRequest("https://example.test/api/app/stats/daily?date=2026-02-27"),
      {
        authenticate: async (_request, scopes) => {
          requiredScopes = scopes;
          return createAuthSuccess();
        },
        getDailyByDiscordId: async (discordId, date) => {
          queriedDiscordId = discordId;
          queriedDate = date;
          return mockedDaily;
        },
        touchConnectionLastUsedAt: async (userId) => {
          touchedUserId = userId;
        },
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queriedDiscordId).toBe(ACTIVE_USER.discordId);
    expect(queriedDate).toBe("2026-02-27");
    expect(touchedUserId).toBe(ACTIVE_USER._id);
    expect(requiredScopes).toEqual(["stats.read"]);
    expect(body.ok).toBe(true);
    expect(body.daily).toEqual(mockedDaily);
  });
});

describe("/api/app/stats/recent", () => {
  it("returns 401 when auth fails", async () => {
    let queried = false;
    let touched = false;

    const response = await handleRecentGet(
      createRequest("https://example.test/api/app/stats/recent?limit=10"),
      {
        authenticate: async () => createAuthFailure(401),
        getRecentByDiscordId: async () => {
          queried = true;
          return { totalMatches: 0 };
        },
        touchConnectionLastUsedAt: async () => {
          touched = true;
        },
      },
    );

    expect(response.status).toBe(401);
    expect(queried).toBe(false);
    expect(touched).toBe(false);
  });

  it("returns 403 when scope check fails", async () => {
    let queried = false;
    let touched = false;

    const response = await handleRecentGet(
      createRequest("https://example.test/api/app/stats/recent?limit=10"),
      {
        authenticate: async () => createAuthFailure(403, "insufficient_scope"),
        getRecentByDiscordId: async () => {
          queried = true;
          return { totalMatches: 0 };
        },
        touchConnectionLastUsedAt: async () => {
          touched = true;
        },
      },
    );

    expect(response.status).toBe(403);
    expect(queried).toBe(false);
    expect(touched).toBe(false);
  });

  it("returns 200 with recent stats when auth succeeds", async () => {
    let queriedDiscordId = null;
    let queriedLimit = null;
    let touchedUserId = null;
    let requiredScopes = null;
    const mockedRecent = { totalMatches: 10, wins: 6 };

    const response = await handleRecentGet(
      createRequest("https://example.test/api/app/stats/recent?limit=10"),
      {
        authenticate: async (_request, scopes) => {
          requiredScopes = scopes;
          return createAuthSuccess();
        },
        getRecentByDiscordId: async (discordId, limit) => {
          queriedDiscordId = discordId;
          queriedLimit = limit;
          return mockedRecent;
        },
        touchConnectionLastUsedAt: async (userId) => {
          touchedUserId = userId;
        },
      },
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queriedDiscordId).toBe(ACTIVE_USER.discordId);
    expect(queriedLimit).toBe(10);
    expect(touchedUserId).toBe(ACTIVE_USER._id);
    expect(requiredScopes).toEqual(["stats.read"]);
    expect(body.ok).toBe(true);
    expect(body.recent).toEqual(mockedRecent);
  });
});
