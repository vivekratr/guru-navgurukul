import type { SupabaseClient } from "@supabase/supabase-js";

import * as queueRepository from "../repositories/queue-repository.js";

export async function generateCourse(
  supabase: SupabaseClient,
  courseId: string,
) {
  const result = await queueRepository.startCourseIngestion(supabase, courseId);

  return {
    id: result.id,
    status: result.status,
  };
}
