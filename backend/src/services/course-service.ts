import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "../lib/errors.js";
import * as courseRepository from "../repositories/course-repository.js";

function courseNotFound(): never {
  throw new AppError(404, "COURSE_NOT_FOUND", "Course not found", false);
}

export async function createCourse(
  supabase: SupabaseClient,
  userId: string,
  title: string,
) {
  return courseRepository.insertCourse(supabase, { title, userId });
}

export async function listCourses(supabase: SupabaseClient) {
  const courses = await courseRepository.listCourses(supabase);
  return { courses };
}

export async function getCourseDetail(
  supabase: SupabaseClient,
  courseId: string,
) {
  const course = await courseRepository.findCourseById(supabase, courseId);

  if (!course) {
    courseNotFound();
  }

  const [sources, artifactRows] = await Promise.all([
    courseRepository.listCourseSources(supabase, courseId),
    courseRepository.listArtifactStatuses(supabase, courseId),
  ]);

  const artifact_status: Record<string, string> = {};
  for (const row of artifactRows) {
    artifact_status[row.artifact_type] = row.status;
  }

  return {
    id: course.id,
    title: course.title,
    status: course.status,
    last_error: course.last_error,
    sources,
    artifact_status,
  };
}

export async function deleteCourse(
  supabase: SupabaseClient,
  courseId: string,
): Promise<void> {
  const deleted = await courseRepository.deleteCourseById(supabase, courseId);

  if (!deleted) {
    courseNotFound();
  }
}
