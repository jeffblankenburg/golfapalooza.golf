import { Skeleton, SkeletonCircle, SkeletonText } from "@/components/ui/Skeleton";

export default function LoozerProfileLoading() {
  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Skeleton className="h-6 w-32 mb-3 rounded-lg" />

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1.5 max-w-[80px]">
            <SkeletonCircle className="w-16 h-16" />
            <SkeletonCircle className="w-6 h-6" />
            <Skeleton className="h-2.5 w-12" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-24 rounded-lg" />
              <Skeleton className="h-5 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Bio + Accolades shells */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <Skeleton className="h-5 w-24 mb-3" />
        <SkeletonText lines={3} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <Skeleton className="h-5 w-32 mb-3" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCircle key={i} className="w-12 h-12 mx-auto" />
          ))}
        </div>
      </div>
    </div>
  );
}
