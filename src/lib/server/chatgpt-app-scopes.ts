export const CHATGPT_APP_SCOPES = {
  profileRead: "profile.read",
  statsRead: "stats.read",
} as const;

export const CHATGPT_APP_ROUTE_REQUIRED_SCOPES = {
  profile: [CHATGPT_APP_SCOPES.profileRead],
  disconnect: [CHATGPT_APP_SCOPES.profileRead],
  statsSummary: [CHATGPT_APP_SCOPES.statsRead],
  statsDaily: [CHATGPT_APP_SCOPES.statsRead],
  statsRecent: [CHATGPT_APP_SCOPES.statsRead],
} as const;

export const CHATGPT_APP_TOOL_SECURITY_SCHEMES = {
  profile: [{ type: "oauth2", scopes: [CHATGPT_APP_SCOPES.profileRead] }],
  disconnect: [{ type: "oauth2", scopes: [CHATGPT_APP_SCOPES.profileRead] }],
  statsSummary: [{ type: "oauth2", scopes: [CHATGPT_APP_SCOPES.statsRead] }],
  statsDaily: [{ type: "oauth2", scopes: [CHATGPT_APP_SCOPES.statsRead] }],
  statsRecent: [{ type: "oauth2", scopes: [CHATGPT_APP_SCOPES.statsRead] }],
} as const;
