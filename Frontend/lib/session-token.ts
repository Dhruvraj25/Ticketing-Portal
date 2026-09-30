// ============================================================================
// Better Auth session cookie → session token (pure — auth-utils + tests)
// ============================================================================
// The session cookie value is `<token>.<signature>`, URL-encoded. The session
// table stores only `<token>`. Plain module — no '@/' imports.
// ============================================================================

export function sessionTokenFromCookieValue(cookieValue: string | null | undefined): string | null {
  if (!cookieValue) return null
  let value = cookieValue.trim()
  try {
    value = decodeURIComponent(value)
  } catch {
    // Malformed encoding — use the raw value.
  }
  const token = value.split('.')[0]?.trim()
  return token ? token : null
}
