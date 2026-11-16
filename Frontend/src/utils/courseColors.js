// One colour per course: the Home Study Spaces cards, Recent Activity placards, the
// Spaces course tabs, and the Calendar.
// Each student's colour for a course is saved in the database (course_members.color,
// sent as `color` by GET /api/me/courses). Until they pick one it's NULL, and the
// course gets the default below by its position in getMyCourses() (order joined).
export const COURSE_ACCENTS = ['#2563eb', '#16a34a', '#d97706', '#db2777'];

export function courseAccent(courses, courseId) {
  const index = courses.findIndex((course) => course.id === courseId);
  return courses[index]?.color || COURSE_ACCENTS[Math.max(index, 0) % COURSE_ACCENTS.length];
}
