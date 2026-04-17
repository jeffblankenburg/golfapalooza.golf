import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoozersList } from "@/components/LoozersList";

export default async function LoozersPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Meet the Loozers</h1>
      <LoozersList />
    </div>
  );
}
