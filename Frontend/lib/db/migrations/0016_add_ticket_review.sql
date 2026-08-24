CREATE TABLE IF NOT EXISTS ticket_review (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES ticket(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  assigned_to_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES project(id) ON DELETE SET NULL,
  overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  resolution_rating INTEGER CHECK (resolution_rating >= 1 AND resolution_rating <= 5),
  response_time_rating INTEGER CHECK (response_time_rating >= 1 AND response_time_rating <= 5),
  technical_rating INTEGER CHECK (technical_rating >= 1 AND technical_rating <= 5),
  review_comment TEXT,
  suggestions TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for fetching review by ticket (unique, already covered by UNIQUE constraint)
CREATE INDEX IF NOT EXISTS idx_ticket_review_client ON ticket_review (client_id);
CREATE INDEX IF NOT EXISTS idx_ticket_review_resource ON ticket_review (assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_ticket_review_project ON ticket_review (project_id);
CREATE INDEX IF NOT EXISTS idx_ticket_review_rating ON ticket_review (overall_rating);
CREATE INDEX IF NOT EXISTS idx_ticket_review_created ON ticket_review (created_at DESC);
