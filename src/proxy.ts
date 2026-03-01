import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// ChatGPT App endpoints must not require Clerk session.
export const CHATGPT_APP_PUBLIC_ROUTE_PATTERNS = [
  "/mcp(.*)",
  "/.well-known/oauth-authorization-server(.*)",
  "/.well-known/oauth-protected-resource(.*)",
  "/oauth/authorize(.*)",
  "/oauth/token(.*)",
  "/oauth/revoke(.*)",
  "/oauth/register(.*)",
  "/api/app(.*)",
];

export const PUBLIC_ROUTE_PATTERNS = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/landing-metrics",
  "/debug/chatgpt-app-config(.*)",
  ...CHATGPT_APP_PUBLIC_ROUTE_PATTERNS,
];

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
