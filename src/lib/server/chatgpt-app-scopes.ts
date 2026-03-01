export const CHATGPT_APP_SCOPES = {
  profileRead: "profile.read",
  statsRead: "stats.read",
} as const;

const PROFILE_SCOPES = [CHATGPT_APP_SCOPES.profileRead] as const;
const STATS_SCOPES = [CHATGPT_APP_SCOPES.statsRead] as const;

export const CHATGPT_APP_ROUTE_REQUIRED_SCOPES = {
  profile: PROFILE_SCOPES,
  disconnect: PROFILE_SCOPES,
  sessionCurrent: STATS_SCOPES,
  sessionLast: STATS_SCOPES,
  matches: STATS_SCOPES,
  rankLadder: STATS_SCOPES,
  rankProgress: STATS_SCOPES,
  statsSummary: STATS_SCOPES,
  statsDaily: STATS_SCOPES,
  statsRecent: STATS_SCOPES,
} as const;

const PROFILE_SECURITY_SCHEMES = [{
  type: "oauth2",
  scopes: [CHATGPT_APP_SCOPES.profileRead],
}] as const;

const STATS_SECURITY_SCHEMES = [{
  type: "oauth2",
  scopes: [CHATGPT_APP_SCOPES.statsRead],
}] as const;

export const CHATGPT_APP_TOOL_SECURITY_SCHEMES = {
  profile: PROFILE_SECURITY_SCHEMES,
  disconnect: PROFILE_SECURITY_SCHEMES,
  currentSession: STATS_SECURITY_SCHEMES,
  lastSession: STATS_SECURITY_SCHEMES,
  matchHistory: STATS_SECURITY_SCHEMES,
  matchDetail: STATS_SECURITY_SCHEMES,
  rankLadder: STATS_SECURITY_SCHEMES,
  rankProgress: STATS_SECURITY_SCHEMES,
  statsSummary: STATS_SECURITY_SCHEMES,
  statsDaily: STATS_SECURITY_SCHEMES,
  statsRecent: STATS_SECURITY_SCHEMES,
} as const;
