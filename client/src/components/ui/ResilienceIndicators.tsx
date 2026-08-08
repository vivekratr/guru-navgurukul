import { PillTag } from "@/components/ui/PillTag";
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
      <p className="status-banner-warn" role="status">
        Offline — reconnecting…
      </p>
    );
  }

  if (courseProcessing && realtimeStatus !== "connected") {
    return (
      <p className="status-banner" role="status">
        Live updates unavailable — checking status periodically.
      </p>
    );
  }

  return null;
}

export function StaleDataBanner() {
  return (
    <p className="status-banner-warn" role="status">
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
      <PillTag role="status">Last known state</PillTag>
    );
  }

  if (isLive) {
    return (
      <PillTag accent role="status">
        Live
      </PillTag>
    );
  }

  return null;
}
