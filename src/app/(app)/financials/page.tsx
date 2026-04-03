import { getAuthUser } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";
import MyFinancials from "@/components/MyFinancials";

export default async function FinancialsPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const effectiveUserId = await getEffectiveUserId(user.id);

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">My Financials</h1>
      <MyFinancials userId={effectiveUserId} />
    </div>
  );
}
