import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getEffectiveUserId } from "@/lib/simulator";
import { LoozerProfile } from "@/components/LoozerProfile";
import Link from "next/link";

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
      <Link href="/loozers" className="text-sm text-green-700 font-medium mb-3 inline-block">
        &larr; All Loozers
      </Link>
      <LoozerProfile userId={userId} isOwnProfile={isOwnProfile} />
    </div>
  );
}
