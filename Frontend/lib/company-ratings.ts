// ============================================================================
// Company-wise customer ratings (pure aggregation — server report + tests)
// ============================================================================
// Uses the existing rating system unchanged: ticket_review.overall_rating
// (1–5), averaged exactly like the report's "Average Rating" KPI
// (AVG(overall_rating)) — here per company, as sum / count over reviews.
//
// Which company a ticket belongs to:
//   1. the company of the client who RAISED it (ticket.clientId);
//   2. else the company of the ticket project's owner (project.clientId);
//   3. else "No company assigned".
// Companies are identified with lib/company-directory (companyCode, else
// normalized companyName), so the grouping matches the rest of the app.
//
// Plain module (relative import only) so it also runs under `node --test`.
// ============================================================================

import { buildCompanyDirectory, type CompanyDirectoryUser } from './company-directory.ts'

export const UNASSIGNED_COMPANY_KEY = '__none__'
export const UNASSIGNED_COMPANY_NAME = 'No company assigned'

/** Pre-aggregated counts for one (raiser, project owner) pair. */
export interface CompanyRatingGroup {
  raiserId: string | null
  projectOwnerId: string | null
  /** Closed tickets in scope (for the feedback response rate). */
  closedTickets?: number
  /** Closed tickets in scope that have a review. */
  reviewedTickets?: number
  /** Reviews in scope and the sum of their overall ratings. */
  reviews?: number
  ratingSum?: number
  fiveStar?: number
  fourStar?: number
  threeStar?: number
  twoStar?: number
  oneStar?: number
  lastReviewAt?: Date | string | null
}

export interface CompanyRating {
  key: string
  companyName: string
  companyCode: string | null
  closedTickets: number
  reviewedTickets: number
  /** reviewedTickets / closedTickets, as a whole percentage (null when no closed tickets). */
  responseRate: number | null
  reviews: number
  /** Rounded to 1 decimal; null when the company has no reviews yet. */
  averageRating: number | null
  fiveStarCount: number
  fourStarCount: number
  threeStarCount: number
  twoStarCount: number
  oneStarCount: number
  lastReviewAt: string | null
}

/** userId → company, for every client user that belongs to a company. */
export function companyByUserId(users: CompanyDirectoryUser[]) {
  const map = new Map<string, { key: string; companyName: string; companyCode: string | null }>()
  for (const c of buildCompanyDirectory(users)) {
    for (const id of c.clientUserIds) map.set(id, { key: c.key, companyName: c.companyName, companyCode: c.companyCode })
  }
  return map
}

const n = (v: unknown) => Number(v) || 0

function laterIso(a: string | null, b: Date | string | null | undefined): string | null {
  if (!b) return a
  const d = new Date(b)
  if (!Number.isFinite(d.getTime())) return a
  const iso = d.toISOString()
  return !a || iso > a ? iso : a
}

export function aggregateCompanyRatings(users: CompanyDirectoryUser[], groups: CompanyRatingGroup[]): CompanyRating[] {
  const companies = companyByUserId(users)
  const acc = new Map<string, CompanyRating & { ratingSum: number }>()

  for (const g of groups) {
    const company =
      (g.raiserId ? companies.get(g.raiserId) : undefined) ??
      (g.projectOwnerId ? companies.get(g.projectOwnerId) : undefined) ??
      { key: UNASSIGNED_COMPANY_KEY, companyName: UNASSIGNED_COMPANY_NAME, companyCode: null }

    let row = acc.get(company.key)
    if (!row) {
      row = {
        key: company.key, companyName: company.companyName, companyCode: company.companyCode,
        closedTickets: 0, reviewedTickets: 0, responseRate: null, reviews: 0, averageRating: null,
        fiveStarCount: 0, fourStarCount: 0, threeStarCount: 0, twoStarCount: 0, oneStarCount: 0,
        lastReviewAt: null, ratingSum: 0,
      }
      acc.set(company.key, row)
    }
    row.closedTickets += n(g.closedTickets)
    row.reviewedTickets += n(g.reviewedTickets)
    row.reviews += n(g.reviews)
    row.ratingSum += n(g.ratingSum)
    row.fiveStarCount += n(g.fiveStar)
    row.fourStarCount += n(g.fourStar)
    row.threeStarCount += n(g.threeStar)
    row.twoStarCount += n(g.twoStar)
    row.oneStarCount += n(g.oneStar)
    row.lastReviewAt = laterIso(row.lastReviewAt, g.lastReviewAt)
  }

  const result: CompanyRating[] = []
  for (const { ratingSum, ...row } of acc.values()) {
    if (row.closedTickets === 0 && row.reviews === 0) continue
    row.averageRating = row.reviews > 0 ? Math.round((ratingSum / row.reviews) * 10) / 10 : null
    row.responseRate = row.closedTickets > 0 ? Math.round((row.reviewedTickets / row.closedTickets) * 100) : null
    result.push(row)
  }

  // Rated companies first (best average, then most feedback), unrated after,
  // "No company assigned" always last.
  return result.sort((a, b) => {
    const au = a.key === UNASSIGNED_COMPANY_KEY, bu = b.key === UNASSIGNED_COMPANY_KEY
    if (au !== bu) return au ? 1 : -1
    if ((a.averageRating === null) !== (b.averageRating === null)) return a.averageRating === null ? 1 : -1
    return (b.averageRating ?? 0) - (a.averageRating ?? 0) || b.reviews - a.reviews || a.companyName.localeCompare(b.companyName)
  })
}
