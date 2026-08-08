import type { RealtimeConnectionStatus } from "@/lib/realtime";

export function NetworkStatusBanner({
  isOnline,
  realtimeStatus,
  courseProcessing,
}: {
  isOnline: boolean;
  realtimeStatus: RealtimeConnectionStatus;
  courseProcessing: boolean;
}) {
  if (isOnline && realtimeStatus === "connected") {
    return null;
  }

  if (!isOnline) {
    return (
      <p
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        role="status"
      >
        Offline — reconnecting…
      </p>
    );
  }

  if (courseProcessing && realtimeStatus !== "connected") {
    return (
      <p
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        role="status"
      >
        Live updates unavailable — checking status periodically.
      </p>
    );
  }

  return null;
}

export function StaleDataBanner() {
  return (
    <p
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      role="status"
    >
      Unable to refresh right now. Showing last known state.
    </p>
  );
}

export function LiveStatusHint({
  isLive,
  isShowingStaleData,
}: {
  isLive: boolean;
  isShowingStaleData: boolean;
}) {
  if (isShowingStaleData) {
    return (
      <p className="text-xs text-amber-800" role="status">Last known state</p>
    );
  }

  if (isLive) {
    return (
      <p className="text-xs text-emerald-700" role="status">Live</p>
    );
  }

  return null;
}
