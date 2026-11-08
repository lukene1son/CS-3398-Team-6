-- Existing deployments created before authentication have demo users with
-- password_hash = NULL after migration 001. Give only the three seeded demo
-- accounts the same documented demo password ("password123") used by seed.sql.
UPDATE users
SET password_hash = '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'
WHERE email IN (
    'student@buddytech.local',
    'partner@buddytech.local',
    'teacher@buddytech.local'
)
AND password_hash IS NULL;
