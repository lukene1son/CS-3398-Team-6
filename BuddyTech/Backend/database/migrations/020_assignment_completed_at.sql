-- When the user marked the assignment done (UTC). NULL = not done, or done before
-- this column existed (treated as on time).
ALTER TABLE assignment_progress
    ADD COLUMN completed_at DATETIME NULL;