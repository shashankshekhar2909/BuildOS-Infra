import { Skeleton } from "@/components/ui/skeleton";

export function RouteLoading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-10 w-20" />
            <Skeleton className="mt-6 h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
