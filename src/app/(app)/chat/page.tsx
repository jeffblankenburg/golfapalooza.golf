import { ChatRouteOpener } from "@/components/chat/ChatRouteOpener";

/**
 * Legacy /chat route. Chat now lives in a universal drawer mounted by the
 * root layout. Visiting this URL just opens that drawer (to the room list)
 * and rewrites the URL back to `/`.
 */
export default function ChatPageRoute() {
  return <ChatRouteOpener />;
}
