-- Course roles: each member of a course is a student, ta, or teacher.
-- Only teachers and TAs can post course-wide assignments.
-- Everyone already in a course becomes a student; promote people afterwards, e.g.:
--   UPDATE course_members SET role = 'teacher' WHERE user_id = 3 AND course_id = 1;
-- Run with: npm run db:migrate

ALTER TABLE course_members
    ADD COLUMN role ENUM('student', 'ta', 'teacher') NOT NULL DEFAULT 'student';