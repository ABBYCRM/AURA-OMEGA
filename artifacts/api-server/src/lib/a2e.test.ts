import { describe, it, expect } from "vitest";
import { _findUrl, _jobIdOf } from "./a2e";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|$)/i;

describe("a2e _findUrl — defensive result-URL extraction", () => {
  it("finds an image url nested under an unknown field name", () => {
    const resp = { code: 0, data: [{ _id: "x", status: "done", result: { foo: "https://cdn.a2e.ai/out/abc.png" } }] };
    expect(_findUrl(resp, IMAGE_EXT)).toBe("https://cdn.a2e.ai/out/abc.png");
  });

  it("finds a video url in an array field", () => {
    const resp = { data: [{ outputs: ["https://cdn.a2e.ai/v/clip.mp4?sig=1"] }] };
    expect(_findUrl(resp, VIDEO_EXT)).toBe("https://cdn.a2e.ai/v/clip.mp4?sig=1");
  });

  it("ignores non-http and non-matching strings", () => {
    const resp = { data: [{ status: "processing", note: "not ready", path: "/tmp/x.png" }] };
    expect(_findUrl(resp, IMAGE_EXT)).toBeNull();
  });

  it("does not match a video ext when scanning for images", () => {
    const resp = { data: [{ video: "https://cdn.a2e.ai/v/clip.mp4" }] };
    expect(_findUrl(resp, IMAGE_EXT)).toBeNull();
  });

  it("handles circular references without looping forever", () => {
    const a: Record<string, unknown> = { url: "https://cdn.a2e.ai/out/z.webp" };
    a["self"] = a;
    expect(_findUrl(a, IMAGE_EXT)).toBe("https://cdn.a2e.ai/out/z.webp");
  });

  it("finds the completed image_urls[] result on a real A2E batchDetail shape", () => {
    // Captured verbatim from a live userText2Image/batchDetail response.
    const detail = { code: 0, data: [{ _id: "6a4643db87bebc01730ca535", current_status: "completed", image_urls: ["https://3days-apac.downloadaivideo.com/stable/users/x/text2image/abc.jpg"] }] };
    expect(_findUrl(detail, IMAGE_EXT)).toContain(".jpg");
  });
});

describe("a2e _jobIdOf — A2E wraps data as an array", () => {
  it("extracts _id from the real array-wrapped start response", () => {
    // Captured verbatim from a live userText2Image/start response.
    const start = { code: 0, data: [{ _id: "6a4643db87bebc01730ca535", featureType: "text2image", current_status: "initialized", image_urls: [] }] };
    expect(_jobIdOf(start)).toBe("6a4643db87bebc01730ca535");
  });

  it("still works when data is a plain object", () => {
    expect(_jobIdOf({ data: { _id: "abc" } })).toBe("abc");
  });

  it("returns null when there is no id", () => {
    expect(_jobIdOf({ data: [{}] })).toBeNull();
  });
});
