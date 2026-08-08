import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthContext";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    queryClient.clear();
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/courses" className="text-lg font-semibold text-slate-900">
            NavGurukul
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/courses"
              className="text-slate-600 hover:text-slate-900"
            >
              Courses
            </Link>
            <button
              type="button"
              onClick={() => handleLogout()}
              className="text-slate-600 hover:text-slate-900"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
