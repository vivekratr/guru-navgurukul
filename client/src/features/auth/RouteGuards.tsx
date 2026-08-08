import { Navigate, useLocation } from "react-router-dom";

import { LoadingMessage } from "@/components/ui/StateMessages";
import { useAuth } from "@/features/auth/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linen-canvas px-6">
        <LoadingMessage>Restoring session…</LoadingMessage>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linen-canvas px-6">
        <LoadingMessage>Loading…</LoadingMessage>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/courses" replace />;
  }

  return children;
}
