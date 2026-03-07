export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createCodstatsTemplateHtmlResponse } from "@workspace/backend/server/chatgpt-app-ui-templates";

export async function GET() {
  return createCodstatsTemplateHtmlResponse("widget");
}
