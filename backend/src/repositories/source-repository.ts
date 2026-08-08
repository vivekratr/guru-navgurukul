import type { SupabaseClient } from "@supabase/supabase-js";

import { INITIAL_SOURCE_STATUS } from "../lib/source-state.js";
import type { CreateSourceBody } from "../schemas/source.js";

export type SourceRow = {
  id: string;
  course_id: string;
  type: string;
  title: string | null;
  storage_path: string | null;
  raw_text: string | null;
  status: string;
  attempt_count: number;
  last_error: string | null;
  duration_sec: number | null;
  created_at: string;
  updated_at: string;
};

export type CreatedSourceRow = {
  id: string;
  type: string;
  status: string;
};

export async function insertSource(
  supabase: SupabaseClient,
  input: {
    courseId: string;
    body: CreateSourceBody;
  },
): Promise<CreatedSourceRow> {
  const base = {
    course_id: input.courseId,
    status: INITIAL_SOURCE_STATUS,
    attempt_count: 0,
  };

  const row =
    input.body.type === "text"
      ? {
          ...base,
          type: input.body.type,
          raw_text: input.body.raw_text,
          storage_path: null,
          title: null,
          duration_sec: null,
        }
      : {
          ...base,
          type: input.body.type,
          storage_path: input.body.storage_path,
          raw_text: null,
          title: input.body.title ?? null,
          duration_sec:
            input.body.type === "video" ? input.body.duration_sec : null,
        };

  const { data, error } = await supabase
    .from("sources")
    .insert(row)
    .select("id, type, status")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function findSourceInCourse(
  supabase: SupabaseClient,
  courseId: string,
  sourceId: string,
): Promise<SourceRow | null> {
  const { data, error } = await supabase
    .from("sources")
    .select(
      "id, course_id, type, title, storage_path, raw_text, status, attempt_count, last_error, duration_sec, created_at, updated_at",
    )
    .eq("course_id", courseId)
    .eq("id", sourceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSourceStatus(
  supabase: SupabaseClient,
  sourceId: string,
  status: string,
  attemptCount?: number,
): Promise<CreatedSourceRow> {
  const update: { status: string; attempt_count?: number } = { status };

  if (attemptCount !== undefined) {
    update.attempt_count = attemptCount;
  }

  const { data, error } = await supabase
    .from("sources")
    .update(update)
    .eq("id", sourceId)
    .select("id, type, status")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
