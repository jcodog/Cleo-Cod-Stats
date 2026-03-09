import { defineSchema } from "convex/server"
import { sessions } from "./db/tables/sessions"
import { games } from "./db/tables/games"
import { users } from "./db/tables/users"
import { chatgptAppConnections } from "./db/tables/chatgpt"
import { oauthAuthCodes, oauthClients, oauthTokens } from "./db/tables/oauth"
import { landingGlobalStats, landingUserStats } from "./db/tables/landingStats"
import { featureFlags } from "./db/tables/featureFlags"
import { billingCustomers } from "./db/tables/billing/customers"
import { billingPlans } from "./db/tables/billing/plans"
import { billingFeatures } from "./db/tables/billing/features"
import { billingPlanFeatures } from "./db/tables/billing/planFeatures"
import { billingSubscriptions } from "./db/tables/billing/subscriptions"
import { billingEntitlements } from "./db/tables/billing/entitlements"
import { staffAuditLogs } from "./db/tables/staffAuditLogs"

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
  billingCustomers,
  billingPlans,
  billingFeatures,
  billingPlanFeatures,
  billingSubscriptions,
  billingEntitlements,
  staffAuditLogs,
})
