import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

type Params = Promise<{ id: string }>;

/**
 * The org's 3s-and-Ds GIF library (admin-only).
 * GET  → list { gifs: [{ id, url, label }] }
 * POST → create a row after a signed upload { url, path, label? }
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data } = await admin
    .from("v2_3s_gifs")
    .select("id, url, label, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return NextResponse.json({ gifs: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: { url?: string; path?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.url || !body.path) return NextResponse.json({ error: "url + path required" }, { status: 400 });

  const { data, error } = await admin
    .from("v2_3s_gifs")
    .insert({ org_id: orgId, url: body.url, path: body.path, label: body.label?.trim() || null, created_by: userId })
    .select("id, url, label")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gif: data });
}
