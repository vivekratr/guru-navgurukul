import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signupSchema = loginSchema.extend({
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const createCourseSchema = z.object({
  title: z.string().trim().min(1, "Course title is required"),
});

export const textSourceSchema = z.object({
  raw_text: z.string().trim().min(1, "Text content is required"),
});
