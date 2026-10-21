import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, uploadPath, videoUploadError, VIDEO_EXTENSIONS } from "./uploads";

describe("video upload rules", () => {
  it("allows files up to 2 GB and rejects larger files", () => {
    expect(MAX_VIDEO_BYTES).toBe(2147483648);
    expect(videoUploadError({ name: "film.mp4", type: "video/mp4", size: 2147483648 })).toBeNull();
    expect(videoUploadError({ name: "film.mp4", type: "video/mp4", size: 2147483649 })).not.toBeNull();
  });
  it("accepts alternate video extensions without a MIME type", () => {
    for (const ext of VIDEO_EXTENSIONS) expect(videoUploadError({ name: `film.${ext.toUpperCase()}`, type: "", size: 40 })).toBeNull();
    expect(videoUploadError({ name: "film.pdf", type: "application/pdf", size: 40 })).not.toBeNull();
  });
  it("keeps the same upload path after rejoining the same room, separate from other rooms", () => {
    const file = { name: "movie.webm", size: 40, lastModified: 1000 };
    expect(uploadPath("room-one", file)).toBe("room-one/14rs__movie.webm");
    expect(uploadPath("room-one", { ...file })).toBe(uploadPath("room-one", file));
    expect(uploadPath("room-two", file)).not.toBe(uploadPath("room-one", file));
  });
});