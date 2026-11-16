-- How a course assignment counts, set by the teacher or TA who posts it (the Add Task popup):
--   grading:      'graded' or 'participation' (NULL for personal tasks)
--   extra_credit: whether it's extra credit (optional work)
-- Shown on the task's hover card and on the Assignments page.
ALTER TABLE assignments
    ADD COLUMN grading ENUM('graded', 'participation') NULL,
    ADD COLUMN extra_credit BOOLEAN NOT NULL DEFAULT FALSE;
