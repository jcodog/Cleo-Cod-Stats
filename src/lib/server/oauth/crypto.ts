import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Base64Url(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function generateRandomToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

export function safeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
