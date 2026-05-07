import { getAuthUser, createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { LoozerProfile, type LoozerProfileData } from "@/components/LoozerProfile";
import { loadLoozerProfile } from "@/lib/loozers/profile-data";
import Link from "next/link";
import { BTN_BACK } from "@/lib/ui/buttons";

export default async function LoozerProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await getAuthUser();

  if (!user) redirect("/login");

  const effectiveUserId = await getEffectiveUserId(user.id);
  const isOwnProfile = effectiveUserId === userId;

  // Server-fetch the profile data so the client component renders with
  // everything in place — no useEffect → fetch waterfall.
  const supabase = await createClient();
  const simulating = await isSimulating();
  const queryClient = simulating ? createAdminClient() : supabase;
  const adminClient = createAdminClient();
  const data = await loadLoozerProfile(queryClient, adminClient, userId);
  if (!data) notFound();

  return (
    <div className="px-4 pt-6 pb-8">
      <Link href="/loozers" className={`mb-3 ${BTN_BACK}`}>
        &larr; All Loozers
      </Link>
      <LoozerProfile
        userId={userId}
        isOwnProfile={isOwnProfile}
        data={data as unknown as LoozerProfileData}
      />
    </div>
  );
}
