-- Public groups show in Discover; private groups are invite-only.
-- Run with: npm run db:migrate
ALTER TABLE study_groups
    ADD COLUMN visibility ENUM('public', 'private') NOT NULL DEFAULT 'public';