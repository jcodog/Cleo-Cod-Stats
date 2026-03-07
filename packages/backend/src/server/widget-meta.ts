type WidgetUiCsp = {
  resourceDomains: string[];
  connectDomains: string[];
  frameDomains: string[];
  baseUriDomains: string[];
};

type WidgetUiMeta = {
  domain: string;
  csp: WidgetUiCsp;
};

const FALLBACK_DOMAIN = "localhost";

let didWarnMissingIssuer = false;
let didWarnMissingProtocol = false;

function createEmptyCsp(): WidgetUiCsp {
  return {
    resourceDomains: [],
    connectDomains: [],
    frameDomains: [],
    baseUriDomains: [],
  };
}

function parseIssuerUrl(rawIssuer: string) {
  const trimmedIssuer = rawIssuer.trim();
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmedIssuer);
  const normalizedIssuer = hasProtocol ? trimmedIssuer : `https://${trimmedIssuer}`;

  if (!hasProtocol && !didWarnMissingProtocol) {
    didWarnMissingProtocol = true;
    console.warn(
      `OAUTH_ISSUER is missing a protocol. Normalizing to ${normalizedIssuer} for widget metadata.`,
    );
  }

  let issuerUrl: URL;
  try {
    issuerUrl = new URL(normalizedIssuer);
  } catch {
    throw new Error(
      `Invalid OAUTH_ISSUER: "${rawIssuer}". Use an absolute URL like https://stats.cleoai.cloud.`,
    );
  }

  if (issuerUrl.protocol !== "https:" && issuerUrl.protocol !== "http:") {
    throw new Error(
      `Unsupported OAUTH_ISSUER protocol: "${issuerUrl.protocol}". Use http:// or https://.`,
    );
  }

  if (!issuerUrl.hostname) {
    throw new Error(
      `Invalid OAUTH_ISSUER: "${rawIssuer}". Include a hostname, for example https://stats.cleoai.cloud.`,
    );
  }

  return issuerUrl;
}

export function resolveWidgetUiMeta(): WidgetUiMeta {
  const csp = createEmptyCsp();
  const rawIssuer = process.env.OAUTH_ISSUER?.trim();

  if (!rawIssuer) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Missing required env var OAUTH_ISSUER. Set OAUTH_ISSUER to your canonical app URL (for example https://stats.cleoai.cloud) so ChatGPT widget ui.domain and ui.csp metadata can be validated.",
      );
    }

    if (!didWarnMissingIssuer) {
      didWarnMissingIssuer = true;
      console.warn(
        "OAUTH_ISSUER is not set. Falling back to ui.domain=localhost and empty widget CSP metadata.",
      );
    }

    return {
      domain: FALLBACK_DOMAIN,
      csp,
    };
  }

  const issuerUrl = parseIssuerUrl(rawIssuer);
  const issuerOrigin = issuerUrl.origin;

  csp.connectDomains.push(issuerOrigin);
  csp.resourceDomains.push(issuerOrigin);

  return {
    domain: issuerUrl.hostname,
    csp,
  };
}
