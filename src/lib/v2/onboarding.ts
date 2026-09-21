import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * New-group onboarding checklist (#196). Computes which setup steps a freshly
 * created group has finished, entirely from real data — no per-step flags to
 * keep in sync. The "Get your group ready" card on the group home renders these
 * for admins until every step is done or the card is dismissed.
 *
 * Step completion signals (all derived, never manually toggled):
 *   1 Name       — always done (an org can't exist without a name)
 *   2 Logo & colors — a logo has been uploaded (logo_url set)
 *   3 First event   — the org has at least one event (any status)
 *   4 Features      — the admin has saved a feature config (an org-default row exists)
 *   5 Invite members— at least one invite sent OR a second member has joined
 */

export interface OnboardingStep {
  key: "name" | "brand" | "event" | "features" | "members";
  label: string;
  desc: string;
  href: string | null; // deep-link to the admin surface; null once done
  done: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  allDone: boolean;
  dismissed: boolean;
  /** Show the card only when the viewer is an admin, it isn't dismissed, and work remains. */
  show: boolean;
}

export async function getOnboardingState(
  supabase: SupabaseClient,
  org: { id: string; slug: string; logo_url: string | null },
  isAdmin: boolean,
): Promise<OnboardingState> {
  const base = `/new/${org.slug}/admin`;

  const [orgRes, eventsRes, featuresRes, invitesRes, membersRes] = await Promise.all([
    supabase.from("v2_organizations").select("onboarding_dismissed_at").eq("id", org.id).maybeSingle(),
    supabase.from("v2_events").select("id", { count: "exact", head: true }).eq("org_id", org.id),
    supabase
      .from("v2_event_features")
      .select("feature_key", { count: "exact", head: true })
      .eq("org_id", org.id)
      .is("event_id", null),
    supabase.from("v2_invites").select("id", { count: "exact", head: true }).eq("org_id", org.id),
    supabase
      .from("v2_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "active"),
  ]);

  const hasLogo = !!org.logo_url;
  const hasEvent = (eventsRes.count ?? 0) > 0;
  const hasFeatures = (featuresRes.count ?? 0) > 0;
  const hasInvites = (invitesRes.count ?? 0) > 0;
  const hasOtherMembers = (membersRes.count ?? 0) > 1;
  const dismissed = !!(orgRes.data as { onboarding_dismissed_at: string | null } | null)?.onboarding_dismissed_at;

  const steps: OnboardingStep[] = [
    {
      key: "name",
      label: "Name your group",
      desc: "Done — your group is live.",
      href: null,
      done: true,
    },
    {
      key: "brand",
      label: "Add a logo & colors",
      desc: "Make it feel like yours.",
      href: `${base}/settings`,
      done: hasLogo,
    },
    {
      key: "event",
      label: "Create your first event",
      desc: "Give members something to show up for.",
      href: base,
      done: hasEvent,
    },
    {
      key: "features",
      label: "Turn on the features you want",
      desc: "Scores, chat, photos, and more.",
      href: `${base}/features`,
      done: hasFeatures,
    },
    {
      key: "members",
      label: "Invite your members",
      desc: "Send text invites to your people.",
      href: `${base}/members`,
      done: hasInvites || hasOtherMembers,
    },
  ].map((s) => ({ ...s, href: s.done ? null : s.href })) as OnboardingStep[];

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const allDone = completed === total;

  return {
    steps,
    completed,
    total,
    allDone,
    dismissed,
    show: isAdmin && !dismissed && !allDone,
  };
}
