export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "mkv", "3gp", "ogv", "ogg", "avi", "wmv", "flv", "ts", "mpeg", "mpg"];

export function videoUploadError(file: { name: string; type: string; size: number }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!file.type.startsWith("video/") && !VIDEO_EXTENSIONS.includes(ext)) return "Please choose a video file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_VIDEO_BYTES) return "That file is larger than 2 GB.";
  return null;
}

export function uploadPath(roomId: string, file: { name: string; size: number; lastModified: number }): string {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  return `${roomId}/${file.size.toString(36)}${file.lastModified.toString(36)}__${safe}`;
}