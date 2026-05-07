import { Skeleton, SkeletonCircle } from "@/components/ui/Skeleton";

export default function LoozersLoading() {
  return (
    <div className="px-4 pt-6 pb-8">
      <Skeleton className="h-8 w-56 mb-4" />
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-7 w-24 ml-auto rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center p-3 bg-white rounded-xl border border-gray-200"
          >
            <SkeletonCircle className="w-16 h-16 mb-2" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
