-- Migration 0025: Drop duplicate legacy indexes
DROP INDEX IF EXISTS idx_ticket_assigned_to_id;
DROP INDEX IF EXISTS idx_ticket_assignee_status;
DROP INDEX IF EXISTS idx_ticket_client_id;
DROP INDEX IF EXISTS idx_ticket_client_status;
DROP INDEX IF EXISTS idx_ticket_created_at;
DROP INDEX IF EXISTS idx_ticket_created_at_status;
DROP INDEX IF EXISTS idx_ticket_module_id;
DROP INDEX IF EXISTS idx_ticket_priority;
DROP INDEX IF EXISTS idx_ticket_priority_status;
DROP INDEX IF EXISTS idx_ticket_project_id;
DROP INDEX IF EXISTS idx_ticket_project_status;
DROP INDEX IF EXISTS idx_ticket_status;
DROP INDEX IF EXISTS idx_ticket_updated_at;
-- Project
DROP INDEX IF EXISTS idx_project_client_id;
DROP INDEX IF EXISTS idx_project_manager_id;
DROP INDEX IF EXISTS idx_project_status;
-- Notification
DROP INDEX IF EXISTS idx_notification_user_id;
DROP INDEX IF EXISTS idx_notification_user_unread;
-- Time Log
DROP INDEX IF EXISTS idx_time_log_end_time;
DROP INDEX IF EXISTS idx_time_log_start_time;
DROP INDEX IF EXISTS idx_time_log_ticket_id;
DROP INDEX IF EXISTS idx_time_log_user_id;
DROP INDEX IF EXISTS idx_time_log_user_start;
-- Project Client
DROP INDEX IF EXISTS project_client_project_user_unique;
