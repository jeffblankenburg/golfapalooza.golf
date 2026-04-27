import { PollHistoryList } from "@/components/polls/PollHistoryList";

export default function PollHistoryPage() {
  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Past polls</h1>
      <PollHistoryList />
    </div>
  );
}
