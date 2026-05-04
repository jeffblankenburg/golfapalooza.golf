"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CourseLookupModal from "./CourseLookupModal";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export default function AddCourseButton({ className, children }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
        }
      >
        {children ?? "+ Add"}
      </button>
      {open && (
        <CourseLookupModal
          onClose={() => setOpen(false)}
          onCourseReady={(c) => {
            setOpen(false);
            router.push(`/my-rounds/courses/${c.id}`);
            router.refresh();
          }}
          onManualFallback={(prefill) => {
            setOpen(false);
            const params = new URLSearchParams();
            if (prefill.name) params.set("name", prefill.name);
            if (prefill.city) params.set("city", prefill.city);
            if (prefill.state) params.set("state", prefill.state);
            router.push(`/my-rounds/courses/new?${params.toString()}`);
          }}
        />
      )}
    </>
  );
}
