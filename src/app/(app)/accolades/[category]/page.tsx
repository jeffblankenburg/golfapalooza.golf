import { notFound } from "next/navigation";
import { loadAccoladeSection } from "@/lib/history/load-accolade-sections";
import { AccoladeHistory } from "@/components/AccoladeHistory";

export default async function AccoladeHistoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const section = await loadAccoladeSection(category);
  if (!section) notFound();
  return (
    <AccoladeHistory
      section={section}
      loozerHrefBase="/loozers"
      backHref="/accolades"
    />
  );
}
