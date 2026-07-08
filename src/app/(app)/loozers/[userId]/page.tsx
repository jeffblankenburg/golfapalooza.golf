import { getAuthUser, createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { LoozerProfile, type LoozerProfileData } from "@/components/LoozerProfile";
import { LoozerJumpSearch } from "@/components/loozers/LoozerJumpSearch";
import { loadLoozerProfile } from "@/lib/loozers/profile-data";
import { loadLoozerList } from "@/lib/loozers/list-data";
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
  const [data, roster] = await Promise.all([
    loadLoozerProfile(queryClient, adminClient, userId),
    loadLoozerList(adminClient),
  ]);
  if (!data) notFound();

  const jumpList = roster.map((l) => ({
    id: l.id,
    display_name: l.display_name,
    full_name: l.full_name,
    avatar_url: l.avatar_url,
  }));

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/loozers" className={`shrink-0 ${BTN_BACK}`}>
          &larr; All Loozers
        </Link>
        <div className="ml-auto w-full max-w-xs">
          <LoozerJumpSearch loozers={jumpList} currentUserId={userId} />
        </div>
      </div>
      <LoozerProfile
        userId={userId}
        isOwnProfile={isOwnProfile}
        data={data as unknown as LoozerProfileData}
      />
    </div>
  );
}
