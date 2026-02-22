import { timingSafeEqual } from "node:crypto";

const LANDING_METRICS_API_KEY_HEADER = "x-landing-metrics-api-key";

type ApiKeyValidationResult = {
  valid: boolean;
  configured: boolean;
  reason:
    | "ok"
    | "missing_api_key_env"
    | "missing_api_key_header"
    | "invalid_api_key";
};

function getConfiguredApiKey() {
  return process.env.LANDING_METRICS_API_KEY ?? null;
}

function getProvidedApiKey(request: Request) {
  const directHeader = request.headers.get(LANDING_METRICS_API_KEY_HEADER);
  if (directHeader) {
    return directHeader;
  }

  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) {
    return null;
  }

  const bearerPrefix = "Bearer ";
  if (!authorizationHeader.startsWith(bearerPrefix)) {
    return null;
  }

  return authorizationHeader.slice(bearerPrefix.length).trim();
}

function keysEqual(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function shouldRequireLandingMetricsApiKey() {
  return process.env.LANDING_METRICS_REQUIRE_API_KEY === "true";
}

export function validateLandingMetricsApiKey(
  request: Request,
): ApiKeyValidationResult {
  const expectedApiKey = getConfiguredApiKey();
  if (!expectedApiKey) {
    return {
      valid: false,
      configured: false,
      reason: "missing_api_key_env",
    };
  }

  const providedApiKey = getProvidedApiKey(request);
  if (!providedApiKey) {
    return {
      valid: false,
      configured: true,
      reason: "missing_api_key_header",
    };
  }

  if (!keysEqual(expectedApiKey, providedApiKey)) {
    return {
      valid: false,
      configured: true,
      reason: "invalid_api_key",
    };
  }

  return {
    valid: true,
    configured: true,
    reason: "ok",
  };
}

export function getLandingMetricsApiKeyHeaderName() {
  return LANDING_METRICS_API_KEY_HEADER;
}
