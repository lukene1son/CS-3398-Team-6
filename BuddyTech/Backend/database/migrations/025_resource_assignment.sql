-- A resource can belong to an assignment; the Resources page shows those in a folder
-- named after it. Deleting the assignment deletes its resources too, so nothing (AI
-- features included) can turn up material for an assignment that no longer exists.
-- The files on disk are removed by DELETE /api/assignments/:id; MySQL can't do that.
ALTER TABLE course_resources
    ADD COLUMN assignment_id INT NULL,
    ADD CONSTRAINT fk_resources_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    ADD INDEX idx_resources_assignment (assignment_id);
