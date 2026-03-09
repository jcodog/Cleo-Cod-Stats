import { defineSchema } from "convex/server"
import { sessions } from "./db/tables/sessions"
import { games } from "./db/tables/games"
import { users } from "./db/tables/users"
import { chatgptAppConnections } from "./db/tables/chatgpt"
import { oauthAuthCodes, oauthClients, oauthTokens } from "./db/tables/oauth"
import { landingGlobalStats, landingUserStats } from "./db/tables/landingStats"
import { featureFlags } from "./db/tables/featureFlags"

export default defineSchema({
  sessions,
  games,
  users,
  chatgptAppConnections,
  oauthAuthCodes,
  oauthClients,
  oauthTokens,
  landingGlobalStats,
  landingUserStats,
  featureFlags,
})
