import RoundWatch from "./RoundWatch";

/**
 * Public, unauthenticated spectator page for a single round (#205). Lives OUTSIDE
 * the (event) auth group, so anon visitors reach it with no login. Data comes from
 * the public API (admin client); the client polls it while the round is live.
 */
export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoundWatch roundId={id} />;
}
