import type { PollVoter } from "@/types/golf";

/**
 * Avatar + name chips for the people who voted for a given poll option.
 * Rendered to voters (not just admins) when a poll is non-anonymous and the
 * admin enabled show_voters — e.g. a "who picked which tee time?" poll.
 */
export function VoterChips({ voters }: { voters: PollVoter[] | undefined }) {
  if (!voters || voters.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {voters.map((v) => (
        <span
          key={v.user_id}
          className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-gray-100 text-[0.6875rem] text-gray-700"
        >
          {v.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={v.avatar_url}
              alt=""
              className="w-4 h-4 rounded-full object-cover"
            />
          ) : (
            <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-[0.5625rem] font-semibold text-gray-600">
              {v.display_name?.[0]?.toUpperCase() || "?"}
            </span>
          )}
          <span className="truncate max-w-[140px]">{v.display_name}</span>
        </span>
      ))}
    </div>
  );
}
