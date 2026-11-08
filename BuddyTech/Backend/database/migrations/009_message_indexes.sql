-- Speeds up "newest 200 messages in this channel" (GET /api/channels/:id/messages).
-- direct_messages and study_group_messages already have matching indexes.
-- Run with: npm run db:migrate
CREATE INDEX idx_messages_channel_time ON messages (channel_id, created_at);