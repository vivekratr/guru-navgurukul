import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AuthForm } from "@/features/auth/AuthForm";

const signInWithPassword = vi.fn();
const signUp = vi.fn();

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
  });

  it("renders login form", () => {
    render(
      <MemoryRouter>
        <AuthForm mode="login" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("submits login", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

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
  });

  it("submits signup", async () => {
    signUp.mockResolvedValue({ error: null });

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
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
  });
});
