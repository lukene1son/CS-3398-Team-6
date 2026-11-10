-- Google Calendar sync: one link per user, and which Google event each assignment became.
-- Run with: npm run db:migrate
CREATE TABLE google_calendar_links (
    user_id INT PRIMARY KEY,
    refresh_token_enc TEXT NOT NULL,   -- AES-256-GCM encrypted, never sent to the browser
    calendar_id VARCHAR(255) NULL,     -- the "BuddyTech" calendar; NULL until the first sync
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE google_calendar_events (
    user_id INT NOT NULL,
    assignment_id INT NOT NULL,
    google_event_id VARCHAR(1024) NOT NULL,
    PRIMARY KEY (user_id, assignment_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);