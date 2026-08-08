import { ApiClientError, isApiErrorBody } from "@/lib/api-error";
import { supabase } from "@/lib/supabase";
import type {
  ConceptGraphResponse,
  CourseCreated,
  CourseDetail,
  CourseListItem,
  FlashcardsResponse,
  SourceCreated,
  SourceType,
  SummaryResponse,
} from "@/types/api";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);

    if (isApiErrorBody(body)) {
      throw new ApiClientError(body.error);
    }

    throw new Error(response.statusText || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getCourses(): Promise<{ courses: CourseListItem[] }> {
    return request("/v1/courses");
  },

  createCourse(title: string): Promise<CourseCreated> {
    return request("/v1/courses", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  },

  getCourse(courseId: string): Promise<CourseDetail> {
    return request(`/v1/courses/${courseId}`);
  },

  createTextSource(courseId: string, rawText: string): Promise<SourceCreated> {
    return request(`/v1/courses/${courseId}/sources`, {
      method: "POST",
      body: JSON.stringify({ type: "text", raw_text: rawText }),
    });
  },

  createFileSource(
    courseId: string,
    body: {
      type: Exclude<SourceType, "text">;
      storage_path: string;
      mime_type: string;
      file_size_bytes: number;
      duration_sec?: number;
      title?: string;
    },
  ): Promise<SourceCreated> {
    return request(`/v1/courses/${courseId}/sources`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  generateCourse(courseId: string): Promise<{ id: string; status: string }> {
    return request(`/v1/courses/${courseId}/generate`, {
      method: "POST",
    });
  },

  retrySource(courseId: string, sourceId: string): Promise<SourceCreated> {
    return request(`/v1/courses/${courseId}/sources/${sourceId}/retry`, {
      method: "POST",
    });
  },

  retryKnowledgeExtraction(
    courseId: string,
  ): Promise<{ id: string; status: string }> {
    return request(`/v1/courses/${courseId}/retry-knowledge-extraction`, {
      method: "POST",
    });
  },

  retryArtifact(
    courseId: string,
    artifactType: "flashcards" | "summary",
  ): Promise<{ id: string; artifact_type: string; status: string }> {
    return request(`/v1/courses/${courseId}/retry-artifact/${artifactType}`, {
      method: "POST",
    });
  },

  getSummary(courseId: string): Promise<SummaryResponse> {
    return request(`/v1/courses/${courseId}/summary`);
  },

  getFlashcards(courseId: string): Promise<FlashcardsResponse> {
    return request(`/v1/courses/${courseId}/flashcards`);
  },

  getConceptGraph(courseId: string): Promise<ConceptGraphResponse> {
    return request(`/v1/courses/${courseId}/concept-graph`);
  },
};
