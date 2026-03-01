import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { GET as getMcpRoute, POST as postMcpRoute } from "../../../app/mcp/route.ts";
import { GET as getWidgetTemplateRoute } from "../../../app/ui/codstats/widget.html/route.ts";
import { GET as getSessionTemplateRoute } from "../../../app/ui/codstats/session.html/route.ts";
import { GET as getMatchesTemplateRoute } from "../../../app/ui/codstats/matches.html/route.ts";
import { GET as getRankTemplateRoute } from "../../../app/ui/codstats/rank.html/route.ts";
import { GET as getSettingsTemplateRoute } from "../../../app/ui/codstats/settings.html/route.ts";
import { createChatGptAppMcpServer } from "../chatgpt-app-mcp.ts";
import { renderCodstatsTemplateHtml } from "../chatgpt-app-ui-templates.ts";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_VIEWS,
} from "../chatgpt-app-contract.ts";

const TEST_ORIGIN = "https://codstats.test";
const TEST_APP_PUBLIC_ORIGIN = "https://stats-dev.cleoai.cloud";
const TEST_WIDGET_URL = `${TEST_APP_PUBLIC_ORIGIN}/ui/codstats/widget.html`;
const TEST_SESSION_URL = `${TEST_APP_PUBLIC_ORIGIN}/ui/codstats/session.html`;
const TEST_MATCHES_URL = `${TEST_APP_PUBLIC_ORIGIN}/ui/codstats/matches.html`;
const TEST_RANK_URL = `${TEST_APP_PUBLIC_ORIGIN}/ui/codstats/rank.html`;
const TEST_SETTINGS_URL = `${TEST_APP_PUBLIC_ORIGIN}/ui/codstats/settings.html`;

const TEST_WIDGET_URI = "ui://codstats/widget.html";
const TEST_SESSION_URI = "ui://codstats/session.html";
const TEST_MATCHES_URI = "ui://codstats/matches.html";
const TEST_RANK_URI = "ui://codstats/rank.html";
const TEST_SETTINGS_URI = "ui://codstats/settings.html";

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

      const toolTemplates = {
        codstats_open: TEST_WIDGET_URI,
        codstats_get_current_session: TEST_SESSION_URI,
        codstats_get_last_session: TEST_SESSION_URI,
        codstats_get_match_history: TEST_MATCHES_URI,
        codstats_get_rank_progress: TEST_RANK_URI,
        codstats_get_settings: TEST_SETTINGS_URI,
      };

      for (const [toolName, templateUri] of Object.entries(toolTemplates)) {
        const tool = getToolByName(listed.tools, toolName);
        expect(tool?._meta?.ui?.resourceUri).toBe(templateUri);
        expect(tool?._meta?.["openai/outputTemplate"]).toBe(templateUri);
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
            active: true,
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
      expect(result.structuredContent.data.active).toBe(true);
      expect(result.structuredContent.data.uiOutput.templateUri).toBe(TEST_SESSION_URI);
      expect(result.structuredContent.data.uiOutput.templateUrl).toBe(TEST_SESSION_URL);
      expect(result._meta.codstats.templateName).toBe("session");
      expect(result._meta.codstats.viewModel.source).toBe("current");
      expect(currentCalls).toBe(1);
      expect(lastCalls).toBe(0);
    });
  });

  it("supports codstats_open template switching by tab", async () => {
    await withMcpClient(async ({ client }) => {
      const overview = await client.callTool({
        name: "codstats_open",
        arguments: {
          tab: "overview",
        },
      });

      expect(overview.isError).not.toBe(true);
      expectContractShape(overview.structuredContent, CHATGPT_APP_VIEWS.uiOpen);
      expect(overview.structuredContent.data.uiOutput.templateUri).toBe(TEST_WIDGET_URI);
      expect(overview.structuredContent.data.uiOutput.templateUrl).toBe(TEST_WIDGET_URL);
      expect(overview._meta.codstats.templateName).toBe("widget");

      const rank = await client.callTool({
        name: "codstats_open",
        arguments: {
          tab: "rank",
        },
      });

      expect(rank.isError).not.toBe(true);
      expect(rank.structuredContent.data.tab).toBe("rank");
      expect(rank.structuredContent.data.uiOutput.templateUri).toBe(TEST_WIDGET_URI);
      expect(rank.structuredContent.data.uiOutput.templateUrl).toBe(TEST_WIDGET_URL);
      expect(rank._meta.codstats.templateName).toBe("widget");
      expect(rank.content?.[0]?.text).toBe("CodStats opened.");
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
      expect(result.structuredContent.data.uiOutput.templateUri).toBe(TEST_MATCHES_URI);
      expect(result.structuredContent.data.uiOutput.templateUrl).toBe(TEST_MATCHES_URL);
      expect(result._meta.codstats.templateName).toBe("matches");
      expect(Array.isArray(result._meta.codstats.viewModel.items)).toBe(true);
      expect(result.content?.[0]?.text).toBe("Match history loaded.");
      expect(result.content?.[0]?.text.split("\n").length).toBe(1);
    });
  });

  it("attaches session template metadata for missing last session", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/stats/session/last") {
        return jsonResponse(
          200,
          contractSuccess(CHATGPT_APP_VIEWS.sessionLast, {
            found: false,
          }),
        );
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_last_session",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expectContractShape(result.structuredContent, CHATGPT_APP_VIEWS.sessionLast);
      expect(result.structuredContent.data.found).toBe(false);
      expect(result.structuredContent.data.uiOutput.templateUri).toBe(TEST_SESSION_URI);
      expect(result._meta.codstats.templateName).toBe("session");
      expect(result._meta.codstats.viewModel.source).toBe("last");
      expect(result.content?.[0]?.text).toBe("No completed session found.");
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
            currentSr: 2800,
            current: {
              rank: "Gold",
              division: "II",
              displayName: "Gold II",
              minSr: 2600,
              maxSr: 3099,
            },
            next: {
              rank: "Gold",
              division: "III",
              displayName: "Gold III",
              minSr: 3100,
              maxSr: 3599,
            },
            srToNextTier: 300,
            nextDivision: {
              rank: "Gold",
              division: "III",
              displayName: "Gold III",
              minSr: 3100,
              maxSr: 3599,
              srNeeded: 300,
            },
            nextRank: {
              rank: "Platinum",
              division: "I",
              displayName: "Platinum I",
              minSr: 3600,
              maxSr: 4199,
              srNeeded: 800,
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
      expect(result.structuredContent.data.current.displayName).toBe("Gold II");
      expect(result.structuredContent.data.next.displayName).toBe("Gold III");
      expect(result.structuredContent.data.srToNextTier).toBe(300);
      expect(result.structuredContent.data.nextRank.displayName).toBe("Platinum I");
      expect(result.structuredContent.data.nextRank.srNeeded).toBe(800);
      expect(result.structuredContent.data.uiOutput.templateUri).toBe(TEST_RANK_URI);
      expect(result.structuredContent.data.uiOutput.templateUrl).toBe(TEST_RANK_URL);
      expect(result._meta.codstats.templateName).toBe("rank");
      expect(result._meta.codstats.viewModel.current.rank).toBe("Gold");
      expect(result._meta.codstats.viewModel.next.displayName).toBe("Gold III");
      expect(result._meta.codstats.viewModel.srToNextTier).toBe(300);
      expect(result._meta.codstats.viewModel.srToNextDivision).toBe(300);
      expect(result._meta.codstats.viewModel.srToNextRank).toBe(800);
      expect(typeof result.content?.[0]?.text).toBe("string");
      expect(result.content?.[0]?.text.length).toBeLessThan(80);
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
      expect(result.structuredContent.data.uiOutput.templateUri).toBe(TEST_SETTINGS_URI);
      expect(result.structuredContent.data.uiOutput.templateUrl).toBe(TEST_SETTINGS_URL);
      expect(result._meta.codstats.templateName).toBe("settings");
      expect(result._meta.codstats.viewModel.connectionStatus).toBe("Connected");
      expect(result.content?.[0]?.text).toBe("Settings loaded.");
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

  it("returns neutral internal tool errors with upstream request ids", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input);

      if (url.pathname === "/api/app/profile") {
        return new Response("upstream gateway failure", {
          status: 502,
          headers: {
            "Content-Type": "text/plain",
            "X-Request-Id": "req_upstream_123",
          },
        });
      }

      return jsonResponse(404, contractError(CHATGPT_APP_ERROR_CODES.notFound, "not found"));
    };

    await withMcpClient(async ({ client }) => {
      const result = await client.callTool({
        name: "codstats_get_settings",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent.error.code).toBe(CHATGPT_APP_ERROR_CODES.internal);
      expect(result.structuredContent.error.requestId).toBe("req_upstream_123");
      expect(result.content?.[0]?.text).toBe("CodStats data is temporarily unavailable.");
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

  it("serves template routes as HTML with CSP", async () => {
    const templateRoutes = [
      { name: "widget", handler: getWidgetTemplateRoute },
      { name: "session", handler: getSessionTemplateRoute },
      { name: "matches", handler: getMatchesTemplateRoute },
      { name: "rank", handler: getRankTemplateRoute },
      { name: "settings", handler: getSettingsTemplateRoute },
    ];

    for (const route of templateRoutes) {
      const response = await route.handler();
      const contentType = response.headers.get("content-type") ?? "";
      const csp = response.headers.get("content-security-policy") ?? "";

      expect(response.status).toBe(200);
      expect(contentType.toLowerCase()).toContain("text/html");
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self'");
    }
  });

  it("renders the widget dashboard sections and strict CSP directives", async () => {
    const response = await getWidgetTemplateRoute();
    const html = await response.text();
    const csp = response.headers.get("content-security-policy") ?? "";
    const xFrameOptions = response.headers.get("x-frame-options");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html; charset=utf-8");
    expect(xFrameOptions).toBeNull();
    expect(html).toContain('data-widget-section="current-session"');
    expect(html).toContain('data-widget-section="rank-progress"');
    expect(html).toContain('data-widget-section="recent-matches"');
    expect(html).toContain('data-widget-section="connection"');
    expect(html).toContain('id="widget-session-sr"');
    expect(html).toContain('id="widget-rank-current"');
    expect(html).toContain('id="widget-matches-list"');
    expect(html).toContain('id="widget-connection-status"');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("https://chat.openai.com");
    expect(csp).toContain("https://*.openai.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it("matches template HTML snapshots", () => {
    const templates = ["widget", "session", "matches", "rank", "settings"];

    for (const templateName of templates) {
      const html = renderCodstatsTemplateHtml(templateName, TEST_APP_PUBLIC_ORIGIN);
      expect(html).toContain("codstats-shell");

      if (templateName === "widget") {
        expect(html).toContain("<style>");
        expect(html).not.toContain("/ui/codstats/styles.css");
      } else {
        expect(html).toContain("/ui/codstats/styles.css");
      }

      expect(html).toContain("/ui/codstats/app.js");
      expect(html).toMatchSnapshot(`${templateName}-template`);
    }
  });

  it("serves /mcp without HTML login pages", async () => {
    const response = await getMcpRoute(new Request(`${TEST_ORIGIN}/mcp`));
    const contentType = response.headers.get("content-type") ?? "";

    expect(contentType).not.toContain("text/html");
  });

  it("returns event-stream for /mcp when event-stream is accepted", async () => {
    const initPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "codstats-test-client",
          version: "1.0.0",
        },
      },
    };

    const response = await postMcpRoute(
      new Request(`${TEST_ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initPayload),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")?.toLowerCase()).toContain(
      "text/event-stream",
    );
    expect(response.headers.get("content-type")?.toLowerCase()).not.toContain("text/html");
  });

  it("returns json for /mcp when json-only accept is requested", async () => {
    const initPayload = {
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "codstats-json-client",
          version: "1.0.0",
        },
      },
    };

    const response = await postMcpRoute(
      new Request(`${TEST_ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initPayload),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")?.toLowerCase()).toContain(
      "application/json",
    );
  });
});
