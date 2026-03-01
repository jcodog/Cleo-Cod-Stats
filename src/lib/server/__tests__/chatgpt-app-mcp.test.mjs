import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { GET as getMcpRoute } from "../../../app/mcp/route.ts";
import { createChatGptAppMcpServer } from "../chatgpt-app-mcp.ts";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_VIEWS,
} from "../chatgpt-app-contract.ts";

const TEST_ORIGIN = "https://codstats.test";
const TEST_APP_PUBLIC_ORIGIN = "https://stats-dev.cleoai.cloud";
const TEST_WIDGET_URL = `${TEST_APP_PUBLIC_ORIGIN}/ui/codstats/widget.html`;

const originalFetch = globalThis.fetch;
const previousOauthResource = process.env.OAUTH_RESOURCE;
const previousOauthIssuer = process.env.OAUTH_ISSUER;
const previousAppPublicOrigin = process.env.APP_PUBLIC_ORIGIN;

beforeAll(() => {
  process.env.OAUTH_RESOURCE = TEST_ORIGIN;
  process.env.OAUTH_ISSUER = TEST_ORIGIN;
  process.env.APP_PUBLIC_ORIGIN = TEST_APP_PUBLIC_ORIGIN;
});

afterAll(() => {
  if (previousOauthResource === undefined) {
    delete process.env.OAUTH_RESOURCE;
  } else {
    process.env.OAUTH_RESOURCE = previousOauthResource;
  }

  if (previousOauthIssuer === undefined) {
    delete process.env.OAUTH_ISSUER;
  } else {
    process.env.OAUTH_ISSUER = previousOauthIssuer;
  }

  if (previousAppPublicOrigin === undefined) {
    delete process.env.APP_PUBLIC_ORIGIN;
  } else {
    process.env.APP_PUBLIC_ORIGIN = previousAppPublicOrigin;
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function contractSuccess(view, data) {
  return {
    ok: true,
    view,
    data,
    meta: {
      generatedAt: Date.now(),
    },
  };
}

function contractError(code, message) {
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

function expectContractShape(payload, view) {
  expect(payload.ok).toBe(true);
  expect(payload.view).toBe(view);
  expect(typeof payload.data).toBe("object");
  expect(payload.data).not.toBeNull();
  expect(typeof payload.meta.generatedAt).toBe("number");
}

async function withMcpClient(runTest) {
  const server = createChatGptAppMcpServer();
  const client = new Client({
    name: "codstats-mcp-test-client",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    await runTest({ client });
  } finally {
    await Promise.allSettled([
      client.close(),
      server.close(),
      clientTransport.close(),
      serverTransport.close(),
    ]);
  }
}

function getToolByName(tools, name) {
  return tools.find((tool) => tool.name === name) ?? null;
}

describe("ChatGPT MCP CodStats app", () => {
  it("registers contract-compliant tools and APP_PUBLIC_ORIGIN widget metadata", async () => {
    await withMcpClient(async ({ client }) => {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);

      const expectedTools = [
        "codstats_open",
        "codstats_get_current_session",
        "codstats_get_last_session",
        "codstats_get_match_history",
        "codstats_get_match",
        "codstats_get_rank_ladder",
        "codstats_get_rank_progress",
        "codstats_get_settings",
        "codstats_disconnect",
      ];

      for (const toolName of expectedTools) {
        expect(names).toContain(toolName);
      }

      expect(names).not.toContain("codstats_get_home");

      const widgetTools = [
        "codstats_open",
        "codstats_get_current_session",
        "codstats_get_last_session",
        "codstats_get_match_history",
        "codstats_get_rank_progress",
        "codstats_get_settings",
      ];

      for (const toolName of widgetTools) {
        const tool = getToolByName(listed.tools, toolName);
        expect(tool?._meta?.ui?.resourceUri).toBe(TEST_WIDGET_URL);
        expect(tool?._meta?.["openai/outputTemplate"]).toBe(TEST_WIDGET_URL);
      }

      const disconnectTool = getToolByName(listed.tools, "codstats_disconnect");

      expect(disconnectTool?.annotations?.readOnlyHint).toBe(false);
      expect(disconnectTool?.annotations?.destructiveHint).toBe(true);
      expect(disconnectTool?.annotations?.openWorldHint).toBe(false);
    });
  });

  it("returns only active session for codstats_get_current_session", async () => {
    let currentCalls = 0;
    let lastCalls = 0;

    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/stats/session/current") {
        currentCalls += 1;
        return jsonResponse(
          200,
          contractSuccess(CHATGPT_APP_VIEWS.sessionCurrent, {
            active: false,
          }),
        );
      }

      if (url.pathname === "/api/app/stats/session/last") {
        lastCalls += 1;
        return jsonResponse(
          200,
          contractSuccess(CHATGPT_APP_VIEWS.sessionLast, {
            found: true,
          }),
        );
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_current_session",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expectContractShape(result.structuredContent, CHATGPT_APP_VIEWS.sessionCurrent);
      expect(result.structuredContent.data.active).toBe(false);
      expect(currentCalls).toBe(1);
      expect(lastCalls).toBe(0);
    });
  });

  it("clamps codstats_get_match_history limit to 15", async () => {
    let receivedLimit = null;

    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/stats/matches") {
        receivedLimit = Number(url.searchParams.get("limit"));

        return jsonResponse(
          200,
          contractSuccess(CHATGPT_APP_VIEWS.matchesHistory, {
            items: [
              {
                matchId: "match_1",
                mode: "hardpoint",
                playedAt: 1700000000000,
                outcome: "win",
              },
            ],
            nextCursor: null,
            hasMore: false,
            limit: receivedLimit,
          }),
        );
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_match_history",
        arguments: {
          limit: 99,
        },
      });

      expect(result.isError).not.toBe(true);
      expect(receivedLimit).toBe(15);
      expectContractShape(result.structuredContent, CHATGPT_APP_VIEWS.matchesHistory);
      expect(Array.isArray(result.structuredContent.data.items)).toBe(true);
      expect(result.structuredContent.data.hasMore).toBe(false);
    });
  });

  it("returns rank progress contract payload", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/stats/rank/progress") {
        return jsonResponse(
          200,
          contractSuccess(CHATGPT_APP_VIEWS.rankProgress, {
            title: "COD Ranked Skill Divisions",
            ruleset: "sr-based-v1",
            currentSr: 3350,
            current: { rank: "Gold", division: "III", minSr: 3100, maxSr: 3599 },
            nextDivision: {
              rank: "Platinum",
              division: "I",
              minSr: 3600,
              maxSr: 4199,
              srNeeded: 250,
            },
            nextRank: {
              rank: "Platinum",
              division: "I",
              minSr: 3600,
              maxSr: 4199,
              srNeeded: 250,
            },
            prevDivision: {
              rank: "Gold",
              division: "II",
              minSr: 2600,
              maxSr: 3099,
              srBack: 251,
            },
          }),
        );
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_rank_progress",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expectContractShape(result.structuredContent, CHATGPT_APP_VIEWS.rankProgress);
      expect(result.structuredContent.data.current.rank).toBe("Gold");
      expect(result.structuredContent.data.nextDivision.srNeeded).toBe(250);
      expect(result.structuredContent.data.nextRank.srNeeded).toBe(250);
      expect(result.structuredContent.data.prevDivision.srBack).toBe(251);
    });
  });

  it("loads settings in contract shape", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/profile") {
        return jsonResponse(
          200,
          contractSuccess(CHATGPT_APP_VIEWS.settings, {
            connected: true,
            user: {
              name: "Casey",
              plan: "premium",
            },
          }),
        );
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_settings",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expectContractShape(result.structuredContent, CHATGPT_APP_VIEWS.settings);
      expect(result.structuredContent.data.user.name).toBe("Casey");
      expect(result.structuredContent.data.user.plan).toBe("premium");
    });
  });

  it("propagates OAuth challenge metadata on protected tool failures", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/profile") {
        return jsonResponse(
          401,
          contractError(CHATGPT_APP_ERROR_CODES.unauthorized, "Missing bearer token"),
          {
            "WWW-Authenticate":
              'Bearer resource_metadata="https://codstats.test/.well-known/oauth-protected-resource", error="invalid_token", error_description="Missing bearer token"',
          },
        );
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_settings",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result._meta["mcp/www_authenticate"]).toBeArray();
      expect(result._meta["mcp/www_authenticate"][0]).toContain("Bearer");
    });
  });

  it("requires explicit confirmation before disconnect", async () => {
    let disconnectCallCount = 0;

    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/disconnect") {
        disconnectCallCount += 1;

        return jsonResponse(
          200,
          contractSuccess(CHATGPT_APP_VIEWS.settings, {
            connected: false,
            disconnected: true,
            revokedAt: Date.now(),
            revokedTokenCount: 2,
          }),
        );
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const denied = await client.callTool({
        name: "codstats_disconnect",
        arguments: {
          confirm: false,
        },
      });

      expect(denied.isError).toBe(true);
      expect(disconnectCallCount).toBe(0);

      const approved = await client.callTool({
        name: "codstats_disconnect",
        arguments: {
          confirm: true,
        },
      });

      expect(approved.isError).not.toBe(true);
      expectContractShape(approved.structuredContent, CHATGPT_APP_VIEWS.settings);
      expect(approved.structuredContent.data.disconnected).toBe(true);
      expect(disconnectCallCount).toBe(1);
    });
  });

  it("serves /mcp without HTML login pages", async () => {
    const response = await getMcpRoute(new Request(`${TEST_ORIGIN}/mcp`));
    const contentType = response.headers.get("content-type") ?? "";

    expect(contentType).not.toContain("text/html");
  });
});
