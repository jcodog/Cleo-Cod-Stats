import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { GET as getAuthorizationServerMetadata } from "../../.well-known/oauth-authorization-server/route.ts";
import { GET as getProtectedResourceMetadata } from "../../.well-known/oauth-protected-resource/route.ts";

const TEST_ORIGIN = "https://app.example.com";

const OAUTH_ENV_KEYS = [
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
  process.env.OAUTH_JWT_SECRET = "chatgpt_test_jwt_secret";
  process.env.OAUTH_RESOURCE = TEST_ORIGIN;
  process.env.OAUTH_ISSUER = TEST_ORIGIN;
  process.env.OAUTH_ALLOWED_REDIRECT_URIS =
    "https://chatgpt.com/connector_platform_oauth_redirect,https://platform.openai.com/apps-manage/oauth";
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

beforeEach(() => {
  configureOAuthEnv();
});

afterAll(() => {
  restoreOAuthEnv();
});

describe("OAuth metadata endpoints are public JSON routes", () => {
  it("serves /.well-known/oauth-authorization-server without HTML", async () => {
    const response = await getAuthorizationServerMetadata(
      new Request(`${TEST_ORIGIN}/.well-known/oauth-authorization-server`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(body.authorization_endpoint).toBe(`${TEST_ORIGIN}/oauth/authorize`);
    expect(body.token_endpoint).toBe(`${TEST_ORIGIN}/oauth/token`);
  });

  it("serves /.well-known/oauth-protected-resource without HTML", async () => {
    const response = await getProtectedResourceMetadata(
      new Request(`${TEST_ORIGIN}/.well-known/oauth-protected-resource`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(body.resource).toBe(TEST_ORIGIN);
    expect(body.authorization_servers).toEqual([`${TEST_ORIGIN}/`]);
  });
});
