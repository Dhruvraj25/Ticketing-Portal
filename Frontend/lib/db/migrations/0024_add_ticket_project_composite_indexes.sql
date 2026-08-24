-- Migration 0024: Add composite indexes for project-scoped queries
-- 
-- These indexes optimize the two most common GROUP BY / ORDER BY patterns
-- on the ticket table that aren't covered by existing single-column indexes.
-- 
-- ticket_project_status_idx: Speeds up sidebar analytics GROUP BY projectId + status
-- ticket_project_created_at_idx: Speeds up project-scoped ticket listing ORDER BY createdAt

-- Performance benchmark (estimated, for a table with 10,000+ tickets):
-- Without: bitmap combine of projectIdIdx + statusIdx → sort → group → ~200ms
-- With:    single index-only scan → group in order → ~2ms
CREATE INDEX IF NOT EXISTS ticket_project_status_idx ON ticket ("projectId", status);

-- Without: projectIdIdx seek → heap filter by projectId → sort 1000+ rows → ~150ms
-- With:    index seek directly to project's tickets in creation order → ~1ms
CREATE INDEX IF NOT EXISTS ticket_project_created_at_idx ON ticket ("projectId", "createdAt" DESC);
