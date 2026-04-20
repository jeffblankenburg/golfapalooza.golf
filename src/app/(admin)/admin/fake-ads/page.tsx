import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FakeAdManager } from "@/components/admin/FakeAdManager";

export default async function AdminFakeAdsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Fake Ads</h1>
        <p className="text-sm text-gray-500">Humor banners shown on the home page and Loozer profiles</p>
      </div>
      <FakeAdManager />
    </div>
  );
}
