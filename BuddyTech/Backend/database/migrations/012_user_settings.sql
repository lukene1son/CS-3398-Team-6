-- Settings page: notification toggles + profile picture.
-- Run with: npm run db:migrate
ALTER TABLE users
    ADD COLUMN email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN assignment_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN avatar_stored_name VARCHAR(64) NULL,   -- random name on disk, never sent to the browser
    ADD COLUMN avatar_mime_type VARCHAR(100) NULL,
    ADD COLUMN name_changed_at TIMESTAMP NULL;   -- last name change; NULL = never changed