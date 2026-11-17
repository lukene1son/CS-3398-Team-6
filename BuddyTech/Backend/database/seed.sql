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

-- Profile pictures for Study Partner1-5. The files are in database/seed-files/avatars
-- and are copied into uploads/avatars by database/seedFiles.js.
UPDATE users SET avatar_stored_name = 'peanut-butter-jelly-time.gif', avatar_mime_type = 'image/gif' WHERE email = 'partner1@buddytech.local';
UPDATE users SET avatar_stored_name = 'tuff-baby.gif', avatar_mime_type = 'image/gif' WHERE email = 'partner2@buddytech.local';
UPDATE users SET avatar_stored_name = 'mandala.gif', avatar_mime_type = 'image/gif' WHERE email = 'partner3@buddytech.local';
UPDATE users SET avatar_stored_name = 'AI-cat.gif', avatar_mime_type = 'image/gif' WHERE email = 'partner4@buddytech.local';
UPDATE users SET avatar_stored_name = 'cat.gif', avatar_mime_type = 'image/gif' WHERE email = 'partner5@buddytech.local';

INSERT INTO courses (course_code, course_name, professor, university, join_code) VALUES
('CS 3398', 'Software Engineering', 'Rui Wang', 'Texas State University', 'CS3398DEMO'),
('BIO 1330', 'Functional Biology', 'Joel Bergh', 'Texas State University', 'BIO1330DEMO');

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

-- CS 3398 #general: an earlier conversation over the past two days (course members only:
-- 1 Demo Student, 2 Study Partner, 3 Demo Teacher, 4 Study Partner1 (TA), 5-8 Study
-- Partner2-5). Dated in the past, so the two messages below stay the newest.
INSERT INTO messages (channel_id, user_id, content, created_at) VALUES
(1, 3, 'Welcome to CS 3398! Use this channel for general questions about the course. The syllabus and welcome packet are under Resources.', NOW() - INTERVAL 2 DAY - INTERVAL 5 HOUR),
(1, 5, 'Hi everyone! Is attendance required for the Friday sessions?', NOW() - INTERVAL 2 DAY - INTERVAL 4 HOUR),
(1, 3, 'Fridays are optional work sessions, but your team should still meet once a week for standup.', NOW() - INTERVAL 2 DAY - INTERVAL 3 HOUR),
(1, 6, 'Does anyone have a team yet? I''m still looking for one.', NOW() - INTERVAL 1 DAY - INTERVAL 9 HOUR),
(1, 7, 'Our team has room for one more. Send me a message!', NOW() - INTERVAL 1 DAY - INTERVAL 8 HOUR),
(1, 4, 'Reminder: office hours are Tuesdays and Thursdays from 2 to 4 PM. Bring your Jira board if you have questions about story points.', NOW() - INTERVAL 1 DAY - INTERVAL 2 HOUR),
(1, 8, 'Are we supposed to use feature branches or can we commit straight to main?', NOW() - INTERVAL 20 HOUR),
(1, 4, 'Feature branches, please. Open a pull request and get at least one teammate to review it before merging.', NOW() - INTERVAL 19 HOUR),
(1, 1, 'Do the unit tests for the lab need to cover every route, or just one?', NOW() - INTERVAL 6 HOUR),
(1, 3, 'Just one route for the lab, but test both a success case and an error case.', NOW() - INTERVAL 5 HOUR),
(1, 2, 'Good to know, thanks!', NOW() - INTERVAL 4 HOUR);

INSERT INTO messages (channel_id, user_id, content) VALUES
(1, 1, 'Anyone understand the sprint assignment?'),
(1, 2, 'Yeah, I think we just need a basic progress update.'),
(2, 1, 'Has anyone started the homework yet?');

INSERT INTO assignments (course_id, title, description, due_date) VALUES
(1, 'Sprint Demo', 'Show current BuddyTech backend progress', '2026-10-01 12:00:00'),
(2, 'Week 6 Worksheet', 'Complete metabolism worksheet', '2026-10-02 23:59:00'),
(1, 'Sprint 3 Retrospective',   'Write up what went well and what to change', TIMESTAMP(CURDATE() - INTERVAL 2 DAY,  '17:00:00')),
(1, 'Code Review: Calendar PR', 'Review a teammate''s pull request',          TIMESTAMP(CURDATE(),                   '14:30:00')),
(1, 'Unit Testing Lab',         'Add tests for one backend route',            TIMESTAMP(CURDATE() + INTERVAL 1 DAY,  '09:30:00')),
(1, 'UML Class Diagram',        'Diagram the BuddyTech data model',           TIMESTAMP(CURDATE() + INTERVAL 3 DAY,  '12:00:00')),
(1, 'Design Patterns Quiz',     'Covers observer, factory, and singleton',    TIMESTAMP(CURDATE() + INTERVAL 3 DAY,  '23:59:00')),
(1, 'REST API Homework',        'Design endpoints for a library system',      TIMESTAMP(CURDATE() + INTERVAL 8 DAY,  '23:59:00')),
(1, 'Peer Evaluation Form',     'Rate each teammate''s contribution',         TIMESTAMP(CURDATE() + INTERVAL 10 DAY, '17:00:00')),
(1, 'Final Project Demo',       'Live demo of BuddyTech to the class',        TIMESTAMP(CURDATE() + INTERVAL 15 DAY, '13:00:00')),
-- BIO 1330
(2, 'Lab Report: Enzyme Activity',   'Write up the catalase lab',             TIMESTAMP(CURDATE() - INTERVAL 1 DAY,  '23:59:00')),
(2, 'Chapter 7 Reading Quiz',        'Online quiz on membranes',              TIMESTAMP(CURDATE() + INTERVAL 1 DAY,  '09:30:00')),
(2, 'Photosynthesis Worksheet',      'Light reactions and the Calvin cycle',  TIMESTAMP(CURDATE() + INTERVAL 2 DAY,  '15:00:00')),
(2, 'Lab Safety Quiz',               'Required before the next lab',          TIMESTAMP(CURDATE() + INTERVAL 4 DAY,  '11:00:00')),
(2, 'Cellular Respiration Homework', 'Problems 1-12',                         TIMESTAMP(CURDATE() + INTERVAL 6 DAY,  '23:59:00')),
(2, 'Midterm Exam 2',                'Chapters 5 through 8',                  TIMESTAMP(CURDATE() + INTERVAL 9 DAY,  '08:00:00')),
(2, 'Genetics Problem Set',          'Punnett squares and pedigrees',         TIMESTAMP(CURDATE() + INTERVAL 12 DAY, '20:00:00')),
(2, 'Lab Practical',                 'Microscope identification stations',    TIMESTAMP(CURDATE() + INTERVAL 15 DAY, '14:30:00'));

-- A packed day for the Planner's stacked-day animation (3+ tasks on a day stack like file
-- folders and spread out on hover): six assignments on Nov 30 2026, three per course, so
-- Demo Student (in both courses) has six that day. A fixed date, unlike the ones above, so the
-- busy day is always the 30th. Added last, so the ids used below (3, 5, 8, 11, 17) don't move.
INSERT INTO assignments (course_id, title, description, due_date) VALUES
(1, 'Sprint 4 Planning',            'Pick the stories your team will take on',  '2026-11-30 09:00:00'),
(1, 'Code Freeze: Final Project',   'Last merge to main before the demo',       '2026-11-30 12:00:00'),
(1, 'Final Project Write-up',       'Two pages on your design and what you learned', '2026-11-30 23:59:00'),
(2, 'Cell Division Quiz',           'Mitosis and meiosis, 15 questions',        '2026-11-30 10:30:00'),
(2, 'Lab 6 Pre-lab Questions',      'Answer before the DNA extraction lab',     '2026-11-30 14:00:00'),
(2, 'Ecology Reading Response',     'One page on chapter 44',                   '2026-11-30 20:00:00');

-- How each assignment counts (shown on hover cards and the Assignments page): graded unless listed.
-- Participation: 4 Code Review: Calendar PR, 9 Peer Evaluation Form, 23 Lab 6 Pre-lab Questions.
-- Extra credit: 7 Design Patterns Quiz (graded), 24 Ecology Reading Response (participation).
UPDATE assignments SET grading = 'graded' WHERE owner_user_id IS NULL;
UPDATE assignments SET grading = 'participation' WHERE id IN (4, 9, 23, 24);
UPDATE assignments SET extra_credit = TRUE WHERE id IN (7, 24);

-- The longer write-ups (assignments.details) for the assignments that also have files and
-- links attached (see the course_resources rows near the end). Ids follow the insert above:
-- 3 Sprint 3 Retrospective, 5 Unit Testing Lab, 8 REST API Homework,
-- 11 Lab Report: Enzyme Activity, 17 Genetics Problem Set.
UPDATE assignments SET details = 'Meet as a team and go over Sprint 3: what went well, what didn''t, and what you''ll change for Sprint 4.\n\nHand in a one-page PDF with:\n1. Three things that went well\n2. Two things to improve, each with an owner\n3. Planned vs. completed story points\n\nGraded with the rubric in this assignment''s folder.' WHERE id = 3;
UPDATE assignments SET details = 'Pick one backend route and write at least five Jest tests for it: the normal case, two bad inputs, and two permission cases (someone who shouldn''t be allowed).\n\nStart from the starter file in this folder. Submit a link to your branch and a screenshot of the passing test run.' WHERE id = 5;
UPDATE assignments SET details = 'Design the REST API for a small library system. You are not building it, only designing the endpoints, status codes, and rules.\n\nThe full requirements and what to hand in are in the homework sheet in this folder.' WHERE id = 8;
UPDATE assignments SET details = 'Write up the catalase lab from Tuesday. Use the class data sheet for your graph (foam height vs. temperature), and follow the template for the sections.\n\nAbout 2 pages. Upload it as a PDF.' WHERE id = 11;
UPDATE assignments SET details = 'Problems 1-15 in the problem set handed out in lab: monohybrid and dihybrid crosses, then pedigrees.\n\nShow every Punnett square. The OpenStax chapter linked here covers everything you need.' WHERE id = 17;


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
UPDATE friend_requests SET accept_seen = TRUE WHERE status = 'accepted';

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

-- Files and links attached to assignments (each shows in a folder named after its
-- assignment on the Resources page, and is deleted with it). Text files are stored as
-- text/plain, the same as uploaded code files, so View shows them in the browser.
-- uploaded_by: 3 Demo Teacher and 4 Study Partner1 (a TA) in CS 3398, 11 Demo Teacher2 in BIO 1330.
INSERT INTO course_resources (course_id, assignment_id, uploaded_by, type, title, url, file_name, stored_name, mime_type, size_bytes) VALUES
(1, 3,  3,  'file', 'Sprint 3 retro rubric', NULL, 'Sprint 3 Retro Rubric.md', 'seed-cs3398-retro-rubric.md', 'text/plain', 519),
(1, 3,  3,  'link', 'The Scrum Guide: Sprint Retrospective', 'https://scrumguides.org/scrum-guide.html#sprint-retrospective', NULL, NULL, NULL, NULL),
(1, 5,  4,  'file', 'Unit test starter file', NULL, 'unit_test_starter.test.js', 'seed-cs3398-unit-test-starter.js', 'text/plain', 684),
(1, 5,  4,  'link', 'Jest: Getting Started', 'https://jestjs.io/docs/getting-started', NULL, NULL, NULL, NULL),
(1, 8,  3,  'file', 'REST API homework sheet', NULL, 'REST API Homework.md', 'seed-cs3398-rest-api-homework.md', 'text/plain', 603),
(1, 8,  3,  'link', 'MDN: HTTP request methods', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods', NULL, NULL, NULL, NULL),
(2, 11, 11, 'file', 'Catalase lab class data', NULL, 'Catalase lab data.csv', 'seed-bio1330-catalase-data.csv', 'text/plain', 129),
(2, 11, 11, 'file', 'Lab report template', NULL, 'Lab Report Template.md', 'seed-bio1330-lab-report-template.md', 'text/plain', 654),
(2, 17, 11, 'link', 'OpenStax Biology 2e: Mendel''s Experiments', 'https://openstax.org/books/biology-2e/pages/12-1-mendels-experiments-and-the-laws-of-probability', NULL, NULL, NULL, NULL);