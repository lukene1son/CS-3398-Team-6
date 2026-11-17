-- Join codes for Study Spaces ("Join or create a space" on the dashboard).
-- Anyone signed in can join a space by typing its code. A space's creator gets the code when
-- it's made; every member can see it (GET /api/me/courses) so they can pass it on.
-- Run with: npm run db:migrate
ALTER TABLE courses ADD COLUMN join_code VARCHAR(12) NULL;
ALTER TABLE courses ADD UNIQUE KEY uq_courses_join_code (join_code);

-- Spaces that already exist get a random 8-character code.
UPDATE courses SET join_code = UPPER(SUBSTRING(MD5(CONCAT(id, RAND())), 1, 8)) WHERE join_code IS NULL;
