import {
  getCodstatsTemplateResourceUri,
  getCodstatsTemplateUrl,
  type CodstatsTemplateName,
} from "@/lib/server/app-public-origin";
import {
  CHATGPT_APP_VIEWS,
  type ChatGptAppSuccessPayload,
} from "@/lib/server/chatgpt-app-contract";

type ContractSuccess = ChatGptAppSuccessPayload<Record<string, unknown>>;

export type CodstatsToolUiOutput = {
  templateUri: string;
  templateUrl: string;
  kind: "dashboard" | "session" | "matches" | "rank" | "manage_connection";
};

type SessionSource = "current" | "last" | "open";

type SessionViewModel = {
  source: SessionSource;
  active: boolean;
  found: boolean;
  status: "Active" | "Inactive";
  gameTitle: string | null;
  season: number | null;
  srCurrent: number | null;
  srDelta: number | null;
  wins: number | null;
  losses: number | null;
  kd: number | null;
  kills: number | null;
  deaths: number | null;
  bestStreak: number | null;
  startedAt: number | null;
  lastUpdatedAt: number;
  highlights: Array<{
    srDelta: number;
    playedAt: number | null;
    mode: string | null;
    outcome: string | null;
  }>;
};

type MatchesViewModel = {
  items: Array<{
    matchId: string | null;
    mode: string | null;
    map: string | null;
    outcome: string | null;
    srDelta: number | null;
    kills: number | null;
    deaths: number | null;
    kd: number | null;
    playedAt: number | null;
  }>;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  nextCursorHint: string;
};

type RankDivisionViewModel = {
  rank: string;
  division: string | null;
  displayName: string;
  minSr: number;
  maxSr: number | null;
  srNeeded: number | null;
};

type RankViewModel = {
  title: string | null;
  ruleset: string | null;
  currentSr: number | null;
  current: RankDivisionViewModel | null;
  next: RankDivisionViewModel | null;
  nextDivision: RankDivisionViewModel | null;
  nextRank: RankDivisionViewModel | null;
  srToNextTier: number | null;
  srToNextDivision: number | null;
  srToNextRank: number | null;
  progressToNextTier: number | null;
  progressToNextDivision: number | null;
  progressToNextRank: number | null;
};

type SettingsViewModel = {
  connected: boolean;
  chatgptLinked: boolean;
  connectionStatus: "Connected" | "Disconnected";
  name: string;
  plan: string;
  discordIdMasked: string | null;
  lastSyncAt: number | null;
};

type WidgetViewModel = {
  tab: "overview" | "matches" | "rank" | "settings";
  session: {
    srCurrent: number | null;
    srChange: number | null;
    matches: number | null;
    wins: number | null;
    losses: number | null;
    kd: number | null;
    kills: number | null;
    deaths: number | null;
    bestStreak: number | null;
    startedAt: number | null;
  };
  rank: {
    currentRank: string | null;
    currentSr: number | null;
    nextTierTarget: string | null;
    nextDivisionTarget: string | null;
    nextRankTarget: string | null;
    srNeeded: number | null;
  };
  recentMatches: Array<{
    mode: string | null;
    outcome: string | null;
    srDelta: number | null;
    kd: number | null;
    playedAt: number | null;
  }>;
  connection: {
    connected: boolean;
    status: string;
    actionsHint: string;
  };
};

type CodstatsUiViewModel =
  | SessionViewModel
  | MatchesViewModel
  | RankViewModel
  | SettingsViewModel
  | WidgetViewModel;

type CodstatsUiBinding = {
  templateName: CodstatsTemplateName;
  uiOutput: CodstatsToolUiOutput;
  viewModel: CodstatsUiViewModel;
};

type UiMeta = {
  codstats: {
    templateName: CodstatsTemplateName;
    templateUri: string;
    templateUrl: string;
    kind: CodstatsToolUiOutput["kind"];
    viewModel: CodstatsUiViewModel;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asOptionalInteger(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) {
    return null;
  }

  return Math.trunc(parsed);
}

function normalizeTab(value: unknown): WidgetViewModel["tab"] {
  if (value === "matches" || value === "rank" || value === "settings") {
    return value;
  }

  return "overview";
}

function buildCodstatsToolUiOutput(
  templateName: CodstatsTemplateName,
  kind: CodstatsToolUiOutput["kind"],
  requestOrigin?: string,
): CodstatsToolUiOutput {
  return {
    templateUri: getCodstatsTemplateResourceUri(templateName),
    templateUrl: getCodstatsTemplateUrl(templateName, requestOrigin),
    kind,
  };
}

function buildSessionHighlights(sessionRecord: Record<string, unknown>) {
  const highlights: SessionViewModel["highlights"] = [];

  for (const key of ["recentMatches", "recentGames", "matches", "games"]) {
    for (const item of asArray(sessionRecord[key])) {
      const entry = asRecord(item);
      if (!entry) {
        continue;
      }

      const srDelta = asNumber(entry.srDelta) ?? asNumber(entry.srChange) ?? asNumber(entry.delta);

      if (srDelta === null) {
        continue;
      }

      highlights.push({
        srDelta,
        playedAt:
          asNumber(entry.playedAt) ??
          asNumber(entry.createdAt) ??
          asNumber(entry.timestamp) ??
          null,
        mode: asString(entry.mode),
        outcome: asString(entry.outcome),
      });
    }
  }

  if (highlights.length === 0) {
    for (const key of ["recentMatchDeltas", "recentSrDeltas", "highlightDeltas"]) {
      const deltas = asArray(sessionRecord[key])
        .map((value) => asNumber(value))
        .filter((value): value is number => value !== null);

      for (const srDelta of deltas) {
        highlights.push({
          srDelta,
          playedAt: null,
          mode: null,
          outcome: null,
        });
      }
    }
  }

  return highlights
    .sort((left, right) => (right.playedAt ?? 0) - (left.playedAt ?? 0))
    .slice(0, 3);
}

function buildSessionViewModel(payload: ContractSuccess, source: SessionSource): SessionViewModel {
  const data = asRecord(payload.data) ?? {};
  const session = asRecord(data.session);

  const active = source === "current" ? asBoolean(data.active) : false;
  const found = source === "last" ? asBoolean(data.found) : true;
  const shouldRenderSession =
    source === "open" || (source === "current" ? active : source === "last" ? found : true);

  return {
    source,
    active: shouldRenderSession && source !== "last" ? active : false,
    found,
    status: shouldRenderSession && source !== "last" && active ? "Active" : "Inactive",
    gameTitle: session ? asString(session.title) : null,
    season: session ? asOptionalInteger(session.season) : null,
    srCurrent: session ? asNumber(session.srCurrent) : null,
    srDelta: session ? asNumber(session.srChange) : null,
    wins: session ? asOptionalInteger(session.wins) : null,
    losses: session ? asOptionalInteger(session.losses) : null,
    kd: session ? asNumber(session.kd) : null,
    kills: session ? asOptionalInteger(session.kills) : null,
    deaths: session ? asOptionalInteger(session.deaths) : null,
    bestStreak: session ? asOptionalInteger(session.bestStreak) : null,
    startedAt: session ? asNumber(session.startedAt) : null,
    lastUpdatedAt: payload.meta.generatedAt,
    highlights: session ? buildSessionHighlights(session) : [],
  };
}

function buildMatchesViewModel(payload: ContractSuccess): MatchesViewModel {
  const data = asRecord(payload.data) ?? {};
  const items = asArray(data.items)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, 15)
    .map((item) => ({
      matchId: asString(item.matchId),
      mode: asString(item.mode),
      map: asString(item.map),
      outcome: asString(item.outcome),
      srDelta: asNumber(item.srDelta),
      kills: asOptionalInteger(item.kills),
      deaths: asOptionalInteger(item.deaths),
      kd: asNumber(item.kd),
      playedAt: asNumber(item.playedAt),
    }));

  const nextCursor = asString(data.nextCursor);
  const hasMore = asBoolean(data.hasMore) && nextCursor !== null;

  return {
    items,
    limit: asOptionalInteger(data.limit) ?? 15,
    hasMore,
    nextCursor,
    nextCursorHint: hasMore
      ? "Use the Load Next Page action or call codstats_get_match_history with the returned cursor."
      : "No next page available.",
  };
}

function toRankDivisionViewModel(
  value: Record<string, unknown> | null,
  srNeededOverride?: number | null,
): RankDivisionViewModel | null {
  if (!value) {
    return null;
  }

  const rank = asString(value.rank);
  const minSr = asNumber(value.minSr);
  const rawMaxSr = value.maxSr;
  const maxSr = rawMaxSr === null ? null : asNumber(rawMaxSr);

  if (!rank || minSr === null || (rawMaxSr !== null && maxSr === null)) {
    return null;
  }

  const division = asString(value.division);
  const displayName = asString(value.displayName) ?? (division ? `${rank} ${division}` : rank);

  return {
    rank,
    division,
    displayName,
    minSr,
    maxSr,
    srNeeded: srNeededOverride ?? asOptionalInteger(value.srNeeded),
  };
}

function computeProgress(currentSr: number | null, currentMin: number | null, nextMin: number | null) {
  if (currentSr === null || currentMin === null || nextMin === null) {
    return null;
  }

  const span = nextMin - currentMin;
  if (span <= 0) {
    return null;
  }

  const progress = ((currentSr - currentMin) / span) * 100;
  return Math.max(0, Math.min(100, progress));
}

function buildRankViewModel(payload: ContractSuccess): RankViewModel {
  const data = asRecord(payload.data) ?? {};
  const currentSr = asNumber(data.currentSr);
  const current = toRankDivisionViewModel(asRecord(data.current));

  const nextRecord =
    asRecord(data.next) ??
    asRecord(data.nextDivision) ??
    asRecord(data.nextRank);
  const nextDivisionRecord = asRecord(data.nextDivision) ?? nextRecord;
  const nextRankRecord = asRecord(data.nextRank);

  const nextDivisionMinSr = asOptionalInteger(nextDivisionRecord?.minSr);
  const nextRankMinSr = asOptionalInteger(nextRankRecord?.minSr);

  const inferredSrToNextDivision =
    currentSr !== null && nextDivisionMinSr !== null
      ? Math.max(0, nextDivisionMinSr - Math.trunc(currentSr))
      : null;
  const inferredSrToNextRank =
    currentSr !== null && nextRankMinSr !== null
      ? Math.max(0, nextRankMinSr - Math.trunc(currentSr))
      : null;

  const srToNextDivision =
    asOptionalInteger(data.srToNextDivision) ??
    asOptionalInteger(nextDivisionRecord?.srNeeded) ??
    inferredSrToNextDivision;
  const srToNextRank =
    asOptionalInteger(data.srToNextRank) ??
    asOptionalInteger(nextRankRecord?.srNeeded) ??
    inferredSrToNextRank;
  const srToNextTier = asOptionalInteger(data.srToNextTier) ?? srToNextDivision;

  const next = toRankDivisionViewModel(nextRecord, srToNextTier);
  const nextDivision = toRankDivisionViewModel(nextDivisionRecord, srToNextDivision) ?? next;
  const nextRank = toRankDivisionViewModel(nextRankRecord, srToNextRank) ?? nextDivision;

  const progressToNextDivision =
    asNumber(data.progressToNextDivision) ??
    computeProgress(currentSr, current?.minSr ?? null, nextDivision?.minSr ?? null);
  const progressToNextRank =
    asNumber(data.progressToNextRank) ??
    computeProgress(currentSr, current?.minSr ?? null, nextRank?.minSr ?? null);
  const progressToNextTier =
    asNumber(data.progressToNextTier) ??
    progressToNextDivision;

  return {
    title: asString(data.title),
    ruleset: asString(data.ruleset),
    currentSr,
    current,
    next,
    nextDivision,
    nextRank,
    srToNextTier,
    srToNextDivision,
    srToNextRank,
    progressToNextTier,
    progressToNextDivision,
    progressToNextRank,
  };
}

function maskDiscordId(discordId: string) {
  const trimmed = discordId.trim();
  if (trimmed.length <= 4) {
    return "****";
  }

  return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
}

function buildSettingsViewModel(payload: ContractSuccess): SettingsViewModel {
  const data = asRecord(payload.data) ?? {};
  const user = asRecord(data.user) ?? {};

  const connected = asBoolean(data.connected);
  const chatgptLinked = asBoolean(data.chatgptLinked);
  const discordIdMasked =
    asString(user.discordIdMasked) ??
    (asString(user.discordId) ? maskDiscordId(asString(user.discordId) ?? "") : null);

  return {
    connected,
    chatgptLinked,
    connectionStatus: connected ? "Connected" : "Disconnected",
    name: asString(user.name) ?? "CodStats User",
    plan: asString(user.plan) ?? "free",
    discordIdMasked,
    lastSyncAt: asNumber(user.lastSyncAt),
  };
}

function buildWidgetViewModel(payload: ContractSuccess): WidgetViewModel {
  const data = asRecord(payload.data) ?? {};
  const dashboard = asRecord(data.dashboard) ?? {};
  const session = asRecord(dashboard.session) ?? {};
  const rank = asRecord(dashboard.rank) ?? {};
  const connection = asRecord(dashboard.connection) ?? {};

  return {
    tab: normalizeTab(data.tab),
    session: {
      srCurrent: asNumber(session.srCurrent),
      srChange: asNumber(session.srChange),
      matches: asOptionalInteger(session.matches),
      wins: asOptionalInteger(session.wins),
      losses: asOptionalInteger(session.losses),
      kd: asNumber(session.kd),
      kills: asOptionalInteger(session.kills),
      deaths: asOptionalInteger(session.deaths),
      bestStreak: asOptionalInteger(session.bestStreak),
      startedAt: asNumber(session.startedAt),
    },
    rank: {
      currentRank: asString(rank.currentRank),
      currentSr: asNumber(rank.currentSr),
      nextTierTarget: asString(rank.nextTierTarget),
      nextDivisionTarget: asString(rank.nextDivisionTarget),
      nextRankTarget: asString(rank.nextRankTarget),
      srNeeded: asOptionalInteger(rank.srNeeded),
    },
    recentMatches: asArray(dashboard.recentMatches)
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .slice(0, 5)
      .map((entry) => ({
        mode: asString(entry.mode),
        outcome: asString(entry.outcome),
        srDelta: asNumber(entry.srDelta),
        kd: asNumber(entry.kd),
        playedAt: asNumber(entry.playedAt),
      })),
    connection: {
      connected: asBoolean(connection.connected),
      status: asString(connection.status) ?? "Disconnected",
      actionsHint:
        asString(connection.actionsHint) ??
        "Open settings to connect your CodStats account.",
    },
  };
}

function resolveCodstatsUiBinding(
  payload: ContractSuccess,
  requestOrigin?: string,
): CodstatsUiBinding | null {
  if (payload.view === CHATGPT_APP_VIEWS.uiOpen) {
    return {
      templateName: "widget",
      uiOutput: buildCodstatsToolUiOutput("widget", "dashboard", requestOrigin),
      viewModel: buildWidgetViewModel(payload),
    };
  }

  if (payload.view === CHATGPT_APP_VIEWS.sessionCurrent) {
    return {
      templateName: "session",
      uiOutput: buildCodstatsToolUiOutput("session", "session", requestOrigin),
      viewModel: buildSessionViewModel(payload, "current"),
    };
  }

  if (payload.view === CHATGPT_APP_VIEWS.sessionLast) {
    return {
      templateName: "session",
      uiOutput: buildCodstatsToolUiOutput("session", "session", requestOrigin),
      viewModel: buildSessionViewModel(payload, "last"),
    };
  }

  if (payload.view === CHATGPT_APP_VIEWS.matchesHistory) {
    return {
      templateName: "matches",
      uiOutput: buildCodstatsToolUiOutput("matches", "matches", requestOrigin),
      viewModel: buildMatchesViewModel(payload),
    };
  }

  if (payload.view === CHATGPT_APP_VIEWS.rankProgress) {
    return {
      templateName: "rank",
      uiOutput: buildCodstatsToolUiOutput("rank", "rank", requestOrigin),
      viewModel: buildRankViewModel(payload),
    };
  }

  if (payload.view === CHATGPT_APP_VIEWS.settings) {
    return {
      templateName: "settings",
      uiOutput: buildCodstatsToolUiOutput("settings", "manage_connection", requestOrigin),
      viewModel: buildSettingsViewModel(payload),
    };
  }

  return null;
}

export function attachCodstatsUiToPayload(
  payload: ContractSuccess,
  requestOrigin?: string,
): {
  structuredContent: ContractSuccess;
  meta?: UiMeta;
} {
  const binding = resolveCodstatsUiBinding(payload, requestOrigin);

  if (!binding) {
    return {
      structuredContent: payload,
    };
  }

  const payloadData = asRecord(payload.data) ?? {};

  return {
    structuredContent: {
      ...payload,
      data: {
        ...payloadData,
        uiOutput: binding.uiOutput,
      },
    },
    meta: {
      codstats: {
        templateName: binding.templateName,
        templateUri: binding.uiOutput.templateUri,
        templateUrl: binding.uiOutput.templateUrl,
        kind: binding.uiOutput.kind,
        viewModel: binding.viewModel,
      },
    },
  };
}
