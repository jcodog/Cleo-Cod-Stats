## Getting Started

From the monorepo root, run the web app development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun run dev
```

Run Convex separately in another terminal:

```bash
bun run convex:dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Billing environment

Stripe billing requires server-side keys, a publishable key for Elements, and a
server-enforced checkout flag.

Example configuration:

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_replace_me
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
```

Operational notes:

- The authenticated `/checkout` page, billing API routes, and billing mutations are all gated by the `checkout` flag in `apps/web/lib/flags.ts`.
- Enable or disable `checkout` in the existing Vercel Flags / OpenFeature setup before exposing checkout to users.
- Keep the Convex `featureFlags` record for `checkout` aligned with the Vercel flag so direct billing actions and webhook-driven billing flows follow the same rollout state.
- Point Stripe webhook delivery at the Convex HTTP endpoint `/stripe-webhook` and use the matching `STRIPE_WEBHOOK_SECRET`.

## Type checking with tsgo

This project uses TypeScript Native Preview (`@typescript/native-preview`) for CLI type-checking.

- Run `bun run typecheck` (or `npm run typecheck`) to type-check with `tsgo`.
- The `build` script runs `tsgo` before `next build`.
- `typescript` is removed from direct devDependencies; `tsgo` is the project type-check CLI.

If you want editor support in VS Code, install **TypeScript (Native Preview)** and enable:

```json
"typescript.experimental.useTsgo": true
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## OAuth endpoints for ChatGPT App

Required env vars:

- `APP_PUBLIC_ORIGIN` (canonical HTTPS app origin used for MCP template URLs and UI metadata)
- `OAUTH_JWT_SECRET`
- `OAUTH_ALLOWED_REDIRECT_URIS` (comma-separated exact allowlist)
- `OAUTH_ISSUER` (canonical HTTPS app origin; discovery `issuer` must match this exactly)

Optional env vars:

- `OAUTH_AUDIENCE` (defaults to `OAUTH_RESOURCE`; if set, must match `OAUTH_RESOURCE`)
- `OAUTH_CLIENT_ID` + `OAUTH_CLIENT_SECRET` (set both for static client mode; omit both for dynamic client registration only)
- `OAUTH_RESOURCE` (canonical resource identifier; defaults to `OAUTH_ISSUER`)
- `OAUTH_ALLOWED_SCOPES` (comma-separated allowlist, e.g. `profile.read,stats.read`; if set, must include enforced app scopes)
- `OAUTH_RESOURCE_DOCUMENTATION`

Routes:

- `GET /oauth/authorize`
- `POST /oauth/register`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`

Account settings linking:

- Set `NEXT_PUBLIC_CHATGPT_APP_CONNECT_URL` to your ChatGPT app URL so linking is initiated in ChatGPT.
- OAuth starts when the user invokes a protected tool in ChatGPT (ChatGPT initiates PKCE + state).

Minimum scopes by App API endpoint:

- `GET /api/app/profile` -> `profile.read`
- `POST /api/app/disconnect` -> `profile.read`
- `GET /api/app/stats/session/current` -> `stats.read`
- `GET /api/app/stats/session/last` -> `stats.read`
- `GET /api/app/stats/matches` -> `stats.read`
- `GET /api/app/stats/matches/:id` -> `stats.read`
- `GET /api/app/stats/rank/ladder` -> `stats.read`
- `GET /api/app/stats/rank/progress` -> `stats.read`
- `GET /api/app/stats/summary` -> `stats.read`
- `GET /api/app/stats/daily` -> `stats.read`
- `GET /api/app/stats/recent` -> `stats.read`

Discovery metadata scope behavior:

- `scopes_supported` includes enforced app scopes (`profile.read`, `stats.read`).
- `offline_access` is included because refresh tokens are supported.

Source of truth for route scopes and MCP `securitySchemes` mapping:

- `src/lib/server/chatgpt-app-scopes.ts`

Example authorize URL:

```text
https://your-app.example.com/oauth/authorize?response_type=code&client_id=cleo-chatgpt-app&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect&scope=stats.read&state=7f9cb3ea2e6f4f2f8c8d4df83947dca1&resource=https%3A%2F%2Fyour-app.example.com&code_challenge=4h9u8hdW4XUrpQy6b-0YjXwM0B0uHhPwV6nW5zJ5lM0&code_challenge_method=S256
```

Example dynamic client registration:

```bash
curl -X POST "https://your-app.example.com/oauth/register" \
  -H "Content-Type: application/json" \
  --data '{
    "redirect_uris": [
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://platform.openai.com/apps-manage/oauth"
    ],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

Example authorization code exchange:

```bash
curl -X POST "https://your-app.example.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=<authorization_code>" \
  --data-urlencode "redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect" \
  --data-urlencode "resource=https://your-app.example.com" \
  --data-urlencode "code_verifier=<pkce_code_verifier>"
```

If your registered client uses `token_endpoint_auth_method=none`, omit basic auth and pass only `client_id`:

```bash
curl -X POST "https://your-app.example.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "client_id=<dynamic_client_id>" \
  --data-urlencode "code=<authorization_code>" \
  --data-urlencode "redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect" \
  --data-urlencode "resource=https://your-app.example.com" \
  --data-urlencode "code_verifier=<pkce_code_verifier>"
```

## ChatGPT App (Apps SDK)

The MCP endpoint is served at:

- `https://<your-host>/mcp`

Tools exposed by the connector:

- `codstats_open` (opens the app shell, routes by selected tab)
- `codstats_get_current_session` (loads current session stats)
- `codstats_get_last_session` (loads the most recent completed session)
- `codstats_get_match_history` (loads recent matches with pagination cursor)
- `codstats_get_match` (loads one match by match id)
- `codstats_get_rank_ladder` (loads explicit SR ladder ranges)
- `codstats_get_rank_progress` (loads rank and SR progress)
- `codstats_get_settings` (loads connected user details)
- `codstats_disconnect` (revokes the current app connection)

### ChatGPT App UI Verification

The Apps SDK verifier requires resource metadata for every registered UI template:

- `ui://codstats/widget.html`
- `ui://codstats/session.html`
- `ui://codstats/matches.html`
- `ui://codstats/rank.html`
- `ui://codstats/settings.html`

- `ui.domain` is set to the `APP_PUBLIC_ORIGIN` origin.
- `ui.csp` is a minimal allowlist object:
  - `connectDomains` includes the `APP_PUBLIC_ORIGIN` origin.
  - `resourceDomains` includes the `APP_PUBLIC_ORIGIN` origin.
  - `baseUriDomains` includes the `APP_PUBLIC_ORIGIN` origin.
  - `frameDomains` remains an empty array.

Set `APP_PUBLIC_ORIGIN` and `OAUTH_ISSUER` to your canonical app URL (for example `https://stats-dev.cleoai.cloud` or `https://stats.cleoai.cloud`). These values should match in normal deployments.

### Public endpoint checks

ChatGPT App endpoints must stay publicly reachable (no Clerk sign-in redirect and no HTML login page).

- `/api/app/*` routes are protected by OAuth bearer token validation (WWW-Authenticate), not Clerk session middleware.

```bash
curl -i https://<domain>/.well-known/oauth-authorization-server
curl -i https://<domain>/.well-known/oauth-protected-resource
curl -i https://<domain>/mcp
```

Each response should be JSON (or MCP protocol output), not `text/html`.

Verify discovery issuer consistency (`issuer` must exactly equal `OAUTH_ISSUER`):

```bash
curl -s https://<domain>/.well-known/oauth-authorization-server | jq '.issuer, .authorization_endpoint, .token_endpoint, .registration_endpoint'
curl -s https://<domain>/.well-known/oauth-protected-resource | jq '.authorization_servers[0], .resource'
```

Expected: `.issuer` and `.authorization_servers[0]` are exactly your configured `OAUTH_ISSUER`.

### Preflight check before ChatGPT verifier

Use these checks before clicking ChatGPT "Create app":

1. Development diagnostics endpoint (disabled in production):

```bash
curl -s https://<domain>/debug/chatgpt-app-config | jq
```

Expected fields: `oauthIssuer`, `widgetDomain`, `widgetCsp`, `discoveryUrls`, `mcpUrl`.

2. Automated preflight script:

```bash
bun run verify:chatgpt-app -- --base-url https://<domain>
```

The script prints `PASS`/`FAIL` lines for discovery metadata, MCP content-type safety, template HTML route safety, and tool-template metadata wiring.

### Run locally

1. Start your app with `bun run dev`.
2. Expose port 3000 over HTTPS (for example, `ngrok http 3000`).
3. In ChatGPT, enable developer mode: `Settings -> Apps & Connectors -> Advanced settings -> Developer mode`.
4. Create a connector with URL `https://<your-public-host>/mcp`.
5. Start a new chat, enable your connector, and prompt: `Open CodStats dashboard`.

### What to verify in developer mode

- `codstats_open` with tab `overview` returns session template metadata and a session-style view model.
- Session actions call:
  - `GET /api/app/stats/session/current`
  - `GET /api/app/stats/session/last`
- Match actions call:
  - `GET /api/app/stats/matches`
  - `GET /api/app/stats/matches/:id` (detail lookups)
- Rank actions call:
  - `GET /api/app/stats/rank/progress`
  - `GET /api/app/stats/rank/ladder`
- Settings and disconnect call:
  - `GET /api/app/profile`
  - `POST /api/app/disconnect`
- Loading and error states appear correctly when requests are pending or fail.

### Local automated test

- Run all ChatGPT app tests:
  - `bun run test:app`
- Run API route tests only:
  - `bun run test:app:api`
- Run debug route tests only:
  - `bun run test:app:debug`
- Run OAuth endpoint tests only:
  - `bun run test:app:oauth`
- Run MCP server/tool tests only:
  - `bun run test:app:mcp`

### Smoke test against running server

- Start the app locally (`bun run dev`) and expose HTTPS.
- Run smoke checks:
  - `bun run test:app:smoke -- --base-url https://<your-public-host>`
- Optional authenticated smoke mode:
  - `CHATGPT_APP_BEARER_TOKEN=<access_token> bun run test:app:smoke -- --base-url https://<your-public-host>`
- Optional destructive disconnect validation (disabled by default):
  - `CHATGPT_APP_BEARER_TOKEN=<access_token> CHATGPT_APP_ALLOW_DISCONNECT=true bun run test:app:smoke -- --base-url https://<your-public-host>`
