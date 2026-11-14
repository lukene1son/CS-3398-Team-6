-- The browser timezone from the user's last sync, so new assignments can be
-- pushed to Google Calendar without the browser. NULL until the first sync.
-- Run with: npm run db:migrate
ALTER TABLE google_calendar_links
    ADD COLUMN time_zone VARCHAR(64) NULL;