import { getAuthUser } from "@/lib/supabase/server";
import NominationForm from "@/components/NominationForm";
import { AdminLink } from "@/components/AdminLink";

export default async function NominationsPage() {
  const user = await getAuthUser();
  if (!user) return null;

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-2xl font-bold">Nominate a Rookie</h1>
        <AdminLink permissionKey="manage_nominations" href="/admin/nominations" />
      </div>
      <NominationForm />
    </div>
  );
}
