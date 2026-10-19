-- Per-user assignment status + personal tasks.
-- Before: assignments.status was ONE value shared by everyone in the course.
-- After:  each user's status lives in assignment_progress (no row = 'todo'),
--         and assignments.owner_user_id marks a personal task (NULL = whole course).
-- Run with: npm run db:migrate

CREATE TABLE assignment_progress (
    user_id INT NOT NULL,
    assignment_id INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'todo',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, assignment_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

-- Keep anything already marked done / in progress by copying it to every member of that course.
INSERT INTO assignment_progress (user_id, assignment_id, status)
SELECT course_members.user_id, assignments.id, assignments.status
FROM assignments
JOIN course_members ON course_members.course_id = assignments.course_id
WHERE assignments.status IS NOT NULL AND assignments.status <> 'todo';

ALTER TABLE assignments
    ADD COLUMN owner_user_id INT NULL,
    ADD CONSTRAINT fk_assignments_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    DROP COLUMN status;