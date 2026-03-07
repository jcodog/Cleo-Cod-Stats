import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { GET as getChatGptAppConfig } from "../chatgpt-app-config/route.ts";

const TEST_ISSUER = "https://stats-dev.cleoai.cloud";

const OAUTH_ENV_KEYS = [
  "NODE_ENV",
  "OAUTH_ISSUER",
  "OAUTH_RESOURCE",
  "OAUTH_JWT_SECRET",
  "OAUTH_ALLOWED_REDIRECT_URIS",
];

const previousEnv = Object.fromEntries(
  OAUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function configureEnv(overrides = {}) {
  process.env.NODE_ENV = "test";
  process.env.OAUTH_ISSUER = TEST_ISSUER;
  delete process.env.OAUTH_RESOURCE;
  process.env.OAUTH_JWT_SECRET = "chatgpt_test_secret";
  process.env.OAUTH_ALLOWED_REDIRECT_URIS =
    "https://chatgpt.com/connector_platform_oauth_redirect,https://platform.openai.com/apps-manage/oauth";

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function restoreEnv() {
  for (const key of OAUTH_ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

beforeEach(() => {
  configureEnv();
});

afterAll(() => {
  restoreEnv();
});

describe("/debug/chatgpt-app-config", () => {
  it("returns development readiness metadata without secrets", async () => {
    const response = await getChatGptAppConfig(
      new Request(`${TEST_ISSUER}/debug/chatgpt-app-config`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.ok).toBe(true);
    expect(body.oauthIssuer).toBe(TEST_ISSUER);
    expect(body.widgetDomain).toBe("stats-dev.cleoai.cloud");
    expect(body.widgetCsp.resourceDomains).toEqual([TEST_ISSUER]);
    expect(body.widgetCsp.connectDomains).toEqual([TEST_ISSUER]);
    expect(body.widgetCsp.frameDomains).toEqual([]);
    expect(body.widgetCsp.baseUriDomains).toEqual([]);
    expect(body.discoveryUrls.authorizationServer).toBe(
      `${TEST_ISSUER}/.well-known/oauth-authorization-server`,
    );
    expect(body.discoveryUrls.openIdConfiguration).toBe(
      `${TEST_ISSUER}/.well-known/openid-configuration`,
    );
    expect(body.discoveryUrls.protectedResource).toBe(
      `${TEST_ISSUER}/.well-known/oauth-protected-resource`,
    );
    expect(body.discoveryUrls.protectedResourceMcp).toBe(
      `${TEST_ISSUER}/.well-known/oauth-protected-resource/mcp`,
    );
    expect(body.mcpUrl).toBe(`${TEST_ISSUER}/mcp`);
    expect(body.jwtSecret).toBeUndefined();
  });

  it("returns 404 in production", async () => {
    configureEnv({
      NODE_ENV: "production",
    });

    const response = await getChatGptAppConfig(
      new Request(`${TEST_ISSUER}/debug/chatgpt-app-config`),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("not_found");
  });
});
