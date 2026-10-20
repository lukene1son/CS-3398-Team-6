SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'courses', COUNT(*) FROM courses
UNION ALL
SELECT 'course_members', COUNT(*) FROM course_members
UNION ALL
SELECT 'channels', COUNT(*) FROM channels
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'assignments', COUNT(*) FROM assignments
UNION ALL
SELECT 'assignment_progress', COUNT(*) FROM assignment_progress;

SELECT
    u.name AS user_name,
    c.course_code,
    c.course_name,
    cm.role
FROM course_members cm
JOIN users u ON u.id = cm.user_id
JOIN courses c ON c.id = cm.course_id
ORDER BY u.id, c.id;

SELECT
    u.name AS user_name,
    a.id,
    a.title,
    COALESCE(ap.status, 'todo') AS status,
    c.course_code
FROM assignments a
JOIN courses c ON c.id = a.course_id
JOIN course_members cm ON cm.course_id = a.course_id
JOIN users u ON u.id = cm.user_id
LEFT JOIN assignment_progress ap ON ap.assignment_id = a.id AND ap.user_id = u.id
WHERE a.owner_user_id IS NULL OR a.owner_user_id = u.id
ORDER BY u.id, a.due_date;