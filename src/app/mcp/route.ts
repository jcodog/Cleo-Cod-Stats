import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createChatGptAppMcpServer } from "@/lib/server/chatgpt-app-mcp";
import { createChatGptAppRequestId } from "@/lib/server/chatgpt-app-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Cache-Control": "no-store",
};

type AcceptState = {
  acceptsEventStream: boolean;
  acceptsJson: boolean;
};

function withCorsHeaders(response: Response) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function internalErrorResponse(requestId: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error",
      },
      id: null,
    }),
    {
      status: 200,
      headers: {
        ...MCP_CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "X-Request-Id": requestId,
      },
    },
  );
}

function parseAcceptState(request: Request): AcceptState {
  const acceptHeader = request.headers.get("accept")?.toLowerCase() ?? "";

  return {
    acceptsEventStream: acceptHeader.includes("text/event-stream"),
    acceptsJson: acceptHeader.includes("application/json"),
  };
}

function normalizeMcpRequestAcceptHeader(request: Request, state: AcceptState) {
  if (request.method !== "POST") {
    return request;
  }

  const headerValues = [request.headers.get("accept")?.trim() ?? ""].filter(
    (value) => value.length > 0,
  );

  if (!state.acceptsJson) {
    headerValues.push("application/json");
  }

  if (!state.acceptsEventStream) {
    headerValues.push("text/event-stream");
  }

  if (headerValues.length === 0) {
    return request;
  }

  const nextHeaders = new Headers(request.headers);
  nextHeaders.set("accept", headerValues.join(", "));

  return new Request(request, {
    headers: nextHeaders,
  });
}

function shouldEnableJsonResponse(request: Request, state: AcceptState) {
  if (request.method !== "POST") {
    return false;
  }

  return state.acceptsJson && !state.acceptsEventStream;
}

async function handleMcpRequest(request: Request) {
  const requestId = createChatGptAppRequestId();
  const acceptState = parseAcceptState(request);
  const normalizedRequest = normalizeMcpRequestAcceptHeader(request, acceptState);
  const server = createChatGptAppMcpServer({
    requestOrigin: new URL(request.url).origin,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: shouldEnableJsonResponse(request, acceptState),
  });
  let shouldCloseImmediately = true;

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(normalizedRequest);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    shouldCloseImmediately = !contentType.includes("text/event-stream");
    return withCorsHeaders(response);
  } catch (error) {
    console.error("MCP route error", {
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      error: error instanceof Error ? error.message : String(error),
    });
    shouldCloseImmediately = true;
    return internalErrorResponse(requestId);
  } finally {
    if (shouldCloseImmediately) {
      await Promise.allSettled([transport.close(), server.close()]);
    }
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: MCP_CORS_HEADERS,
  });
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
