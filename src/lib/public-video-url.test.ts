import { expect, it } from "vitest";
import { aparatHash, publicVideoUrl } from "./public-video-url";

it("recognizes the supplied Aparat embed without trusting lookalike domains", () => {
  expect(aparatHash(new URL("https://www.aparat.com/video/video/embed/videoha"))).toBe("videoha");
  expect(aparatHash(new URL("https://notaparat.com/v/videoha"))).toBeNull();
  expect(aparatHash(new URL("https://www.aparat.com/v/abc123"))).toBe("abc123");
});
it("rejects local and non-http video addresses", () => {
  for (const url of ["http://localhost", "http://127.1", "http://0x7f000001", "http://[::1]", "http://192.168.0.1", "http://10.0.0.1", "http://host.internal", "javascript:alert(1)"]) expect(publicVideoUrl(url)).toBeNull();
  expect(publicVideoUrl("https://www.aparat.com/v/abc123")?.hostname).toBe("www.aparat.com");
});