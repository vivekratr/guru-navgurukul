import { Navigate, useLocation } from "react-router-dom";

import { LoadingMessage } from "@/components/ui/StateMessages";
import { useAuth } from "@/features/auth/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingMessage>Restoring session…</LoadingMessage>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <LoadingMessage>Loading…</LoadingMessage>;
  }

  if (session) {
    return <Navigate to="/courses" replace />;
  }

  return children;
}
