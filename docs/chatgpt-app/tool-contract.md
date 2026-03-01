# CodStats ChatGPT App Tool Contract

This document defines the naming rules, input schemas, output payload shapes, UI template contract, and error conventions for the CodStats ChatGPT App tools.

## Goals

- Make tools predictable for the model and easy to test.
- Avoid bundled endpoints that mix concepts (ex: current session + last session).
- Ensure UI templates render consistently when appropriate.
- Stop the model from guessing by providing rank ladder truth and progress calculations.

---

## Naming Convention

All tools follow this prefix:

`codstats_` + verb + noun

Rules:
- Use snake_case.
- Use explicit domain nouns: `session`, `matches`, `rank`, `settings`.
- Prefer `get_` for read tools and `disconnect_` or `revoke_` for destructive actions.
- Never overload meanings. If output differs materially, it must be a separate tool.

### Canonical Tool Names

Core navigation:
- `codstats_open`

Sessions:
- `codstats_get_current_session`
- `codstats_get_last_session`

Matches:
- `codstats_get_match_history`
- `codstats_get_match`

Rank truth:
- `codstats_get_rank_ladder`
- `codstats_get_rank_progress`

Account:
- `codstats_get_settings`
- `codstats_disconnect`

---

## Input Schema Rules

- All tools use explicit schemas.
- No optional fields unless truly optional.
- Pagination uses cursor, not offset.

### Pagination Contract

Input:
- `cursor?: string`
- `limit?: number` (default 15, clamp to 15 max)

Output:
- `items: MatchSummary[]`
- `nextCursor: string | null`
- `hasMore: boolean`

Stable ordering:
- Descending by match end time or createdAt.
- Cursor must represent a stable continuation point.

---

## Output Contract

All tool outputs must include:

1. Human-readable summary (for chat)
2. Structured JSON payload

### Required Shape

```json
{
  "ok": true,
  "view": "session.current | session.last | matches.history | matches.detail | rank.progress | rank.ladder | settings | ui.open",
  "data": {},
  "meta": {
    "generatedAt": 0
  }
}
```

Rules:
- `ok` must be boolean.
- `view` must be explicit.
- `data` must always be an object.
- `meta.generatedAt` must be epoch milliseconds.

---

## Empty States

Example: No active session

```json
{
  "ok": true,
  "view": "session.current",
  "data": { "active": false },
  "meta": { "generatedAt": 1700000000000 }
}
```

---

## Error Contract

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED | NOT_LINKED | NOT_FOUND | VALIDATION | RATE_LIMIT | INTERNAL",
    "message": "Human readable message",
    "requestId": "optional"
  },
  "meta": {
    "generatedAt": 0
  }
}
```

Rules:
- Never return stack traces.
- Use `NOT_LINKED` if user has not linked account.
- Use `UNAUTHORIZED` if access token invalid.

---

## Data Definitions

### SessionSummary

```ts
type SessionSummary = {
  sessionId: string
  title: string
  season: number
  startedAt: number
  endedAt?: number
  srStart?: number
  srCurrent?: number
  srChange?: number
  wins: number
  losses: number
  kd?: number
  kills?: number
  deaths?: number
  bestStreak?: number
  lastMatchAt?: number
}
```

### MatchSummary

```ts
type MatchSummary = {
  matchId: string
  mode: string
  map?: string
  playedAt: number
  outcome: "win" | "loss"
  srDelta?: number
  kills?: number
  deaths?: number
  kd?: number
}
```

### RankLadder

```ts
type RankDivision = {
  rank: string
  division: string | null
  minSr: number
  maxSr: number | null
  index: number
}

type RankLadder = {
  title: string
  ruleset: string
  divisions: RankDivision[]
  updatedAt: number
}
```

### RankProgress

```ts
type RankProgress = {
  title: string
  ruleset: string
  currentSr: number
  current: {
    rank: string
    division: string | null
    displayName: string
    minSr: number
    maxSr: number | null
  }
  next: {
    rank: string
    division: string | null
    displayName: string
    minSr: number
    maxSr: number | null
  } | null
  srToNextTier: number | null
  nextDivision: {
    rank: string
    division: string | null
    displayName: string
    minSr: number
    maxSr: number | null
    srNeeded: number
  } | null
  nextRank: {
    rank: string
    division: string | null
    displayName: string
    minSr: number
    maxSr: number | null
    srNeeded: number
  } | null
}
```

---

## UI Template Contract

Attach template metadata to:

- `codstats_open`
- `codstats_get_current_session`
- `codstats_get_last_session`
- `codstats_get_match_history`
- `codstats_get_rank_progress`
- `codstats_get_settings`

Do not attach template metadata to:

- `codstats_get_match`
- `codstats_get_rank_ladder`
- `codstats_disconnect`

Template mapping:

- `codstats_open` -> descriptor metadata points to `ui://codstats/widget.html`
- `codstats_get_current_session` -> `ui://codstats/session.html`
- `codstats_get_last_session` -> `ui://codstats/session.html`
- `codstats_get_match_history` -> `ui://codstats/matches.html`
- `codstats_get_rank_progress` -> `ui://codstats/rank.html`
- `codstats_get_settings` -> `ui://codstats/settings.html`

Hosted template URLs must use `${APP_PUBLIC_ORIGIN}/ui/codstats/*.html`.

UI hydration rules:

- `structuredContent` remains the canonical contract payload.
- UI-enabled results include `structuredContent.data.uiOutput` with `templateUri`, `templateUrl`, and `kind`.
- Tool fallback `content` must be a single short line.
- Tool result `_meta.codstats.viewModel` contains template-specific UI data for rendering.
- Widgets read data through the Apps SDK bridge (`window.openai.toolOutput` and `window.openai.toolResponseMetadata`).
- `codstats_open` may return session `uiOutput.templateUri` at runtime for `tab=overview` while keeping widget descriptor metadata for compatibility.

---

## Behavioral Guarantees

- Current session tool returns ONLY active session.
- Rank progress tool never guesses thresholds.
- Match history clamps limit to 15 max.
- Linked-account tools return `NOT_LINKED` when appropriate.

---

## Bun Testing Requirement

- Tests must run with bun only.
- Validate:
  - Output contract compliance
  - Pagination correctness
  - Rank progress correctness
  - UI metadata correctness
