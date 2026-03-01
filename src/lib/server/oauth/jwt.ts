import { createHmac } from "node:crypto";

import { safeStringEqual } from "./crypto";
import { nowInSeconds } from "./time";

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

export type OAuthAccessTokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  scope: string;
  jti: string;
};

type VerifyOptions = {
  expectedIssuer: string;
  expectedAudiences: string[];
};

function toBase64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function fromBase64UrlJson<T>(segment: string): T {
  const json = Buffer.from(segment, "base64url").toString("utf8");
  return JSON.parse(json) as T;
}

function signSegment(input: string, secret: string) {
  return createHmac("sha256", secret)
    .update(input, "utf8")
    .digest("base64url");
}

export function signOAuthAccessToken(
  payload: OAuthAccessTokenClaims,
  secret: string,
) {
  const header: JwtHeader = { alg: "HS256", typ: "JWT" };

  const encodedHeader = toBase64UrlJson(header);
  const encodedPayload = toBase64UrlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signSegment(signingInput, secret);

  return `${signingInput}.${signature}`;
}

export function verifyOAuthAccessTokenJwt(
  token: string,
  secret: string,
  options: VerifyOptions,
): OAuthAccessTokenClaims {
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new Error("Malformed JWT");
  }

  const [encodedHeader, encodedPayload, signature] = segments;
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("Malformed JWT");
  }

  const signed = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signSegment(signed, secret);

  if (!safeStringEqual(signature, expectedSignature)) {
    throw new Error("Invalid token signature");
  }

  const header = fromBase64UrlJson<Partial<JwtHeader>>(encodedHeader);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("Unsupported JWT header");
  }

  const payload = fromBase64UrlJson<Partial<OAuthAccessTokenClaims>>(
    encodedPayload,
  );

  if (
    typeof payload.iss !== "string" ||
    typeof payload.aud !== "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.scope !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Invalid JWT payload");
  }

  const claims = payload as OAuthAccessTokenClaims;

  const now = nowInSeconds();

  if (claims.exp <= now) {
    throw new Error("Token expired");
  }

  if (claims.iat > now + 30) {
    throw new Error("Token iat is in the future");
  }

  if (!safeStringEqual(claims.iss, options.expectedIssuer)) {
    throw new Error("Invalid token issuer");
  }

  const expectedAudiences = options.expectedAudiences.filter(
    (audience): audience is string =>
      typeof audience === "string" && audience.length > 0,
  );

  const audienceMatch = expectedAudiences.some((audience) =>
    safeStringEqual(claims.aud, audience),
  );

  if (!audienceMatch) {
    throw new Error("Invalid token audience");
  }

  return claims;
}
