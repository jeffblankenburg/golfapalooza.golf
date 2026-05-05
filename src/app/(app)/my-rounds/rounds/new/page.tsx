import Link from "next/link";
import RoundForm from "@/components/my-rounds/RoundForm";
import { BTN_BACK } from "@/lib/ui/buttons";

export default function NewRoundPage() {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <Link href="/my-rounds" className={BTN_BACK}>← My Rounds</Link>
      <RoundForm />
    </div>
  );
}
