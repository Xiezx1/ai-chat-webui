import path from "path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");

export function uploadPath(storedName: string) {
  return path.join(UPLOAD_DIR, storedName);
}
