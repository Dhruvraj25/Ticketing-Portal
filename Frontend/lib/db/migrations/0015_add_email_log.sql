CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  html_content TEXT,
  from_address TEXT,
  sent_at TIMESTAMP,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  dedup_key TEXT,
  metadata TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for queue processing: find pending emails that haven't exceeded max retries
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log (status, retry_count, created_at);

-- Index for deduplication: check if same event was recently sent to same recipient
CREATE INDEX IF NOT EXISTS idx_email_log_dedup ON email_log (event_type, recipient_email, created_at);

-- Index for email logs page: show recent emails sorted by creation time
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log (created_at DESC);
