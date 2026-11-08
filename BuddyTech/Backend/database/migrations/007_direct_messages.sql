-- One-to-one messages between two connected study partners.
-- Only the sender and receiver can read them (enforced in routes/directMessages.js).
-- Run with: npm run db:migrate
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
