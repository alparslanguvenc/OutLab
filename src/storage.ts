import type { Project } from "./types";
import { normalizeProject } from "./videos";
export type SavedProject = Project & {
  id: string;
  updatedAt: string;
  recordedAt: string;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  videoFile?: { name: string; size: number; lastModified: number };
};
// Storage names keep the original "rotalab" prefix so sessions saved before
// the OutLab rename stay available in the same browser profile.
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("rotalab-local-v1", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("projects", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export async function saveProject(project: SavedProject) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  localStorage.setItem("rotalab-active", project.id);
  db.close();
}
export async function listProjects(): Promise<SavedProject[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction("projects").objectStore("projects").getAll();
    req.onsuccess = () => {
      db.close();
      resolve(
        (req.result as SavedProject[])
          .map(normalizeProject)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    };
    req.onerror = () => reject(req.error);
  });
}
export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = value == null ? "" : String(value);
            if (typeof value === "string" && /^[=+@\-\t\r]/.test(s))
              s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export async function sha256(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
