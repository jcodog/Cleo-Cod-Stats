const DEFAULT_AUTHENTICATED_PATH = "/dashboard"

function isSafeInternalPath(value: string | null | undefined): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"))
}

export function buildProtectedRedirectTarget(
  pathname: string | null,
  search: string
) {
  const resolvedPathname = isSafeInternalPath(pathname)
    ? pathname
    : DEFAULT_AUTHENTICATED_PATH

  return search ? `${resolvedPathname}?${search}` : resolvedPathname
}

export function buildAuthHref(
  authPath: "/sign-in" | "/sign-up",
  redirectTo: string
) {
  const params = new URLSearchParams()

  if (isSafeInternalPath(redirectTo)) {
    params.set("redirect_url", redirectTo)
  }

  const query = params.toString()

  return query ? `${authPath}?${query}` : authPath
}
