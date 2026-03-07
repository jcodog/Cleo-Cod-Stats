import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { handleAuthorizeGet } from "../authorize/route.ts";

const TEST_ORIGIN = "https://app.example.com";
const TEST_REDIRECT_URI = "https://chatgpt.com/connector_platform_oauth_redirect";

const OAUTH_ENV_KEYS = [
  "OAUTH_CLIENT_ID",
  "OAUTH_CLIENT_SECRET",
  "OAUTH_JWT_SECRET",
  "OAUTH_RESOURCE",
  "OAUTH_ISSUER",
  "OAUTH_ALLOWED_REDIRECT_URIS",
  "OAUTH_ALLOWED_SCOPES",
];

const previousEnv = Object.fromEntries(
  OAUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function configureOAuthEnv() {
  process.env.OAUTH_CLIENT_ID = "chatgpt_static_client";
  process.env.OAUTH_CLIENT_SECRET = "chatgpt_static_secret";
  process.env.OAUTH_JWT_SECRET = "chatgpt_test_jwt_secret";
  process.env.OAUTH_RESOURCE = TEST_ORIGIN;
  process.env.OAUTH_ISSUER = TEST_ORIGIN;
  process.env.OAUTH_ALLOWED_REDIRECT_URIS = TEST_REDIRECT_URI;
  process.env.OAUTH_ALLOWED_SCOPES = "profile.read,stats.read";
}

function restoreOAuthEnv() {
  for (const key of OAUTH_ENV_KEYS) {
    const previousValue = previousEnv[key];
    if (previousValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = previousValue;
  }
}

function createAuthorizeRequest() {
  const url = new URL("/oauth/authorize", TEST_ORIGIN);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "chatgpt_static_client");
  url.searchParams.set("redirect_uri", TEST_REDIRECT_URI);
  url.searchParams.set("scope", "stats.read");
  url.searchParams.set("state", "state_value_with_16_chars");
  url.searchParams.set("resource", TEST_ORIGIN);
  url.searchParams.set("code_challenge", "a".repeat(43));
  url.searchParams.set("code_challenge_method", "S256");
  return new Request(url.toString());
}

beforeEach(() => {
  configureOAuthEnv();
});

afterAll(() => {
  restoreOAuthEnv();
});

describe("/oauth/authorize public behavior", () => {
  it("does not redirect to Clerk sign-in when session is missing", async () => {
    let mutationCalled = false;

    const response = await handleAuthorizeGet(createAuthorizeRequest(), {
      getAuth: async () => ({
        userId: null,
        sessionId: null,
        getToken: async () => null,
      }),
      runMutation: async () => {
        mutationCalled = true;
        return { ok: true };
      },
    });

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(mutationCalled).toBe(false);

    const location = response.headers.get("location");
    expect(location).not.toBeNull();

    if (!location) {
      return;
    }

    expect(location).not.toContain("/sign-in");

    const redirectUrl = new URL(location);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(TEST_REDIRECT_URI);
    expect(redirectUrl.searchParams.get("error")).toBe("invalid_request");
    expect(redirectUrl.searchParams.get("error_description")).toContain("signed in");
  });

  it("returns JSON errors for malformed requests", async () => {
    const response = await handleAuthorizeGet(new Request(`${TEST_ORIGIN}/oauth/authorize`));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload.error).toBe("invalid_request");
  });
});
