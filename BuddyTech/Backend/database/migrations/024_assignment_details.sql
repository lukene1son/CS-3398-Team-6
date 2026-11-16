-- The longer write-up a teacher adds to a task: what it involves, steps, grading notes.
-- Kept apart from description (the short summary every list shows), so lists stay light.
-- Only GET /api/assignments/:id returns it.
ALTER TABLE assignments
    ADD COLUMN details TEXT NULL;
