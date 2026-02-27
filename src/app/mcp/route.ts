import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createChatGptAppMcpServer } from "@/lib/server/chatgpt-app-mcp";

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

function internalErrorResponse() {
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
      status: 500,
      headers: {
        ...MCP_CORS_HEADERS,
        "Content-Type": "application/json",
      },
    },
  );
}

async function handleMcpRequest(request: Request) {
  const server = createChatGptAppMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return withCorsHeaders(response);
  } catch (error) {
    console.error("MCP route error", error);
    return internalErrorResponse();
  } finally {
    await Promise.allSettled([transport.close(), server.close()]);
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
