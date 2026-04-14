import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";

// POST - Record that the current user viewed this article
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { articleId } = await params;
  const effectiveUserId = await getEffectiveUserId(user.id);

  await supabase
    .from("article_views")
    .upsert(
      { article_id: articleId, user_id: effectiveUserId, viewed_at: new Date().toISOString() },
      { onConflict: "article_id,user_id" }
    );

  return NextResponse.json({ success: true });
}
