const PRODUCTION_APP_HOSTNAMES = new Set([
  "stats.cleoai.cloud",
  "stats-dev.cleoai.cloud",
]);

const CODSTATS_TEMPLATE_PATHS = {
  widget: "/ui/codstats/widget.html",
  session: "/ui/codstats/session.html",
  matches: "/ui/codstats/matches.html",
  rank: "/ui/codstats/rank.html",
  settings: "/ui/codstats/settings.html",
} as const;

export const CODSTATS_TEMPLATE_URIS = {
  widget: "ui://codstats/widget.html",
  session: "ui://codstats/session.html",
  matches: "ui://codstats/matches.html",
  rank: "ui://codstats/rank.html",
  settings: "ui://codstats/settings.html",
} as const;

export type CodstatsTemplateName = keyof typeof CODSTATS_TEMPLATE_PATHS;

type RequestOriginInput = Request | URL | string | null | undefined;

function parseOriginOrThrow(rawOrigin: string, fieldName: string) {
  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(rawOrigin);
  } catch {
    throw new Error(
      `Invalid ${fieldName}: "${rawOrigin}". Use an absolute HTTPS URL like https://stats.cleoai.cloud.`,
    );
  }

  if (parsedOrigin.protocol !== "https:") {
    throw new Error(
      `${fieldName} must use https://. Received protocol "${parsedOrigin.protocol}".`,
    );
  }

  if (!parsedOrigin.hostname) {
    throw new Error(
      `Invalid ${fieldName}: "${rawOrigin}". Include a hostname, for example https://stats.cleoai.cloud.`,
    );
  }

  return parsedOrigin;
}

function normalizeRequestOrigin(input: RequestOriginInput) {
  if (!input) {
    return null;
  }

  if (typeof input === "string") {
    return parseOriginOrThrow(input, "request origin").origin;
  }

  if (input instanceof URL) {
    return input.origin;
  }

  return new URL(input.url).origin;
}

export function getAppPublicOrigin(requestOriginInput?: RequestOriginInput) {
  const rawOrigin = process.env.APP_PUBLIC_ORIGIN?.trim();

  if (!rawOrigin) {
    throw new Error(
      "Missing required env var APP_PUBLIC_ORIGIN. Set it to your canonical HTTPS app origin.",
    );
  }

  const parsedOrigin = parseOriginOrThrow(rawOrigin, "APP_PUBLIC_ORIGIN");
  const requestOrigin = normalizeRequestOrigin(requestOriginInput);

  if (process.env.NODE_ENV === "production") {
    if (!PRODUCTION_APP_HOSTNAMES.has(parsedOrigin.hostname)) {
      throw new Error(
        `APP_PUBLIC_ORIGIN must use one of ${Array.from(PRODUCTION_APP_HOSTNAMES).join(", ")} in production. Received "${parsedOrigin.hostname}".`,
      );
    }

    if (requestOrigin && requestOrigin !== parsedOrigin.origin) {
      throw new Error(
        `Request origin ${requestOrigin} does not match APP_PUBLIC_ORIGIN ${parsedOrigin.origin}.`,
      );
    }
  }

  return parsedOrigin.origin;
}

export function getCodstatsTemplateResourceUri(templateName: CodstatsTemplateName) {
  return CODSTATS_TEMPLATE_URIS[templateName];
}

export function getCodstatsTemplateUrl(
  templateName: CodstatsTemplateName,
  requestOriginInput?: RequestOriginInput,
) {
  return `${getAppPublicOrigin(requestOriginInput)}${CODSTATS_TEMPLATE_PATHS[templateName]}`;
}

export function getCodstatsTemplateUrls(requestOriginInput?: RequestOriginInput) {
  return {
    widget: getCodstatsTemplateUrl("widget", requestOriginInput),
    session: getCodstatsTemplateUrl("session", requestOriginInput),
    matches: getCodstatsTemplateUrl("matches", requestOriginInput),
    rank: getCodstatsTemplateUrl("rank", requestOriginInput),
    settings: getCodstatsTemplateUrl("settings", requestOriginInput),
  };
}

export function getCodstatsWidgetTemplateUrl(requestOriginInput?: RequestOriginInput) {
  return getCodstatsTemplateUrl("widget", requestOriginInput);
}
