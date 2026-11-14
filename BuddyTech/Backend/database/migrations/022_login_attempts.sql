-- Sign-ins held for approval because the account already had an active session.
-- Secrets are stored only as SHA-256 hashes: poll_secret_hash (the waiting device
-- proves it started the attempt) and email_token_hash (the approve/deny email link).
-- An attempt is expired once expires_at has passed; no status change is needed.
-- Run with: npm run db:migrate
CREATE TABLE login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    ip VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    status ENUM('pending', 'approved', 'denied', 'claimed') NOT NULL DEFAULT 'pending',
    poll_secret_hash CHAR(64) NOT NULL,
    email_token_hash CHAR(64) NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    decided_at DATETIME NULL,
    INDEX idx_login_attempts_user (user_id, status, expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
