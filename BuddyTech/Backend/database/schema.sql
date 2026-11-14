CREATE DATABASE IF NOT EXISTS buddytech;
USE buddytech;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS course_members;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS assignment_progress;
DROP TABLE IF EXISTS friend_requests;
DROP TABLE IF EXISTS study_group_messages;
DROP TABLE IF EXISTS study_group_members;
DROP TABLE IF EXISTS study_groups;
DROP TABLE IF EXISTS study_group_invites;
DROP TABLE IF EXISTS direct_messages;
DROP TABLE IF EXISTS course_resources;
DROP TABLE IF EXISTS google_calendar_links;
DROP TABLE IF EXISTS google_calendar_events;
DROP TABLE IF EXISTS study_group_reads;
DROP TABLE IF EXISTS direct_message_reads;
DROP TABLE IF EXISTS channel_reads;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS user_sessions;




SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    google_sub VARCHAR(255) NULL UNIQUE, -- Google account id for "Sign in with Google"
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    assignment_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    avatar_stored_name VARCHAR(64) NULL,
    avatar_mime_type VARCHAR(100) NULL,
    avatar_color VARCHAR(7) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    name_changed_at TIMESTAMP NULL
);

CREATE TABLE courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(50) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    professor VARCHAR(255),
    university VARCHAR(255)
);

CREATE TABLE course_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    course_id INT NOT NULL,
    -- only ta/teacher can post course-wide assignments
    role ENUM('student', 'ta', 'teacher') NOT NULL DEFAULT 'student',
    -- this member's colour for the course ('#16a34a'); NULL = default palette (migration 023)
    color VARCHAR(7) NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (user_id, course_id)
);

CREATE TABLE channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channel_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_messages_channel_time (channel_id, created_at)
);

-- The last message each user has read in each course channel (for the bell).
CREATE TABLE channel_reads (
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    last_read_message_id INT NOT NULL,
    PRIMARY KEY (user_id, channel_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATETIME,
    owner_user_id INT NULL, -- NULL = whole course; set = personal task only this user sees
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_assignments_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Each user's own status for an assignment. No row = 'todo'.
CREATE TABLE assignment_progress (
    user_id INT NOT NULL,
    assignment_id INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'todo',
    completed_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, assignment_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE TABLE friend_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    accept_seen BOOLEAN NOT NULL DEFAULT FALSE, -- has the sender seen that it was accepted?
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (sender_id, receiver_id)
);

CREATE TABLE study_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    meeting_time VARCHAR(100) NULL,
    visibility ENUM('public', 'private') NOT NULL DEFAULT 'public',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE study_group_members (
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE study_group_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    channel ENUM('general', 'homework', 'meetups') NOT NULL DEFAULT 'general',
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_group_channel_time (group_id, channel, created_at)
);

-- The last message each user has read in each study group channel (for the bell).
CREATE TABLE study_group_reads (
    user_id INT NOT NULL,
    group_id INT NOT NULL,
    channel ENUM('general', 'homework', 'meetups') NOT NULL,
    last_read_message_id INT NOT NULL,
    PRIMARY KEY (user_id, group_id, channel),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
);

CREATE TABLE study_group_invites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    inviter_id INT NOT NULL,
    invitee_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (group_id, invitee_id),
    INDEX idx_invitee_status (invitee_id, status)
);

CREATE TABLE direct_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_dm_sender (sender_id, receiver_id, created_at),
    INDEX idx_dm_receiver (receiver_id, sender_id, created_at)
);

-- The last direct message each user has read in each conversation (for the bell).
CREATE TABLE direct_message_reads (
    user_id INT NOT NULL,
    other_user_id INT NOT NULL,
    last_read_message_id INT NOT NULL,
    PRIMARY KEY (user_id, other_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (other_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE course_resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    type ENUM('link', 'file') NOT NULL,
    title VARCHAR(200) NOT NULL,
    url VARCHAR(2048) NULL,          -- links only
    file_name VARCHAR(255) NULL,     -- files only: the name the teacher uploaded
    stored_name VARCHAR(64) NULL,    -- files only: random name on disk, never sent to the browser
    mime_type VARCHAR(100) NULL,
    size_bytes INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_resources_course_time (course_id, created_at)
);

CREATE TABLE google_calendar_links (
    user_id INT PRIMARY KEY,
    refresh_token_enc TEXT NOT NULL,   -- AES-256-GCM encrypted, never sent to the browser
    calendar_id VARCHAR(255) NULL,     -- the "BuddyTech" calendar; NULL until the first sync
    time_zone VARCHAR(64) NULL,        -- browser timezone from the last sync
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

-- Server-side sign-in sessions. Every login token carries its session id (the JWT's
-- "jti"), so the server can tell who is signed in, sign a device out, and refuse a
-- token whose session was revoked. Tokens from before this migration have no jti
-- and stop working, so everyone signs in again once after this is deployed.
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

-- Sign-ins held for approval because the account already had an active session.
-- Secrets are stored only as SHA-256 hashes: poll_secret_hash (the waiting device
-- proves it started the attempt) and email_token_hash (the approve/deny email link).
-- An attempt is expired once expires_at has passed; no status change is needed.
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
