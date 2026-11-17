-- Password check before deleting a Study Space (Settings > Spaces Settings > Delete Space).
-- delete_pw_failures:  wrong passwords in a row in the Delete Space window (back to 0 on a right one)
-- delete_locked_until: after 3 wrong ones, deleting spaces is locked until this time (48 hours).
--                      Only deleting spaces is locked; the rest of the account works as normal.
-- Run with: npm run db:migrate
ALTER TABLE users
    ADD COLUMN delete_pw_failures TINYINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN delete_locked_until DATETIME NULL;
