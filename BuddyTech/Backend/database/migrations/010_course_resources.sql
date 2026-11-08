-- Links and files teachers share with a course (Resources page).
-- Files live on disk in BuddyTech/Backend/uploads under stored_name; the rest is here.
-- Run with: npm run db:migrate
CREATE TABLE course_resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    uploaded_by INT NOT NULL,
    type ENUM('link', 'file') NOT NULL,
    title VARCHAR(200) NOT NULL,
    url VARCHAR(2048) NULL,          -- links only
    file_name VARCHAR(255) NULL,     -- files only: the name the teacher uploaded
    stored_name VARCHAR(64) NULL,    -- files only: random name on disk, never sent to the browser
    mime_type VARCHAR(100) NULL,
    size_bytes INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_resources_course_time (course_id, created_at)
);