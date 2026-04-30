import Link from "next/link";
import { loadAccoladeSections } from "@/lib/history/load-accolade-sections";
import { AccoladesGallery } from "@/components/AccoladesGallery";

export default async function SpectatorAccoladesPage() {
  const sections = await loadAccoladeSections();
  const totalAwards = sections.reduce((n, s) => n + s.rows.length, 0);
  return (
    <div className="pt-6 pb-8 space-y-4">
      <div className="px-4">
        <Link href="/spectator" className="text-sm text-green-700 font-medium inline-block">
          &larr; Home
        </Link>
      </div>
      <div className="px-4">
        <h1 className="text-2xl font-bold text-gray-900">Accolades</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalAwards} awards across {sections.length} categories.
        </p>
      </div>
      <AccoladesGallery sections={sections} hrefBase="/spectator/accolades" />
    </div>
  );
}
