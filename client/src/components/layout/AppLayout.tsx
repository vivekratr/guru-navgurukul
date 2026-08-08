import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthContext";

function LeafIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="text-sage-mint"
    >
      <path
        d="M10 2C6 6 4 10 4 14C8 12 12 10 16 8C14 6 12 4 10 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

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
    <div className="min-h-screen bg-linen-canvas">
      <header className="page-shell py-6">
        <div className="flex items-center justify-between gap-6">
          <Link
            to="/courses"
            className="flex items-center gap-2 font-display text-subheading-sm font-semibold text-ink-black"
          >
            <LeafIcon />
            NavGurukul
          </Link>
          <nav className="flex items-center gap-4 sm:gap-6">
            <Link to="/courses" className="nav-link">
              Courses
            </Link>
            <button
              type="button"
              onClick={() => handleLogout()}
              className="nav-link cursor-pointer bg-transparent"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="page-shell pb-section pt-4">{children}</main>
    </div>
  );
}
