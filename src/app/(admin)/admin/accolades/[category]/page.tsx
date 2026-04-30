import Link from "next/link";
import { CategoryWinnersManager } from "@/components/admin/CategoryWinnersManager";

export default async function AdminCategoryWinnersPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  return (
    <div className="px-4 py-4">
      <Link
        href="/admin/accolades"
        className="text-sm text-green-700 font-medium mb-3 inline-block"
      >
        &larr; All awards
      </Link>
      <CategoryWinnersManager category={category} />
    </div>
  );
}
