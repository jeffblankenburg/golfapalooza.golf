"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BTN_DESTRUCTIVE } from "@/lib/ui/buttons";

/**
 * Admin-only "Delete round" affordance for the read-only spectator view
 * (issue #140). Any app admin can delete any round via the API
 * (canManageRound grants is_admin), but the watch page — where an admin lands
 * from the Live Now card — otherwise offers no way to act on a bogus/test
 * round. Confirms via ConfirmModal (never a native dialog).
 */
export function AdminDeleteRoundButton({
  roundId,
  label,
}: {
  roundId: string;
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/rounds/${roundId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={BTN_DESTRUCTIVE}
        disabled={deleting}
      >
        {deleting ? "Deleting…" : "Delete round"}
      </button>

      <ConfirmModal
        open={confirming}
        title="Delete this round?"
        message={
          <p className="text-sm text-gray-600">
            This permanently deletes <span className="font-semibold">{label}</span>{" "}
            and all of its scores and comments. This cannot be undone.
          </p>
        }
        confirmLabel="Delete round"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
