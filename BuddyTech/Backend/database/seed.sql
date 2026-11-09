USE buddytech;

-- Every seeded account uses the demo password "password123".
INSERT INTO users (name, email, password_hash) VALUES
('Demo Student', 'student@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner', 'partner@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Demo Teacher', 'teacher@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner1', 'partner1@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner2', 'partner2@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner3', 'partner3@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner4', 'partner4@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner5', 'partner5@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner6', 'partner6@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Study Partner7', 'partner7@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.'),
('Demo Teacher2', 'teacher2@buddytech.local', '$2b$10$4GnVCjS3VnViUaVe.LRsd.q.jVQ7NPeNXlOsSi47lI8v44knm75R.');

INSERT INTO courses (course_code, course_name, professor, university) VALUES
('CS 3398', 'Software Engineering', 'Rui Wang', 'Texas State University'),
('BIO 1330', 'Functional Biology', 'Joel Bergh', 'Texas State University');

 -- Users: 1 Demo Student, 2 Study Partner, 3 Demo Teacher, 4-10 Study Partner1-7, 11 Demo Teacher2.
-- Courses: 1 CS 3398, 2 BIO 1330.
INSERT INTO course_members (user_id, course_id, role) VALUES
(1, 1, 'student'),
(1, 2, 'student'),
(2, 1, 'student'),
(3, 1, 'teacher'),
(4, 1, 'ta'),
(5, 1, 'student'),
(6, 1, 'student'),
(7, 1, 'student'),
(7, 2, 'student'),
(8, 1, 'student'),
(8, 2, 'student'),
(9, 2, 'student'),
(10, 2, 'student'),
(11, 2, 'teacher');

INSERT INTO channels (course_id, name) VALUES
(1, 'general'),
(1, 'homework-help'),
(1, 'exam-1'),
(2, 'general');

INSERT INTO messages (channel_id, user_id, content) VALUES
(1, 1, 'Anyone understand the sprint assignment?'),
(1, 2, 'Yeah, I think we just need a basic progress update.'),
(2, 1, 'Has anyone started the homework yet?');

INSERT INTO assignments (course_id, title, description, due_date) VALUES
(1, 'Sprint Demo', 'Show current BuddyTech backend progress', '2026-10-01 12:00:00'),
(2, 'Week 6 Worksheet', 'Complete metabolism worksheet', '2026-10-02 23:59:00');

-- Demo Student has finished the Sprint Demo; Study Partner (same course) hasn't.
INSERT INTO assignment_progress (user_id, assignment_id, status) VALUES
(1, 1, 'done');

-- Connections, so the Connections tab and the Find Study Partners requests have data:
--   Demo Student <-> Study Partner and Study Partner2 (connected),
--   Study Partner <-> Study Partner2 (connected),
--   Study Partner3 -> Demo Student (incoming request), Demo Student -> Study Partner4 (sent request).
INSERT INTO friend_requests (sender_id, receiver_id, status, responded_at) VALUES
(2, 1, 'accepted', CURRENT_TIMESTAMP),
(1, 5, 'accepted', CURRENT_TIMESTAMP),
(5, 2, 'accepted', CURRENT_TIMESTAMP),
(6, 1, 'pending', NULL),
(1, 7, 'pending', NULL);

-- Groups: 1-3 in CS 3398, 4-5 in BIO 1330. Group 2 is private (invite-only).
INSERT INTO study_groups (course_id, name, meeting_time, created_by, visibility) VALUES
(1, 'CS 3398 Exam Prep', 'Wednesday at 6:00 PM', 1, 'public'),
(1, 'Software Engineering Project Group', NULL, 2, 'private'),
(1, 'Sprint Retro Crew', 'Friday at 3:00 PM', 4, 'public'),
(2, 'BIO 1330 Lab Partners', 'Tuesday at 5:30 PM', 7, 'public'),
(2, 'Metabolism Review', 'Sunday at 2:00 PM', 9, 'public');

-- Exam Prep = Demo Student, Study Partner and Study Partner2.
INSERT INTO study_group_members (group_id, user_id) VALUES
(1, 1),
(1, 2),
(1, 5),
(2, 2),
(2, 4),
(2, 6),
(3, 4),
(3, 5),
(3, 8),
(4, 7),
(4, 9),
(4, 10),
(5, 8),
(5, 9);

-- Two invites waiting for Demo Student under Study Groups -> Invites.
INSERT INTO study_group_invites (group_id, inviter_id, invitee_id) VALUES
(2, 2, 1),
(5, 9, 1);

INSERT INTO study_group_messages (group_id, channel, user_id, content) VALUES
(1, 'general', 1, 'Who wants to go over the exam topics Wednesday?'),
(1, 'general', 2, 'I''m in, bring your notes!'),
(1, 'general', 5, 'Count me in too.'),
(1, 'homework', 5, 'Is problem 3 asking for a sequence diagram or a class diagram?'),
(4, 'general', 7, 'Lab report draft is due Friday, anyone want to compare?');

INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES
(2, 1, 'Hey, are you going to the Exam Prep session?'),
(1, 2, 'Yep, see you Wednesday!');

-- Resources page: links and files the course teachers shared. The PDFs live in
-- database/seed-files and are copied into uploads/ by database/seedFiles.js
-- (db:init and db:ensure run it right after this file).
INSERT INTO course_resources (course_id, uploaded_by, type, title, url, file_name, stored_name, mime_type, size_bytes) VALUES
(1, 3, 'link', 'The Scrum Guide', 'https://scrumguides.org/scrum-guide.html', NULL, NULL, NULL, NULL),
(1, 3, 'link', 'Pro Git (free online book)', 'https://git-scm.com/book/en/v2', NULL, NULL, NULL, NULL),
(1, 3, 'link', 'React: Quick Start', 'https://react.dev/learn', NULL, NULL, NULL, NULL),
(1, 3, 'file', 'Course Welcome Packet', NULL, 'CS 3398 Welcome Packet.pdf', 'seed-cs3398-welcome.pdf', 'application/pdf', 1628),
(1, 3, 'file', 'Hello World (C++)', NULL, 'hello_world.cpp', 'seed-cs3398-hello-world.cpp', 'text/plain', 426),
(1, 3, 'file', 'Hello World (JavaScript)', NULL, 'helloWorld.js', 'seed-cs3398-hello-world.js', 'text/plain', 337),
(2, 11, 'link', 'OpenStax Biology 2e (free textbook)', 'https://openstax.org/details/books/biology-2e', NULL, NULL, NULL, NULL),
(2, 11, 'link', 'Khan Academy: Biology', 'https://www.khanacademy.org/science/biology', NULL, NULL, NULL, NULL),
(2, 11, 'file', 'Lab Safety Guidelines', NULL, 'BIO 1330 Lab Safety Guidelines.pdf', 'seed-bio1330-lab-safety.pdf', 'application/pdf', 1628),
(2, 11, 'file', 'Unit 1 Overview', NULL, 'BIO 1330 Unit 1 Overview.pdf', 'seed-bio1330-unit1-overview.pdf', 'application/pdf', 1616);