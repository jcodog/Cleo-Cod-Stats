import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createChatGptAppMcpServer } from "../chatgpt-app-mcp.ts";

const TEST_ORIGIN = "https://codstats.test";

const originalFetch = globalThis.fetch;
const previousOauthResource = process.env.OAUTH_RESOURCE;

beforeAll(() => {
  process.env.OAUTH_RESOURCE = TEST_ORIGIN;
});

afterAll(() => {
  if (previousOauthResource === undefined) {
    delete process.env.OAUTH_RESOURCE;
  } else {
    process.env.OAUTH_RESOURCE = previousOauthResource;
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

function buildRecentGames(totalGames, now) {
  return Array.from({ length: totalGames }, (_, index) => ({
    sessionId: index < 4 ? "session-last" : `session-${index + 1}`,
    createdAt: now - index * 60_000,
    mode: index % 2 === 0 ? "hardpoint" : "snd",
    outcome: index % 3 === 0 ? "loss" : "win",
    srChange: index % 2 === 0 ? 22 : -13,
    kills: 18 - (index % 5),
    deaths: 9 + (index % 4),
  }));
}

describe("ChatGPT MCP CodStats app", () => {
  it("registers expected tools with best-practice hints", async () => {
    await withMcpClient(async ({ client }) => {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);

      expect(names).toContain("codstats_open");
      expect(names).toContain("codstats_get_home");
      expect(names).toContain("codstats_get_settings");
      expect(names).toContain("codstats_disconnect");

      const openTool = getToolByName(listed.tools, "codstats_open");
      const homeTool = getToolByName(listed.tools, "codstats_get_home");
      const settingsTool = getToolByName(listed.tools, "codstats_get_settings");
      const disconnectTool = getToolByName(listed.tools, "codstats_disconnect");

      expect(openTool?._meta?.ui?.resourceUri).toBe("ui://codstats/widget.html");
      expect(openTool?._meta?.["openai/outputTemplate"]).toBe(
        "ui://codstats/widget.html",
      );

      expect(homeTool?.annotations?.readOnlyHint).toBe(true);
      expect(settingsTool?.annotations?.readOnlyHint).toBe(true);

      expect(disconnectTool?.annotations?.readOnlyHint).toBe(false);
      expect(disconnectTool?.annotations?.destructiveHint).toBe(true);
      expect(disconnectTool?.annotations?.openWorldHint).toBe(false);

      expect(Array.isArray(homeTool?._meta?.securitySchemes)).toBe(true);
      expect(Array.isArray(settingsTool?._meta?.securitySchemes)).toBe(true);
      expect(Array.isArray(disconnectTool?._meta?.securitySchemes)).toBe(true);
    });
  });

  it("loads home data and composes compact dashboard content", async () => {
    const now = Date.now();
    const recentGames = buildRecentGames(30, now);

    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/stats/summary") {
        return jsonResponse(200, {
          ok: true,
          summary: {
            totalMatches: 144,
            wins: 88,
            losses: 56,
            kills: 2_250,
            deaths: 1_500,
            totalSrChange: 910,
            winRate: 0.6111,
            kdRatio: 1.5,
            bestStreak: 8,
            currentSr: 3_420,
            lastSessionStartedAt: now - 20 * 60_000,
            lastSessionEndedAt: now - 4 * 60_000,
            lastSessionUuid: "session-last",
            lastMatchAt: now - 60_000,
          },
        });
      }

      if (url.pathname === "/api/app/stats/recent") {
        const requestedLimit = Number(url.searchParams.get("limit"));
        const limit = Number.isInteger(requestedLimit) ? requestedLimit : 10;

        return jsonResponse(200, {
          ok: true,
          recent: {
            games: recentGames.slice(0, limit),
          },
        });
      }

      return jsonResponse(404, {
        ok: false,
        error: "not_found",
      });
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_home",
        arguments: {
          recentLimit: 8,
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent.today.totalMatches).toBeGreaterThan(0);
      expect(result.structuredContent.recentMatches).toHaveLength(8);
      expect(result.structuredContent.lastSession.sessionUuid).toBe("session-last");
      expect(result.structuredContent.overall.bestStreak).toBe(8);
    });
  });

  it("loads settings with minimized profile payload", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/profile") {
        return jsonResponse(200, {
          ok: true,
          profile: {
            name: "Casey",
            plan: "premium",
            discordId: "discord-user-123",
          },
        });
      }

      return jsonResponse(404, {
        ok: false,
        error: "not_found",
      });
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_settings",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent.user.name).toBe("Casey");
      expect(result.structuredContent.user.plan).toBe("premium");
      expect(result.structuredContent.user.discordId).toBeUndefined();
    });
  });

  it("propagates OAuth challenge metadata on protected tool failures", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/profile") {
        return jsonResponse(
          401,
          {
            ok: false,
            error: "invalid_token",
            error_description: "Missing bearer token",
          },
          {
            "WWW-Authenticate":
              'Bearer resource_metadata="https://codstats.test/.well-known/oauth-protected-resource", error="invalid_token", error_description="Missing bearer token"',
          },
        );
      }

      return jsonResponse(404, {
        ok: false,
        error: "not_found",
      });
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
        return jsonResponse(200, {
          ok: true,
          disconnected: true,
          revokedAt: Date.now(),
          revokedTokenCount: 2,
        });
      }

      return jsonResponse(404, {
        ok: false,
        error: "not_found",
      });
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
      expect(approved.structuredContent.disconnected).toBe(true);
      expect(disconnectCallCount).toBe(1);
    });
  });
});
