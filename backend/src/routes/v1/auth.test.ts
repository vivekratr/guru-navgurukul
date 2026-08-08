import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { env } from "../../config/index.js";
import {
  getAnonSupabaseClient,
  getServiceSupabaseClient,
} from "../../lib/supabase.js";

const hasSupabaseAuthConfig = Boolean(
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
);

describe("GET /api/v1/auth/me", () => {
  const app = createApp();

  it("returns 401 when Authorization header is missing", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
        retryable: false,
      },
    });
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Token not-a-bearer");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for an invalid bearer token", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it.skipIf(!hasSupabaseAuthConfig)(
    "returns 200 with the authenticated user id for a valid token",
    async () => {
      const serviceClient = getServiceSupabaseClient();
      const email = `auth-me-${crypto.randomUUID()}@example.com`;
      const password = `Test-${crypto.randomUUID()}`;

      const { data: createdUser, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

      expect(createError).toBeNull();
      expect(createdUser.user).not.toBeNull();

      const anonClient = getAnonSupabaseClient();
      const { data: signInData, error: signInError } =
        await anonClient.auth.signInWithPassword({
          email,
          password,
        });

      expect(signInError).toBeNull();
      expect(signInData.session?.access_token).toBeTruthy();

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${signInData.session!.access_token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        user: {
          id: createdUser.user!.id,
        },
      });

      await serviceClient.auth.admin.deleteUser(createdUser.user!.id);
    },
  );
});

describe("public health endpoints", () => {
  const app = createApp();

  it("keeps /health public", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("keeps /api/v1/health public", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", api: "v1" });
  });
});
