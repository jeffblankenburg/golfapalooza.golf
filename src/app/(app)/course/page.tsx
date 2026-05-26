import { redirect } from "next/navigation";

/**
 * Issue #133. The old single-course page now redirects into the new
 * `/courses` library so any shared old links still work. The featured
 * active-event card on `/courses` lands users in the same spot they
 * would've ended up on before.
 */
export default function CourseRedirectPage() {
  redirect("/courses");
}
