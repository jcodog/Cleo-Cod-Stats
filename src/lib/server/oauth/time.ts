const SECOND_IN_MS = 1_000;

export const AUTH_CODE_TTL_SECONDS = 60;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function nowInMs() {
  return Date.now();
}

export function nowInSeconds() {
  return Math.floor(Date.now() / SECOND_IN_MS);
}

export function secondsFromNow(seconds: number) {
  return nowInSeconds() + seconds;
}

export function millisecondsFromNow(seconds: number) {
  return nowInMs() + seconds * SECOND_IN_MS;
}
