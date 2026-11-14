-- Server-side sign-in sessions. Every login token carries its session id (the JWT's
-- "jti"), so the server can tell who is signed in, sign a device out, and refuse a
-- token whose session was revoked. Tokens from before this migration have no jti
-- and stop working, so everyone signs in again once after this is deployed.
-- Run with: npm run db:migrate
CREATE TABLE user_sessions (
    id CHAR(36) PRIMARY KEY,                 -- crypto.randomUUID(), also the JWT's jti
    user_id INT NOT NULL,
    ip VARCHAR(45) NULL,                     -- 45 = longest IPv6 text form
    user_agent VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    INDEX idx_user_sessions_active (user_id, revoked_at, last_seen_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
