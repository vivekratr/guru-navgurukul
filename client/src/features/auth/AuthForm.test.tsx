import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AuthForm } from "@/features/auth/AuthForm";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
    },
  },
}));

describe("AuthForm", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signUp.mockReset();
    navigate.mockReset();
  });

  it("renders login form", () => {
    render(
      <MemoryRouter>
        <AuthForm mode="login" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("submits login", async () => {
    signInWithPassword.mockResolvedValue({
      error: null,
      data: { session: { access_token: "token" } },
    });

    render(
      <MemoryRouter>
        <AuthForm mode="login" />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
    expect(navigate).toHaveBeenCalledWith("/courses", { replace: true });
  });

  it("submits signup and redirects when session is returned", async () => {
    signUp.mockResolvedValue({
      error: null,
      data: {
        session: { access_token: "token" },
        user: { id: "user-1" },
      },
    });

    render(
      <MemoryRouter>
        <AuthForm mode="signup" />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "password123",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
      options: {
        emailRedirectTo: "http://localhost:3000/courses",
      },
    });
    expect(navigate).toHaveBeenCalledWith("/courses", { replace: true });
  });

  it("shows confirmation message when signup requires email verification", async () => {
    signUp.mockResolvedValue({
      error: null,
      data: {
        session: null,
        user: { id: "user-1" },
      },
    });

    render(
      <MemoryRouter>
        <AuthForm mode="signup" />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "password123",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      screen.getByText(/check your email for a confirmation link/i),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
