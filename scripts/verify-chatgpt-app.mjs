import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const WIDGET_RESOURCE_URI = "ui://codstats/widget.html";

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

function isHtmlContentType(contentType) {
  return contentType.toLowerCase().includes("text/html");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const contentType = response.headers.get("content-type") ?? "";

  assertCondition(response.status === 200, `${url.pathname} returned status ${response.status}`);
  assertCondition(
    contentType.toLowerCase().includes("application/json"),
    `${url.pathname} did not return application/json (content-type: ${contentType || "(missing)"})`,
  );
  assertCondition(
    !isHtmlContentType(contentType),
    `${url.pathname} returned HTML content-type`,
  );

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${url.pathname} returned invalid JSON`);
  }

  return payload;
}

async function verifyAuthorizationServerMetadata(baseUrl) {
  const url = new URL("/.well-known/oauth-authorization-server", baseUrl);
  const payload = await fetchJson(url);

  assertCondition(
    typeof payload.issuer === "string" && payload.issuer.length > 0,
    "authorization metadata missing issuer",
  );
  assertCondition(
    typeof payload.authorization_endpoint === "string",
    "authorization metadata missing authorization_endpoint",
  );
  assertCondition(
    typeof payload.token_endpoint === "string",
    "authorization metadata missing token_endpoint",
  );
  assertCondition(
    typeof payload.registration_endpoint === "string",
    "authorization metadata missing registration_endpoint",
  );

  return payload;
}

async function verifyProtectedResourceMetadata(baseUrl, expectedIssuer) {
  const url = new URL("/.well-known/oauth-protected-resource", baseUrl);
  const payload = await fetchJson(url);

  assertCondition(
    Array.isArray(payload.authorization_servers),
    "protected resource metadata missing authorization_servers",
  );

  if (expectedIssuer) {
    assertCondition(
      payload.authorization_servers.includes(expectedIssuer),
      `protected resource metadata does not include issuer ${expectedIssuer}`,
    );
  }

  return payload;
}

async function verifyMcpEndpointIsNotHtml(baseUrl) {
  const url = new URL("/mcp", baseUrl);
  const response = await fetch(url, {
    headers: {
      Accept: "text/event-stream",
    },
  });

  const contentType = response.headers.get("content-type") ?? "";

  assertCondition(response.status !== 404, "/mcp returned 404");
  assertCondition(response.status < 500, `/mcp returned ${response.status}`);
  assertCondition(!isHtmlContentType(contentType), "/mcp returned HTML login content");

  return {
    status: response.status,
    contentType,
  };
}

async function verifyWidgetUiMetadata(baseUrl) {
  const mcpUrl = new URL("/mcp", baseUrl);

  const client = new Client({
    name: "codstats-preflight-client",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(mcpUrl);

  await client.connect(transport);

  try {
    const listedResources = await client.listResources();
    const hasWidgetResource = listedResources.resources.some(
      (resource) => resource.uri === WIDGET_RESOURCE_URI,
    );

    assertCondition(
      hasWidgetResource,
      `MCP resources list does not include ${WIDGET_RESOURCE_URI}`,
    );

    const readResult = await client.readResource({ uri: WIDGET_RESOURCE_URI });
    const widget =
      readResult.contents.find((content) => content.uri === WIDGET_RESOURCE_URI) ??
      readResult.contents[0];

    assertCondition(widget, `MCP readResource returned no content for ${WIDGET_RESOURCE_URI}`);

    const uiMeta = widget._meta?.ui;

    assertCondition(uiMeta && typeof uiMeta === "object", "widget _meta.ui is missing");
    assertCondition(
      typeof uiMeta.domain === "string" && uiMeta.domain.length > 0,
      "widget _meta.ui.domain is missing",
    );
    assertCondition(uiMeta.csp && typeof uiMeta.csp === "object", "widget _meta.ui.csp is missing");

    const csp = uiMeta.csp;
    const cspKeys = [
      "resourceDomains",
      "connectDomains",
      "frameDomains",
      "baseUriDomains",
    ];

    for (const key of cspKeys) {
      assertCondition(Array.isArray(csp[key]), `widget _meta.ui.csp.${key} must be an array`);
    }

    return {
      domain: uiMeta.domain,
    };
  } finally {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runCheck(name, checkFn, failures) {
  try {
    const detail = await checkFn();
    console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
    return;
  } catch (error) {
    const message = formatError(error);
    failures.push({ name, message });
    console.error(`FAIL ${name} - ${message}`);
  }
}

async function main() {
  const baseUrl = parseBaseUrl();
  const failures = [];
  let authorizationMetadata = null;

  console.log(`[verify] Base URL: ${baseUrl.toString()}`);

  await runCheck(
    "OAuth authorization metadata",
    async () => {
      authorizationMetadata = await verifyAuthorizationServerMetadata(baseUrl);
      return `issuer=${authorizationMetadata.issuer}`;
    },
    failures,
  );

  await runCheck(
    "OAuth protected resource metadata",
    async () => {
      const payload = await verifyProtectedResourceMetadata(
        baseUrl,
        authorizationMetadata?.issuer,
      );
      return `resource=${payload.resource}`;
    },
    failures,
  );

  await runCheck(
    "MCP endpoint content type",
    async () => {
      const result = await verifyMcpEndpointIsNotHtml(baseUrl);
      return `status=${result.status} content-type=${result.contentType || "(missing)"}`;
    },
    failures,
  );

  await runCheck(
    "Widget UI metadata",
    async () => {
      const result = await verifyWidgetUiMetadata(baseUrl);
      return `domain=${result.domain}`;
    },
    failures,
  );

  if (failures.length > 0) {
    console.error(`\n[verify] FAILED (${failures.length} check${failures.length === 1 ? "" : "s"})`);
    process.exitCode = 1;
    return;
  }

  console.log("\n[verify] ALL CHECKS PASSED");
}

main().catch((error) => {
  console.error(`[verify] FAILED: ${formatError(error)}`);
  process.exitCode = 1;
});
