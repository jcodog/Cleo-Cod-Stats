import { createCodstatsTemplateHtmlResponse } from "@/lib/server/chatgpt-app-ui-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return createCodstatsTemplateHtmlResponse("settings");
}
