import { parseUserRole, type UserRole } from "./staffRoles"

let cachedConfigKey: string | null = null
let cachedSuperAdminDiscordIds = new Set<string>()

function normalizeDiscordId(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getSuperAdminConfigKey() {
  return [
    process.env.SUPER_ADMIN_DISCORD_ID ?? "",
    process.env.SUPER_ADMIN_DISCORD_IDS ?? "",
  ].join("|")
}

function getConfiguredSuperAdminDiscordIds() {
  const configKey = getSuperAdminConfigKey()

  if (cachedConfigKey === configKey) {
    return cachedSuperAdminDiscordIds
  }

  cachedConfigKey = configKey
  cachedSuperAdminDiscordIds = new Set(
    configKey
      .split("|")
      .flatMap((value) => value.split(","))
      .map((value) => normalizeDiscordId(value))
      .filter(Boolean)
  )

  return cachedSuperAdminDiscordIds
}

export function isConfiguredSuperAdminDiscordId(
  discordId: string | null | undefined
) {
  const normalizedDiscordId = normalizeDiscordId(discordId)

  if (!normalizedDiscordId) {
    return false
  }

  return getConfiguredSuperAdminDiscordIds().has(normalizedDiscordId)
}

export function resolveConfiguredUserRole(args: {
  discordId?: string | null
  role: UserRole | null
}): UserRole | null {
  if (isConfiguredSuperAdminDiscordId(args.discordId)) {
    return "super_admin"
  }

  if (args.role === "super_admin") {
    return "admin"
  }

  return args.role
}

export function parseAndResolveConfiguredUserRole(args: {
  discordId?: string | null
  roleValue: unknown
}): UserRole | null {
  return resolveConfiguredUserRole({
    discordId: args.discordId,
    role: parseUserRole(args.roleValue),
  })
}
