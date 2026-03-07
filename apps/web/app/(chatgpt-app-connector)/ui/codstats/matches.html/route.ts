import { createCodstatsTemplateHtmlResponse } from "@workspace/backend/server/chatgpt-app-ui-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return createCodstatsTemplateHtmlResponse("matches");
}
