import { query } from "../../_generated/server";
import { v } from "convex/values";

const LONDON_TIMEZONE = "Europe/London";

function extractPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  const value = parts.find((part) => part.type === type)?.value;
  return value ? Number(value) : 0;
}

function getLondonDateParts(epochMs: number) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(epochMs));

  return {
    year: extractPart(parts, "year"),
    month: extractPart(parts, "month"),
    day: extractPart(parts, "day"),
  };
}

function getLondonOffsetMs(epochMs: number) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(epochMs));

  const year = extractPart(parts, "year");
  const month = extractPart(parts, "month");
  const day = extractPart(parts, "day");
  const hour = extractPart(parts, "hour");
  const minute = extractPart(parts, "minute");
  const second = extractPart(parts, "second");

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - epochMs;
}

function londonLocalToEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = getLondonOffsetMs(utcGuess);
  return utcGuess - offsetMs;
}

function getDailyWindowMs(nowMs: number) {
  const londonNow = getLondonDateParts(nowMs);
  const londonTodayUtc = new Date(
    Date.UTC(londonNow.year, londonNow.month - 1, londonNow.day),
  );

  const londonYesterdayUtc = new Date(londonTodayUtc.getTime());
  londonYesterdayUtc.setUTCDate(londonYesterdayUtc.getUTCDate() - 1);

  const londonTomorrowUtc = new Date(londonTodayUtc.getTime());
  londonTomorrowUtc.setUTCDate(londonTomorrowUtc.getUTCDate() + 1);

  const todayResetMs = londonLocalToEpochMs(
    londonTodayUtc.getUTCFullYear(),
    londonTodayUtc.getUTCMonth() + 1,
    londonTodayUtc.getUTCDate(),
    17,
    0,
    0,
  );

  if (nowMs >= todayResetMs) {
    return {
      windowStartMs: todayResetMs,
      windowEndMs: londonLocalToEpochMs(
        londonTomorrowUtc.getUTCFullYear(),
        londonTomorrowUtc.getUTCMonth() + 1,
        londonTomorrowUtc.getUTCDate(),
        17,
        0,
        0,
      ),
    };
  }

  return {
    windowStartMs: londonLocalToEpochMs(
      londonYesterdayUtc.getUTCFullYear(),
      londonYesterdayUtc.getUTCMonth() + 1,
      londonYesterdayUtc.getUTCDate(),
      17,
      0,
      0,
    ),
    windowEndMs: todayResetMs,
  };
}

export const getDailyGamesForSession = query({
  args: {
    sessionId: v.string(),
    includeLossProtected: v.boolean(),
  },
  handler: async (ctx, { sessionId, includeLossProtected }) => {
    const { windowStartMs, windowEndMs } = getDailyWindowMs(Date.now());

    const games = await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    const filteredGames = games
      .filter(
        (game) => game.createdAt >= windowStartMs && game.createdAt < windowEndMs,
      )
      .filter((game) => includeLossProtected || game.lossProtected !== true)
      .sort((a, b) => a.createdAt - b.createdAt);

    return filteredGames;
  },
});
