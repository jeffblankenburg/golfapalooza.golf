import { getAuthUser } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";
import MyFinancials from "@/components/MyFinancials";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { AdminLink } from "@/components/AdminLink";

export default async function FinancialsPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const effectiveUserId = await getEffectiveUserId(user.id);

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">My Financials</h1>
        <PinnedNoteButton pinnedTo="financials" />
        <AdminLink permissionKey="manage_finances" href="/admin/financials" />
      </div>
      <MyFinancials userId={effectiveUserId} />
    </div>
  );
}
