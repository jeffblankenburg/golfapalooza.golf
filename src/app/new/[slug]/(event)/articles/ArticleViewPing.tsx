"use client";

import { useEffect } from "react";

/**
 * Records that the current member read this article (once per user, deduped
 * server-side). Fire-and-forget on mount; renders nothing.
 */
export default function ArticleViewPing({ articleId }: { articleId: string }) {
  useEffect(() => {
    fetch(`/api/v2/articles/${articleId}/view`, { method: "POST" }).catch(() => {});
  }, [articleId]);
  return null;
}
