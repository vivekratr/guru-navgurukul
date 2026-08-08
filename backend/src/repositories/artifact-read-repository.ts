import type { SupabaseClient } from "@supabase/supabase-js";

export type SummaryRow = {
  kind: string;
  content: string;
};

export type FlashcardRow = {
  id: string;
  concept_id: string | null;
  front: string;
  back: string;
  created_at: string;
};

export type ConceptRow = {
  id: string;
  name: string;
  difficulty: string | null;
};

export type ConceptRelationshipRow = {
  source_concept_id: string;
  target_concept_id: string;
  type: string;
};

export type ModuleRow = {
  position: number;
  title: string;
  paragraphs: string[];
};

export async function listCourseModules(
  supabase: SupabaseClient,
  courseId: string,
): Promise<ModuleRow[]> {
  const { data, error } = await supabase
    .from("course_modules")
    .select("position, title, paragraphs")
    .eq("course_id", courseId)
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    position: row.position as number,
    title: row.title as string,
    paragraphs: row.paragraphs as string[],
  }));
}

export async function listSummaries(
  supabase: SupabaseClient,
  courseId: string,
): Promise<SummaryRow[]> {
  const { data, error } = await supabase
    .from("summaries")
    .select("kind, content")
    .eq("course_id", courseId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listFlashcards(
  supabase: SupabaseClient,
  courseId: string,
): Promise<FlashcardRow[]> {
  const { data, error } = await supabase
    .from("flashcards")
    .select("id, concept_id, front, back, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listConcepts(
  supabase: SupabaseClient,
  courseId: string,
): Promise<ConceptRow[]> {
  const { data, error } = await supabase
    .from("concepts")
    .select("id, name, difficulty")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listConceptRelationships(
  supabase: SupabaseClient,
  courseId: string,
): Promise<ConceptRelationshipRow[]> {
  const { data, error } = await supabase
    .from("concept_relationships")
    .select("source_concept_id, target_concept_id, type")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}
