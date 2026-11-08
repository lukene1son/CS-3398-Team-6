-- Friend requests between users. An accepted request means the two users are friends.
-- Run with: npm run db:migrate
CREATE TABLE friend_requests (
id INT AUTO_INCREMENT PRIMARY KEY,
sender_id INT NOT NULL,
receiver_id INT NOT NULL,
status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
responded_at TIMESTAMP NULL,
FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
UNIQUE (sender_id, receiver_id)
);