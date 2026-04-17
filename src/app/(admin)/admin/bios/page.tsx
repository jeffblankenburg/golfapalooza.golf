import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BioManager } from "@/components/admin/BioManager";

export default async function AdminBiosPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Loozer Bios</h1>
        <p className="text-sm text-gray-500">Write biographies for each Loozer</p>
      </div>
      <BioManager />
    </div>
  );
}
