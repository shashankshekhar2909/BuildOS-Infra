import { RouteLoading } from "@/components/auth/route-loading";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.16),transparent_34%),linear-gradient(180deg,#030712_0%,#020617_100%)] px-4 py-10 xl:px-8">
      <RouteLoading />
    </div>
  );
}
