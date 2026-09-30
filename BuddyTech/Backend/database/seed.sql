USE buddytech;

INSERT INTO users (name, email) VALUES
('Demo Student', 'student@buddytech.local'),
('Study Partner', 'partner@buddytech.local');

INSERT INTO courses (course_code, course_name, professor, university) VALUES
('CS 3398', 'Software Engineering', 'Rui Wang', 'Texas State University'),
('BIO 1330', 'Functional Biology', 'Joel Bergh', 'Texas State University');

INSERT INTO course_members (user_id, course_id) VALUES
(1, 1),
(1, 2),
(2, 1);

INSERT INTO channels (course_id, name) VALUES
(1, 'general'),
(1, 'homework-help'),
(1, 'exam-1'),
(2, 'general');

INSERT INTO messages (channel_id, user_id, content) VALUES
(1, 1, 'Anyone understand the sprint assignment?'),
(1, 2, 'Yeah, I think we just need a basic progress update.'),
(2, 1, 'Has anyone started the homework yet?');

INSERT INTO assignments (course_id, title, description, due_date, status) VALUES
(1, 'Sprint Demo', 'Show current BuddyTech backend progress', '2026-10-01 12:00:00', 'todo'),
(2, 'Week 6 Worksheet', 'Complete metabolism worksheet', '2026-10-02 23:59:00', 'todo');