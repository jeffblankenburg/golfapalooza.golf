import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import {
  listQuestions, addQuestion, patchQuestion, settleQuestion, voidQuestion, reorderQuestions, deleteQuestion, resetAnswers,
  type PropsResult,
} from "@/lib/v2/contests/props-server";

type Params = Promise<{ id: string; contestId: string }>;

/** Admin Props authoring + settlement. Thin shell over the shared engine; question CRUD,
 *  settle/void results, reorder, and reset answers. Contest-level settings (lock, numeric
 *  rule, buy-in, payouts, status) go through the generic contest PATCH. */
async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  const { data: contest } = await admin.from("v2_contests").select("id, contest_type").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "props") return { error: NextResponse.json({ error: "Not a Props contest" }, { status: 404 }) };
  return { admin, userId };
}

function respond<T>(r: PropsResult<T>, key: string) {
  return r.ok ? NextResponse.json({ [key]: r.data }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  return NextResponse.json({ questions: await listQuestions(g.admin, contestId) });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  return respond(await addQuestion(g.admin, contestId, body), "question");
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (body.action === "settle") return respond(await settleQuestion(g.admin, contestId, body), "question");
  if (body.action === "void") { const r = await voidQuestion(g.admin, contestId, (body.questionId as string) ?? null, body.voided === true); return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status }); }
  if (body.action === "reorder") { const r = await reorderQuestions(g.admin, contestId, (body.orderedIds as string[]) ?? []); return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status }); }
  if (body.action === "reset") { const r = await resetAnswers(g.admin, contestId); return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status }); }
  return respond(await patchQuestion(g.admin, contestId, body), "question");
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  const questionId = new URL(request.url).searchParams.get("questionId");
  const r = await deleteQuestion(g.admin, contestId, questionId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
