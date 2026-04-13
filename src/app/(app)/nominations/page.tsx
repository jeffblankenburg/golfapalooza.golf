import { getAuthUser } from "@/lib/supabase/server";
import NominationForm from "@/components/NominationForm";

export default async function NominationsPage() {
  const user = await getAuthUser();
  if (!user) return null;

  return (
    <div className="px-4 py-4">
      <h1 className="text-2xl font-bold mb-4">Nominate a Rookie</h1>
      <NominationForm />
    </div>
  );
}
