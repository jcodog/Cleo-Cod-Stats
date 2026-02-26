This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

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

- `OAUTH_JWT_SECRET`
- `OAUTH_ALLOWED_REDIRECT_URIS` (comma-separated exact allowlist)

Optional env vars:

- `OAUTH_AUDIENCE` (defaults to `OAUTH_RESOURCE`; if set, must match `OAUTH_RESOURCE`)
- `OAUTH_CLIENT_ID` + `OAUTH_CLIENT_SECRET` (set both for static client mode; omit both for dynamic client registration only)
- `OAUTH_RESOURCE` (canonical resource identifier; defaults to request origin)
- `OAUTH_ISSUER` (defaults to request origin)
- `OAUTH_ALLOWED_SCOPES` (comma-separated)
- `OAUTH_RESOURCE_DOCUMENTATION`

Routes:

- `GET /oauth/authorize`
- `POST /oauth/register`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`

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
