import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth-utils'
import { getReviewAnalytics } from '@/app/actions/reviews'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header-server'
import { StarRatingDisplay, StarRatingNumeric } from '@/components/ui/star-rating'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Star, MessageSquare, TrendingUp, Award, ThumbsUp, AlertTriangle } from 'lucide-react'

function ReviewsAnalyticsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[120px] rounded-xl bg-white dark:bg-slate-900 border border-border p-5 shadow-sm">
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-8 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="h-[300px] rounded-xl bg-white dark:bg-slate-900 border border-border p-5 shadow-sm">
        <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-6 bg-gray-100 dark:bg-slate-800 rounded w-full" />)}</div>
      </div>
    </div>
  )
}

async function ReviewsAnalyticsContent() {
  const user = await getCurrentUser()
  if (user.role !== 'admin' && user.role !== 'project_manager') {
    redirect('/dashboard')
  }

  const analytics = await getReviewAnalytics()

  if (analytics.totalReviews === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Star className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No Reviews Yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Reviews will appear here once clients start providing feedback on closed tickets.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div data-tour="reviews-kpis" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Average Rating</span>
            <Award className="h-5 w-5 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{analytics.averageRating}</span>
            <StarRatingDisplay value={Math.round(analytics.averageRating)} size="md" />
          </div>
        </Card>
        <Card className="p-5 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Reviews</span>
            <MessageSquare className="h-5 w-5 text-blue-500 dark:text-blue-400" />
          </div>
          <span className="text-2xl font-bold text-foreground">{analytics.totalReviews}</span>
        </Card>
        <Card className="p-5 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">5-Star Rate</span>
            <ThumbsUp className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <span className="text-2xl font-bold text-foreground">{analytics.fiveStarPercentage}%</span>
        </Card>
        <Card className="p-5 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">This Month</span>
            <TrendingUp className="h-5 w-5 text-purple-500 dark:text-purple-400" />
          </div>
          <span className="text-2xl font-bold text-foreground">{analytics.monthlyReviewCount}</span>
        </Card>
      </div>

      {/* Rating Distribution + Resolution Satisfaction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-tour="reviews-rating-distribution" className="p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Rating Distribution</h3>
          <div className="space-y-2.5">
            {analytics.ratingDistribution.map((dist: any) => {
              const pct = analytics.totalReviews > 0 ? Math.round((dist.count / analytics.totalReviews) * 100) : 0
              return (
                <div key={dist.rating} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground w-4 text-right">{dist.rating}</span>
                  <StarRatingDisplay value={dist.rating} size="sm" />
                  <div className="flex-1 h-5 bg-muted/30 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', dist.rating >= 4 && 'bg-emerald-400', dist.rating === 3 && 'bg-amber-400', dist.rating <= 2 && 'bg-red-400')} style={{ width: pct + '%' }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">{dist.count}</span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card data-tour="reviews-satisfaction" className="p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Resolution Satisfaction</h3>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl font-bold text-foreground">{analytics.averageResolutionSatisfaction}</span>
            <div className="flex flex-col">
              <StarRatingDisplay value={Math.round(analytics.averageResolutionSatisfaction)} size="md" />
              <span className="text-xs text-muted-foreground mt-0.5">Avg across all categories</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Highest and Lowest Rated Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-tour="reviews-highest-rated" className="p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5" /> Highest Rated Tickets
          </h3>
          <div className="space-y-2">
            {analytics.highestRatedTickets.length > 0 ? analytics.highestRatedTickets.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{t.ticketNumber} - {t.ticketTitle}</p>
                  <p className="text-[11px] text-muted-foreground">{t.clientName} - {format(new Date(t.createdAt), 'MMM d, yyyy')}</p>
                </div>
                <StarRatingNumeric value={Number(t.overallRating)} size="sm" />
              </div>
            )) : <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
          </div>
        </Card>
        <Card data-tour="reviews-lowest-rated" className="p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Lowest Rated Tickets
          </h3>
          <div className="space-y-2">
            {analytics.lowestRatedTickets.length > 0 ? analytics.lowestRatedTickets.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{t.ticketNumber} - {t.ticketTitle}</p>
                  <p className="text-[11px] text-muted-foreground">{t.clientName} - {format(new Date(t.createdAt), 'MMM d, yyyy')}</p>
                </div>
                <StarRatingNumeric value={Number(t.overallRating)} size="sm" />
              </div>
            )) : <p className="text-xs text-muted-foreground text-center py-4">No data</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function ReviewsPage() {
  return (
    <div className="space-y-6">
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <PageHeader
        title="Review Analytics"
        subtitle="Client satisfaction metrics and feedback analysis"
        icon={<Star className="h-5 w-5" />}
        iconVariant="purple"
      />
      </div>
      <Suspense fallback={<ReviewsAnalyticsSkeleton />}>
        <ReviewsAnalyticsContent />
      </Suspense>
    </div>
  )
}
