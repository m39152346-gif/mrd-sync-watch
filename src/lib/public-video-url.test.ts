import { expect, it } from "vitest";
import { aparatEmbedUrl, aparatHash, pickAparatVideo, publicVideoUrl } from "./public-video-url";

it("recognizes the supplied Aparat embed without trusting lookalike domains", () => {
  expect(aparatHash(new URL("https://www.aparat.com/video/video/embed/videoha"))).toBe("videoha");
  expect(aparatHash(new URL("https://notaparat.com/v/videoha"))).toBeNull();
  expect(aparatHash(new URL("https://www.aparat.com/v/abc123"))).toBe("abc123");
});
it("reads the real hash from a full Aparat iframe or script embed", () => {
  expect(aparatHash(new URL("https://www.aparat.com/video/video/embed/videohash/Xy12Z/vt/frame"))).toBe("Xy12Z");
  expect(aparatHash(new URL("https://www.aparat.com/embed/Qw9e8?data[rnddiv]=x"))).toBe("Qw9e8");
  expect(aparatEmbedUrl("Xy12Z")).toBe("https://www.aparat.com/video/video/embed/videohash/Xy12Z/vt/frame");
});
it("prefers a 720p MP4 for Aparat so phones play smoothly", () => {
  const urls = [
    "https://cdn.aparat.com/v/a-1080p.mp4",
    "https://cdn.aparat.com/v/a-360p.mp4",
    "https://cdn.aparat.com/v/a-720p.mp4",
    "https://cdn.aparat.com/v/a.m3u8",
  ];
  expect(pickAparatVideo(urls)).toBe("https://cdn.aparat.com/v/a-720p.mp4");
  expect(pickAparatVideo(["https://cdn.aparat.com/v/a.m3u8"])).toBe("https://cdn.aparat.com/v/a.m3u8");
});
it("rejects local and non-http video addresses", () => {
  for (const url of ["http://localhost", "http://127.1", "http://0x7f000001", "http://[::1]", "http://192.168.0.1", "http://10.0.0.1", "http://host.internal", "javascript:alert(1)"]) expect(publicVideoUrl(url)).toBeNull();
  expect(publicVideoUrl("https://www.aparat.com/v/abc123")?.hostname).toBe("www.aparat.com");
});
