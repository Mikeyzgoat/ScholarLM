import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
const uploadDir = resolve(import.meta.dir, "../../data/uploads");
export async function ensureUploadDirectory(): Promise<void> {
  await mkdir(uploadDir, { recursive: true });
}
export function getUploadPath(documentId: string): string {
  return resolve(uploadDir, `${documentId}.pdf`);
}
export async function saveUploadedPdf(
  file: File,
  documentId: string,
): Promise<string> {
  await ensureUploadDirectory();
  const path = getUploadPath(documentId);
  await Bun.write(path, file);
  return path;
}
export async function deleteFileIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
