import { defineSchema } from "convex/server";
import { sessions } from "./db/tables/sessions";
import { games } from "./db/tables/games";
import { users } from "./db/tables/users";
import { chatgptAppConnections } from "./db/tables/chatgpt";
import { landingGlobalStats, landingUserStats } from "./db/tables/landingStats";

export default defineSchema({
  sessions,
  games,
  users,
  chatgptAppConnections,
  landingGlobalStats,
  landingUserStats,
});
