import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldInput, FieldLabel } from "@/components/ui/Field";
import { LeafDecoration } from "@/components/ui/LeafDecoration";
import { supabase } from "@/lib/supabase";
import { loginSchema, signupSchema } from "@/schemas/forms";

type AuthMode = "login" | "signup";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const parsed =
      mode === "login"
        ? loginSchema.safeParse({ email, password })
        : signupSchema.safeParse({ email, password, confirmPassword });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "login") {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: parsed.data.email,
            password: parsed.data.password,
          });

        if (signInError) {
          setError(signInError.message);
        } else if (data.session) {
          navigate("/courses", { replace: true });
        }
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/courses`,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else if (data.session) {
          navigate("/courses", { replace: true });
        } else if (data.user) {
          setSuccessMessage(
            "Account created. Check your email for a confirmation link, then log in.",
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-linen-canvas px-6 py-12">
      <div className="announcement-bar -mx-6 mb-12">
        Turn any source into structured learning content — summaries, flashcards,
        and concept maps.
      </div>

      <div className="relative mx-auto max-w-lg">
        <LeafDecoration className="absolute -left-16 top-8 hidden h-20 w-28 opacity-80 lg:block" />
        <LeafDecoration className="absolute -right-12 bottom-12 hidden h-16 w-24 rotate-12 opacity-60 lg:block" />

        <div className="mb-10 text-center">
          <h1 className="display-heading">
            {mode === "login" ? "Welcome back" : "Start learning"}
          </h1>
          <p className="body-copy-muted mx-auto mt-6">
            {mode === "login"
              ? "Access your courses and generated learning content."
              : "Create an account to build courses from documents, text, and media."}
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <FieldLabel htmlFor="auth-email">Email</FieldLabel>
              <FieldInput
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <FieldLabel htmlFor="auth-password">Password</FieldLabel>
              <FieldInput
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </div>

            {mode === "signup" && (
              <div>
                <FieldLabel htmlFor="auth-confirm-password">
                  Confirm password
                </FieldLabel>
                <FieldInput
                  id="auth-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            {error && (
              <p className="text-body-sm text-charcoal" role="alert">
                {error}
              </p>
            )}

            {successMessage && (
              <p className="text-body-sm text-ink-black" role="status">
                {successMessage}
              </p>
            )}

            <Button type="submit" fullWidth disabled={submitting}>
              {submitting
                ? "Please wait…"
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
            </Button>
          </form>

          <p className="mt-8 text-center text-body-sm text-charcoal">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link
                  to="/signup"
                  className="font-medium text-ink-black underline decoration-charcoal/40 underline-offset-4"
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="font-medium text-ink-black underline decoration-charcoal/40 underline-offset-4"
                >
                  Log in
                </Link>
              </>
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}
