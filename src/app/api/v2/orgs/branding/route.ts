import { NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";

/**
 * GET /api/v2/orgs/branding?slug=<slug> — public, unauthenticated org branding
 * (name + logo + brand color) so logged-out surfaces (the login screen) can skin
 * to the group a visitor was headed to. Only truly public fields are exposed.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const admin = v2AdminClient();
  const { data: org } = await admin
    .from("v2_organizations")
    .select("name, slug, logo_url, primary_color")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(
    { name: org.name, slug: org.slug, logo_url: org.logo_url, primary_color: org.primary_color },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
