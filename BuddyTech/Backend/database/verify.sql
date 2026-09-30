USE buddytech;

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
SELECT 'assignments', COUNT(*) FROM assignments;

SELECT
    u.name AS user_name,
    c.course_code,
    c.course_name
FROM course_members cm
JOIN users u ON u.id = cm.user_id
JOIN courses c ON c.id = cm.course_id
ORDER BY u.id, c.id;

SELECT
    a.id,
    a.title,
    a.status,
    c.course_code
FROM assignments a
JOIN courses c ON c.id = a.course_id
ORDER BY a.due_date;