-- Each member's own colour for a course (Home cards, Spaces tabs, Calendar), e.g. '#16a34a'.
-- Per member, so every student can pick their own. NULL = default (the app's palette,
-- by the order you joined your courses).
ALTER TABLE course_members ADD COLUMN color VARCHAR(7) NULL;
