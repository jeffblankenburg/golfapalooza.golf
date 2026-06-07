import { ChatRouteOpener } from "@/components/chat/ChatRouteOpener";

/**
 * Legacy /chat/[roomId] route — used by notification deep links and old
 * bookmarks. Opens the universal chat drawer directly to this room and
 * rewrites the URL back to `/`.
 */
export default async function ChatRoomPageRoute({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <ChatRouteOpener roomId={roomId} />;
}
