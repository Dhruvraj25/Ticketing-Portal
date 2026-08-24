/**
 * Shared navigation active-route helpers.
 *
 * A nav item is considered active when the current pathname is either an
 * exact match for its href or a nested route beneath it. When several items
 * match, the MOST SPECIFIC route wins — e.g. "/dashboard/tickets/new"
 * highlights "Create Ticket" (its dedicated nav item), while
 * "/dashboard/tickets/42" (a dynamic detail route with no nav item of its
 * own) falls back to the parent module "My Tickets" at "/dashboard/tickets".
 *
 * The root dashboard href ("/dashboard") only ever matches exactly, so the
 * Dashboard item never steals the highlight from other modules.
 */

export interface NavHref {
  href: string
  /** When false, the item only highlights on its exact href, not child routes. */
  matchDescendants?: boolean
}

/** Strip any query string so "?status=..." links match on pathname only. */
function hrefBase(href: string): string {
  return href.split('?')[0]
}

export function isRouteActive(pathname: string, href: string, matchDescendants = true): boolean {
  const base = hrefBase(href)
  const path = hrefBase(pathname)
  if (path === base) return true
  if (!matchDescendants || base === '/dashboard') return false
  return path.startsWith(base + '/')
}

/**
 * Returns the href(s) that should be highlighted for the given pathname.
 *
 * Every matching item is a candidate; when more than one item matches (for
 * example the client nav contains both "Create Ticket" at
 * /dashboard/tickets/new and "My Tickets" at /dashboard/tickets), the most
 * specific (longest) matching href wins so a dedicated child page like Create
 * Ticket is highlighted over its parent module. Unknown dynamic routes (e.g.
 * /dashboard/tickets/42) have no dedicated nav item, so only the parent
 * module matches and it is highlighted instead. Two matching hrefs are
 * always prefix-comparable (both are prefixes of the pathname), so "longest
 * href wins" is a well-defined specificity selection.
 */
export function resolveActiveNav(pathname: string, items: NavHref[]): string[] {
  const candidates = items.filter((item) => isRouteActive(pathname, item.href, item.matchDescendants ?? true))
  if (candidates.length === 0) return []
  const winner = candidates.reduce((best, item) =>
    hrefBase(item.href).length > hrefBase(best.href).length ? item : best,
  )
  return [winner.href]
}
