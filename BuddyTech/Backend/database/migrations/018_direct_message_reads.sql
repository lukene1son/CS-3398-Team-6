-- Bell + Study Chats unread dots: the last direct message each user has read
-- in each conversation (other_user_id = the person they're chatting with).
-- Run with: npm run db:migrate
CREATE TABLE direct_message_reads (
    user_id INT NOT NULL,
    other_user_id INT NOT NULL,
    last_read_message_id INT NOT NULL,
    PRIMARY KEY (user_id, other_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (other_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Messages sent before this feature shouldn't all show up as new.
INSERT INTO direct_message_reads (user_id, other_user_id, last_read_message_id)
SELECT receiver_id, sender_id, MAX(id)
FROM direct_messages
GROUP BY receiver_id, sender_id;
