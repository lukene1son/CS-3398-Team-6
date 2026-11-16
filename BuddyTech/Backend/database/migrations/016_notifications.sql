-- Bell notifications: has the sender seen that their friend request was accepted,
-- and the last message each user has read in each study group channel.
-- Run with: npm run db:migrate
ALTER TABLE friend_requests
    ADD COLUMN accept_seen BOOLEAN NOT NULL DEFAULT FALSE;

-- Friendships made before this feature shouldn't show up as new.
UPDATE friend_requests SET accept_seen = TRUE WHERE status = 'accepted';

CREATE TABLE study_group_reads (
    user_id INT NOT NULL,
    group_id INT NOT NULL,
    channel ENUM('general', 'homework', 'meetups') NOT NULL,
    last_read_message_id INT NOT NULL,
    PRIMARY KEY (user_id, group_id, channel),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
);