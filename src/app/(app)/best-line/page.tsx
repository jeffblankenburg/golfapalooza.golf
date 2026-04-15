import { getAuthUser } from "@/lib/supabase/server";
import BestLineContent from "@/components/BestLineContent";

export default async function BestLinePage() {
  const user = await getAuthUser();
  if (!user) return null;

  return <BestLineContent />;
}
