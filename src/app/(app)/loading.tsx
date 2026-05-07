import { Skeleton } from "@/components/ui/Skeleton";

// Generic fallback for (app) routes that don't ship their own loading.tsx.
// Specific routes (loozers, profile, etc.) override with tailored skeletons.
export default function AppLoading() {
  return (
    <div className="px-4 pt-6 pb-8 space-y-3">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
