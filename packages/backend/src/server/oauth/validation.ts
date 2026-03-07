const MAX_SCOPE_COUNT = 20;
const MAX_SCOPE_LENGTH = 128;
const SCOPE_PATTERN = /^[A-Za-z0-9._:-]+$/;

export type ScopeValidationResult = {
  scopes: string[];
  scope: string;
};

export function parseScope(scopeValue: string | null): ScopeValidationResult {
  if (scopeValue === null) {
    return { scopes: [], scope: "" };
  }

  const trimmed = scopeValue.trim();
  if (trimmed.length === 0) {
    throw new Error("scope is empty");
  }

  const parsedScopes = trimmed
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parsedScopes.length === 0) {
    throw new Error("scope is empty");
  }

  if (parsedScopes.length > MAX_SCOPE_COUNT) {
    throw new Error("scope has too many items");
  }

  const deduped = new Set<string>();
  for (const scope of parsedScopes) {
    if (scope.length > MAX_SCOPE_LENGTH) {
      throw new Error("scope value too long");
    }

    if (!SCOPE_PATTERN.test(scope)) {
      throw new Error("scope has invalid characters");
    }

    deduped.add(scope);
  }

  const scopes = Array.from(deduped);

  return {
    scopes,
    scope: scopes.join(" "),
  };
}

export function assertScopesAllowed(
  requestedScopes: string[],
  allowedScopes: Set<string> | null,
) {
  if (!allowedScopes) {
    return;
  }

  for (const scope of requestedScopes) {
    if (!allowedScopes.has(scope)) {
      throw new Error(`scope_not_allowed:${scope}`);
    }
  }
}

export function assertScopeSubset(requestedScopes: string[], grantedScopes: string[]) {
  const granted = new Set(grantedScopes);
  for (const scope of requestedScopes) {
    if (!granted.has(scope)) {
      throw new Error(`scope_not_granted:${scope}`);
    }
  }
}
