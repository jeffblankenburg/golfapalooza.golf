import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getEffectiveUserId } from "@/lib/simulator";
import { LoozerProfile } from "@/components/LoozerProfile";
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

  return (
    <div className="px-4 pt-6 pb-8">
      <Link href="/loozers" className={`mb-3 ${BTN_BACK}`}>
        &larr; All Loozers
      </Link>
      <LoozerProfile userId={userId} isOwnProfile={isOwnProfile} />
    </div>
  );
}
