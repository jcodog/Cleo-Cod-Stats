import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const REQUIRED_TOOLS = [
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

const TEMPLATE_URIS = {
  widget: "ui://codstats/widget.html",
  session: "ui://codstats/session.html",
  matches: "ui://codstats/matches.html",
  rank: "ui://codstats/rank.html",
  settings: "ui://codstats/settings.html",
};

const TOOL_TEMPLATE_URIS = {
  codstats_get_current_session: TEMPLATE_URIS.session,
  codstats_get_last_session: TEMPLATE_URIS.session,
  codstats_get_match_history: TEMPLATE_URIS.matches,
  codstats_get_rank_progress: TEMPLATE_URIS.rank,
  codstats_get_settings: TEMPLATE_URIS.settings,
};

function parseArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function parseBaseUrl() {
  const value = parseArgValue("--base-url", "http://localhost:3000");

  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid --base-url value: ${value}`);
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isToolError(result) {
  return result && typeof result === "object" && result.isError === true;
}

function hasOAuthChallenge(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  const meta = result._meta;
  if (!meta || typeof meta !== "object") {
    return false;
  }

  const challenge = meta["mcp/www_authenticate"];
  return Array.isArray(challenge) && challenge.length > 0;
}

async function main() {
  const baseUrl = parseBaseUrl();
  const mcpUrl = new URL("/mcp", baseUrl);

  const bearerToken = process.env.CHATGPT_APP_BEARER_TOKEN?.trim() || null;
  const allowDisconnect = process.env.CHATGPT_APP_ALLOW_DISCONNECT === "true";

  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: bearerToken
      ? {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        }
      : undefined,
  });

  const client = new Client({
    name: "codstats-smoke-test-client",
    version: "1.0.0",
  });

  console.log(`[smoke] Connecting to ${mcpUrl.toString()}`);

  try {
    await client.connect(transport);

    const listed = await client.listTools();
    const toolNames = listed.tools.map((tool) => tool.name);

    for (const tool of REQUIRED_TOOLS) {
      assertCondition(toolNames.includes(tool), `Missing required tool: ${tool}`);
    }

    console.log(`[smoke] tools/list ok (${toolNames.length} tools)`);

    const openResult = await client.callTool({
      name: "codstats_open",
      arguments: {
        tab: "overview",
      },
    });

    assertCondition(!isToolError(openResult), "codstats_open returned error");
    assertCondition(
      openResult.structuredContent?.data?.tab === "overview",
      "codstats_open returned unexpected tab",
    );
    assertCondition(
      openResult.structuredContent?.data?.uiOutput?.templateUri === TEMPLATE_URIS.widget,
      "codstats_open returned unexpected uiOutput.templateUri",
    );

    console.log("[smoke] codstats_open ok");

    const protectedChecks = [
      "codstats_get_current_session",
      "codstats_get_last_session",
      "codstats_get_match_history",
      "codstats_get_rank_ladder",
      "codstats_get_rank_progress",
      "codstats_get_settings",
    ];

    for (const tool of protectedChecks) {
      const result = await client.callTool({
        name: tool,
        arguments: {},
      });

      if (bearerToken) {
        assertCondition(!isToolError(result), `${tool} failed with bearer token`);

        const expectedTemplateUri = TOOL_TEMPLATE_URIS[tool];
        if (expectedTemplateUri) {
          assertCondition(
            result.structuredContent?.data?.uiOutput?.templateUri === expectedTemplateUri,
            `${tool} returned unexpected uiOutput.templateUri`,
          );
        }
      } else {
        assertCondition(isToolError(result), `${tool} should require authentication`);
        assertCondition(
          hasOAuthChallenge(result),
          `${tool} did not return mcp/www_authenticate challenge`,
        );
      }
    }

    console.log(
      bearerToken
        ? "[smoke] protected tools succeeded with bearer token"
        : "[smoke] protected tools correctly returned auth challenge",
    );

    if (bearerToken) {
      const settingsResult = await client.callTool({
        name: "codstats_get_settings",
        arguments: {},
      });

      assertCondition(!isToolError(settingsResult), "codstats_get_settings failed");
      assertCondition(
        settingsResult.structuredContent?.data?.uiOutput?.templateUri === TEMPLATE_URIS.settings,
        "codstats_get_settings returned unexpected uiOutput.templateUri",
      );
    }

    const disconnectResult = await client.callTool({
      name: "codstats_disconnect",
      arguments: {
        confirm: allowDisconnect,
      },
    });

    if (allowDisconnect) {
      assertCondition(bearerToken, "CHATGPT_APP_ALLOW_DISCONNECT=true requires token");
      assertCondition(!isToolError(disconnectResult), "disconnect failed");
      console.log("[smoke] disconnect executed");
    } else {
      assertCondition(
        isToolError(disconnectResult),
        "disconnect without confirmation should return error",
      );
      console.log("[smoke] disconnect confirmation guard ok");
    }

    console.log("[smoke] all checks passed");
  } finally {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

main().catch((error) => {
  console.error(`[smoke] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
