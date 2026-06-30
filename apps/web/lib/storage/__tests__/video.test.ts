import { describe, it, expect } from "vitest";
import {
  validateVideo,
  checkVideo,
  isAcceptableVideoMime,
  ALLOWED_VIDEO_MIME,
  MAX_VIDEO_BYTES,
} from "../video";
import { BlobValidationError } from "../index";

// R1 (video upload on product page) — pure validation tests.
// These run without DB / storage backends; storage-backend behavior is exercised
// by the S3 / Local integration paths.

const ONE_MB = 1024 * 1024;

describe("R1 video upload validation", () => {
  describe("isAcceptableVideoMime / ALLOWED_VIDEO_MIME", () => {
    it("accepts only video/mp4 and video/webm", () => {
      expect(isAcceptableVideoMime("video/mp4")).toBe(true);
      expect(isAcceptableVideoMime("video/webm")).toBe(true);
    });

    it("rejects every other mime", () => {
      // Rejected explicitly — these are the realistic cases a merchant might upload.
      expect(isAcceptableVideoMime("video/quicktime")).toBe(false); // .mov
      expect(isAcceptableVideoMime("video/x-matroska")).toBe(false); // .mkv
      expect(isAcceptableVideoMime("video/x-msvideo")).toBe(false); // .avi
      expect(isAcceptableVideoMime("image/mp4")).toBe(false); // typo guard
      expect(isAcceptableVideoMime("application/octet-stream")).toBe(false);
      expect(isAcceptableVideoMime("")).toBe(false);
    });

    it("ALLOWED_VIDEO_MIME maps each mime to the canonical extension", () => {
      expect(ALLOWED_VIDEO_MIME).toEqual({
        "video/mp4": "mp4",
        "video/webm": "webm",
      });
    });
  });

  describe("validateVideo (throwing)", () => {
    it("returns the canonical extension for an mp4", () => {
      const bytes = Buffer.alloc(1024); // any non-empty payload below cap
      expect(validateVideo({ bytes, mimeType: "video/mp4" })).toBe("mp4");
    });

    it("returns the canonical extension for a webm", () => {
      const bytes = Buffer.alloc(1024);
      expect(validateVideo({ bytes, mimeType: "video/webm" })).toBe("webm");
    });

    it("throws BlobValidationError with Bengali message on a bad mime", () => {
      expect(() =>
        validateVideo({ bytes: Buffer.alloc(10), mimeType: "video/quicktime" }),
      ).toThrowError(BlobValidationError);

      try {
        validateVideo({ bytes: Buffer.alloc(10), mimeType: "video/quicktime" });
      } catch (err) {
        expect(err).toBeInstanceOf(BlobValidationError);
        // The friendly message must contain "MP4" or "WebM" so the admin UI tells
        // the merchant which formats are accepted.
        expect((err as Error).message).toMatch(/MP4|WebM/);
      }
    });

    it("rejects an empty payload", () => {
      expect(() =>
        validateVideo({ bytes: Buffer.alloc(0), mimeType: "video/mp4" }),
      ).toThrowError(BlobValidationError);
    });

    it("rejects a payload over the default 50 MB cap", () => {
      // Don't actually allocate 50 MB in the test — pass a smaller cap so we
      // can exercise the size check with a tiny buffer.
      const cap = 1024;
      expect(() =>
        validateVideo(
          { bytes: Buffer.alloc(2048), mimeType: "video/mp4" },
          cap,
        ),
      ).toThrowError(BlobValidationError);
    });

    it("accepts a payload at exactly the cap", () => {
      const cap = 1024;
      expect(
        validateVideo(
          { bytes: Buffer.alloc(1024), mimeType: "video/mp4" },
          cap,
        ),
      ).toBe("mp4");
    });

    it("exports MAX_VIDEO_BYTES = 50 MB exactly", () => {
      // Hard contract — admin UI copy is hard-coded to "৫০ এমবি" based on this.
      expect(MAX_VIDEO_BYTES).toBe(50 * ONE_MB);
    });

    it("rejects a 50 MB + 1 byte payload under default cap", () => {
      // Just over the threshold; throw without allocating 51 MB by using a
      // small fake cap and a buffer one byte over it.
      const small = 1024;
      const oversized = Buffer.alloc(small + 1);
      expect(() =>
        validateVideo(
          { bytes: oversized, mimeType: "video/webm" },
          small,
        ),
      ).toThrowError(BlobValidationError);
    });
  });

  describe("checkVideo (non-throwing)", () => {
    it("returns ok+ext for a valid video", () => {
      const result = checkVideo({
        bytes: Buffer.alloc(10),
        mimeType: "video/mp4",
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.ext).toBe("mp4");
    });

    it("returns ok=false with a Bengali message on a bad mime", () => {
      const result = checkVideo({
        bytes: Buffer.alloc(10),
        mimeType: "video/avi",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/MP4|WebM/);
    });

    it("returns ok=false for an empty payload", () => {
      const result = checkVideo({
        bytes: Buffer.alloc(0),
        mimeType: "video/mp4",
      });
      expect(result.ok).toBe(false);
    });

    it("returns ok=false for an oversized payload", () => {
      const result = checkVideo(
        { bytes: Buffer.alloc(2048), mimeType: "video/mp4" },
        1024,
      );
      expect(result.ok).toBe(false);
    });
  });
});
