import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { GET as getOpenIdConfiguration } from "../../.well-known/openid-configuration/route.ts";
import { GET as getAuthorizationServerMetadata } from "../../.well-known/oauth-authorization-server/route.ts";
import { GET as getProtectedResourceMetadata } from "../../.well-known/oauth-protected-resource/route.ts";
import { GET as getMcpProtectedResourceMetadata } from "../../.well-known/oauth-protected-resource/mcp/route.ts";

const TEST_ORIGIN = "https://app.example.com";
const ALT_ORIGIN = "https://other.example.com";

const OAUTH_ENV_KEYS = [
  "NODE_ENV",
  "OAUTH_JWT_SECRET",
  "OAUTH_RESOURCE",
  "OAUTH_ISSUER",
  "OAUTH_ALLOWED_REDIRECT_URIS",
  "OAUTH_ALLOWED_SCOPES",
];

const previousEnv = Object.fromEntries(
  OAUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function configureOAuthEnv({
  issuer = TEST_ORIGIN,
  resource,
  nodeEnv = "test",
} = {}) {
  process.env.NODE_ENV = nodeEnv;
  process.env.OAUTH_JWT_SECRET = "chatgpt_test_jwt_secret";
  process.env.OAUTH_ISSUER = issuer;

  if (resource === undefined) {
    delete process.env.OAUTH_RESOURCE;
  } else {
    process.env.OAUTH_RESOURCE = resource;
  }

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
  it("serves authorization metadata using OAUTH_ISSUER as canonical base", async () => {
    const response = await getAuthorizationServerMetadata(
      new Request(`${TEST_ORIGIN}/.well-known/oauth-authorization-server`),
    );
    const body = await response.json();
    const issuer = process.env.OAUTH_ISSUER;

    if (!issuer) {
      throw new Error("Test is missing OAUTH_ISSUER");
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(body.issuer).toBe(issuer);
    expect(body.authorization_endpoint).toBe(new URL("/oauth/authorize", issuer).toString());
    expect(body.token_endpoint).toBe(new URL("/oauth/token", issuer).toString());
    expect(body.revocation_endpoint).toBe(new URL("/oauth/revoke", issuer).toString());
    expect(body.registration_endpoint).toBe(new URL("/oauth/register", issuer).toString());
    expect(body.scopes_supported).toContain("profile.read");
    expect(body.scopes_supported).toContain("stats.read");
    expect(body.scopes_supported).toContain("offline_access");
  });

  it("serves openid discovery metadata without auth redirects", async () => {
    const response = await getOpenIdConfiguration(
      new Request(`${TEST_ORIGIN}/.well-known/openid-configuration`),
    );
    const body = await response.json();
    const issuer = process.env.OAUTH_ISSUER;

    if (!issuer) {
      throw new Error("Test is missing OAUTH_ISSUER");
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(body.issuer).toBe(issuer);
    expect(body.authorization_endpoint).toBe(new URL("/oauth/authorize", issuer).toString());
    expect(body.token_endpoint).toBe(new URL("/oauth/token", issuer).toString());
    expect(body.registration_endpoint).toBe(new URL("/oauth/register", issuer).toString());
    expect(body.response_types_supported).toContain("code");
    expect(body.subject_types_supported).toContain("public");
    expect(body.code_challenge_methods_supported).toContain("S256");
    expect(body.scopes_supported).toContain("profile.read");
    expect(body.scopes_supported).toContain("stats.read");
  });

  it("defaults OAUTH_RESOURCE to OAUTH_ISSUER in protected resource metadata", async () => {
    const response = await getProtectedResourceMetadata(
      new Request(`${TEST_ORIGIN}/.well-known/oauth-protected-resource`),
    );
    const body = await response.json();
    const issuer = process.env.OAUTH_ISSUER;

    if (!issuer) {
      throw new Error("Test is missing OAUTH_ISSUER");
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(body.resource).toBe(issuer);
    expect(body.authorization_servers).toEqual([issuer]);
    expect(body.scopes_supported).toContain("profile.read");
    expect(body.scopes_supported).toContain("stats.read");
    expect(body.scopes_supported).toContain("offline_access");
  });

  it("uses explicit OAUTH_RESOURCE when configured", async () => {
    configureOAuthEnv({
      resource: "https://resource.example.com",
    });

    const response = await getProtectedResourceMetadata(
      new Request(`${TEST_ORIGIN}/.well-known/oauth-protected-resource`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resource).toBe("https://resource.example.com");
  });

  it("serves mcp protected resource metadata using canonical /mcp resource URL", async () => {
    const response = await getMcpProtectedResourceMetadata(
      new Request(`${TEST_ORIGIN}/.well-known/oauth-protected-resource/mcp`),
    );
    const body = await response.json();
    const issuer = process.env.OAUTH_ISSUER;

    if (!issuer) {
      throw new Error("Test is missing OAUTH_ISSUER");
    }

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("text/html");
    expect(body.resource).toBe(new URL("/mcp", issuer).toString());
    expect(body.authorization_servers).toEqual([issuer]);
    expect(body.scopes_supported).toContain("profile.read");
    expect(body.scopes_supported).toContain("stats.read");
    expect(body.scopes_supported).toContain("offline_access");
  });

  it("fails with a clear error in production when request origin mismatches OAUTH_ISSUER", async () => {
    configureOAuthEnv({
      issuer: TEST_ORIGIN,
      nodeEnv: "production",
    });

    const response = await getAuthorizationServerMetadata(
      new Request(`${ALT_ORIGIN}/.well-known/oauth-authorization-server`),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("server_error");
    expect(body.error_description).toContain("does not match configured OAUTH_ISSUER origin");
  });

  it("fails when OAUTH_ALLOWED_SCOPES omits enforced app scopes", async () => {
    configureOAuthEnv();
    process.env.OAUTH_ALLOWED_SCOPES = "profile.read";

    const response = await getAuthorizationServerMetadata(
      new Request(`${TEST_ORIGIN}/.well-known/oauth-authorization-server`),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("server_error");
    expect(body.error_description).toContain("required scope: stats.read");
  });
});
