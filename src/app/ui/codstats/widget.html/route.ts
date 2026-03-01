export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createCodstatsTemplateHtmlResponse } from "@/lib/server/chatgpt-app-ui-templates";

export async function GET() {
  return createCodstatsTemplateHtmlResponse("widget");
}
