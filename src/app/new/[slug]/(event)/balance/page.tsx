import { redirect } from "next/navigation";

/**
 * Legacy event-only "My Balance" — superseded by the unified My Money (#237), which
 * covers every event AND group contest plus a settle-up layer. Kept as a redirect so
 * old bookmarks / deep links land on the current page.
 */
export default async function MemberBalanceRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/new/${slug}/money`);
}
