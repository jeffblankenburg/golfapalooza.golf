import Link from "next/link";
import RoundForm from "@/components/my-rounds/RoundForm";

export default function NewRoundPage() {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <Link href="/my-rounds/rounds" className="text-sm text-gray-500 hover:text-gray-700">← Rounds</Link>
      <RoundForm />
    </div>
  );
}
