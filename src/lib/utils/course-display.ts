// Canonical display name for a course. Always prefix the club name when
// distinct, so "West Course" doesn't appear context-free in a flat list of
// dozens of courses. "Norwood Hills Country Club - West Course" wins.
//
// Use this everywhere a course name is rendered to the user — search
// results, confirmation modals, picker rows, admin lists.

interface NamedCourse {
  name: string;
  club_name?: string | null;
}

export function formatCourseName(course: NamedCourse): string {
  const name = course.name?.trim() || "";
  const club = course.club_name?.trim() || "";
  if (!club) return name;
  if (club.toLowerCase() === name.toLowerCase()) return name;
  // If the course name already includes the club name (e.g. "Streamsong Red"
  // when club is "Streamsong"), don't double up.
  if (name.toLowerCase().includes(club.toLowerCase())) return name;
  return `${club} - ${name}`;
}
