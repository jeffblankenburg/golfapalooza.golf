import { AccoladeCategoryManager } from "@/components/admin/AccoladeCategoryManager";

export default function AdminAccoladesPage() {
  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Awards</h1>
        <p className="text-sm text-gray-500 mt-1">
          Edit the name, icon, and description for each award. Add new awards or remove ones that have no winners.
        </p>
      </div>
      <AccoladeCategoryManager />
    </div>
  );
}
