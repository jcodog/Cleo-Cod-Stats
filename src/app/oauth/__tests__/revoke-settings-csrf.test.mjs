import { describe, expect, it } from "bun:test";

import { handleRevokePost } from "../revoke/route.ts";

function configureOAuthEnv() {
  process.env.OAUTH_JWT_SECRET = "test_jwt_secret";
  process.env.OAUTH_ISSUER = "https://app.example.com";
  process.env.OAUTH_ALLOWED_REDIRECT_URIS =
    "https://chatgpt.com/connector_platform_oauth_redirect";
}

function createSettingsDeps() {
  const mutationCalls = [];

  return {
    mutationCalls,
    deps: {
      getAuth: async () => ({
        userId: "clerk_user_123",
        sessionId: "session_123",
        getToken: async () => "convex_token_123",
      }),
      runMutation: async (...args) => {
        mutationCalls.push(args);
        return { ok: true };
      },
      resolveClient: async () => null,
      validateClientAuth: () => false,
    },
  };
}

describe("/oauth/revoke settings CSRF protection", () => {
  it("blocks requests without CSRF header", async () => {
    configureOAuthEnv();
    const { deps, mutationCalls } = createSettingsDeps();

    const response = await handleRevokePost(
      new Request("https://app.example.com/oauth/revoke?source=settings", {
        method: "POST",
        headers: {
          origin: "https://app.example.com",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      deps,
    );

    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("invalid_request");
    expect(payload.error_description).toContain("CSRF");
    expect(mutationCalls).toHaveLength(0);
  });

  it("blocks requests with mismatched origin", async () => {
    configureOAuthEnv();
    const { deps, mutationCalls } = createSettingsDeps();

    const response = await handleRevokePost(
      new Request("https://app.example.com/oauth/revoke?source=settings", {
        method: "POST",
        headers: {
          origin: "https://evil.example.com",
          "content-type": "application/json",
          "x-codstats-csrf": "1",
        },
        body: "{}",
      }),
      deps,
    );

    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("invalid_request");
    expect(payload.error_description).toContain("Origin");
    expect(mutationCalls).toHaveLength(0);
  });

  it("accepts same-origin settings revoke requests", async () => {
    configureOAuthEnv();
    const { deps, mutationCalls } = createSettingsDeps();

    const response = await handleRevokePost(
      new Request("https://app.example.com/oauth/revoke?source=settings", {
        method: "POST",
        headers: {
          origin: "https://app.example.com",
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
          "x-codstats-csrf": "1",
        },
        body: "{}",
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(mutationCalls).toHaveLength(1);
  });
});
