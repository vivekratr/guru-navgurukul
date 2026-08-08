import type { SupabaseClient } from "@supabase/supabase-js";

import { INITIAL_COURSE_STATUS } from "../lib/course-state.js";

export type CreatedCourseRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

export type CourseListRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
};

export type CourseDetailRow = {
  id: string;
  title: string;
  status: string;
  last_error: string | null;
};

export type CourseSourceRow = {
  id: string;
  type: string;
  status: string;
  last_error: string | null;
};

export type ArtifactStatusRow = {
  artifact_type: string;
  status: string;
};

export async function insertCourse(
  supabase: SupabaseClient,
  input: { title: string; userId: string },
): Promise<CreatedCourseRow> {
  const { data, error } = await supabase
    .from("courses")
    .insert({
      title: input.title,
      user_id: input.userId,
      status: INITIAL_COURSE_STATUS,
    })
    .select("id, title, status, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listCourses(
  supabase: SupabaseClient,
): Promise<CourseListRow[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, status, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function findCourseById(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CourseDetailRow | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, status, last_error")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function listCourseSources(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CourseSourceRow[]> {
  const { data, error } = await supabase
    .from("sources")
    .select("id, type, status, last_error")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listArtifactStatuses(
  supabase: SupabaseClient,
  courseId: string,
): Promise<ArtifactStatusRow[]> {
  const { data, error } = await supabase
    .from("artifact_generation_status")
    .select("artifact_type, status")
    .eq("course_id", courseId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function deleteCourseById(
  supabase: SupabaseClient,
  courseId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)
    .select("id");

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}
