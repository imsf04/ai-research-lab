import type { ProjectCredential, TaskStatus } from "./api";

export interface ProjectItem extends ProjectCredential {
  status?: TaskStatus;
}

const PROJECTS_KEY = "human-research-projects";
const ACTIVE_KEY = "human-research";

function isProject(value: unknown): value is ProjectItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.key === "string";
}

export function loadProjects(): ProjectItem[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(PROJECTS_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? parsed.filter(isProject) : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: ProjectItem[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // Storage can be unavailable in private mode; the session still works.
  }
}

export function loadCredential(): ProjectCredential | null {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(ACTIVE_KEY) ?? "null",
    );
    return isProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCredential(project: ProjectCredential | null): void {
  try {
    if (project) localStorage.setItem(ACTIVE_KEY, JSON.stringify(project));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function upsertProject(
  projects: ProjectItem[],
  project: ProjectItem,
): ProjectItem[] {
  const rest = projects.filter((item) => item.id !== project.id);
  return [project, ...rest];
}

export function mergeProjectMeta(
  projects: ProjectItem[],
  id: string,
  meta: { title?: string; status?: TaskStatus; updatedAt?: string },
): ProjectItem[] {
  let changed = false;
  const next = projects.map((item) => {
    if (item.id !== id) return item;
    const merged: ProjectItem = {
      ...item,
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.status ? { status: meta.status } : {}),
      ...(meta.updatedAt ? { updatedAt: meta.updatedAt } : {}),
    };
    if (
      merged.title !== item.title ||
      merged.status !== item.status ||
      merged.updatedAt !== item.updatedAt
    ) {
      changed = true;
      return merged;
    }
    return item;
  });
  return changed ? sortProjects(next) : projects;
}

export function sortProjects(projects: ProjectItem[]): ProjectItem[] {
  return [...projects].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? "") || 0;
    const rightTime = Date.parse(right.updatedAt ?? "") || 0;
    return rightTime - leftTime;
  });
}
