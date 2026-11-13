-- Bell + Study Spaces unread dots: the last message each user has read in each
-- course channel (same idea as study_group_reads and direct_message_reads).
-- Run with: npm run db:migrate
CREATE TABLE channel_reads (
    user_id INT NOT NULL,
    channel_id INT NOT NULL,
    last_read_message_id INT NOT NULL,
    PRIMARY KEY (user_id, channel_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- Messages posted before this feature shouldn't all show up as new:
-- every current course member starts caught up on every channel.
INSERT INTO channel_reads (user_id, channel_id, last_read_message_id)
SELECT course_members.user_id, channels.id, MAX(messages.id)
FROM messages
JOIN channels ON channels.id = messages.channel_id
JOIN course_members ON course_members.course_id = channels.course_id
GROUP BY course_members.user_id, channels.id;
