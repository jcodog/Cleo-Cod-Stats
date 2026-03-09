import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
  "sync feature flags from vercel",
  { hours: 6 },
  internal.actions.featureFlags.sync.syncFromVercel,
  {}
)

export default crons
