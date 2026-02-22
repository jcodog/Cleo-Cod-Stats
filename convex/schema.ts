import { defineSchema } from "convex/server";
import { sessions } from "./db/tables/sessions";
import { games } from "./db/tables/games";
import { users } from "./db/tables/users";
import { chatgptAppConnections } from "./db/tables/chatgpt";

export default defineSchema({
  sessions,
  games,
  users,
  chatgptAppConnections,
});
