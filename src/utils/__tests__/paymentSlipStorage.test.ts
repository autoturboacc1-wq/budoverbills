import { describe, expect, it, vi, beforeEach } from "vitest";

const useSignedUrlMocks = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
  normalizeStoragePath: vi.fn((path: string) => path),
  uploadToPrivateBucket: vi.fn(),
}));

vi.mock("@/hooks/useSignedUrl", () => ({
  getSignedUrl: useSignedUrlMocks.getSignedUrl,
  normalizeStoragePath: useSignedUrlMocks.normalizeStoragePath,
  uploadToPrivateBucket: useSignedUrlMocks.uploadToPrivateBucket,
}));

import {
  buildPaymentSlipPath,
  getPaymentSlipSignedUrl,
  normalizeAndValidatePaymentSlipPath,
  uploadPaymentSlip,
  validatePaymentSlipFile,
} from "@/utils/paymentSlipStorage";

describe("paymentSlipStorage", () => {
  beforeEach(() => {
    useSignedUrlMocks.getSignedUrl.mockReset();
    useSignedUrlMocks.normalizeStoragePath.mockImplementation((path: string) => path);
    useSignedUrlMocks.uploadToPrivateBucket.mockReset();
  });

  it("validates payment slip metadata", () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "slip.jpg", {
      type: "image/jpeg",
    });

    expect(validatePaymentSlipFile(file)).toBeNull();
    expect(validatePaymentSlipFile(new File([file], "bad.html", { type: "text/html" }))).toBe(
      "รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF",
    );
  });

  it("builds a safe payment slip path from allowed ids", () => {
    expect(
      buildPaymentSlipPath({
        agreementId: "550e8400-e29b-41d4-a716-446655440000",
        kind: "transfer",
        entityId: "550e8400-e29b-41d4-a716-446655440000",
        fileType: "image/png",
        timestamp: 123,
      }),
    ).toBe("550e8400-e29b-41d4-a716-446655440000/transfer/550e8400-e29b-41d4-a716-446655440000-123.png");
  });

  it("rejects unsafe path segments when building or normalizing slip paths", () => {
    expect(() =>
      buildPaymentSlipPath({
        agreementId: "../admin",
        kind: "transfer",
        entityId: "550e8400-e29b-41d4-a716-446655440000",
        fileType: "image/jpeg",
      }),
    ).toThrow("Invalid payment slip agreementId");

    expect(normalizeAndValidatePaymentSlipPath("../admin")).toBeNull();
    expect(normalizeAndValidatePaymentSlipPath("a/b/../c")).toBeNull();
  });

  it("uploads only when the file signature matches the declared mime type", async () => {
    const validFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "slip.png", {
      type: "image/png",
    });

    useSignedUrlMocks.uploadToPrivateBucket.mockResolvedValueOnce({ path: "path.png" });

    await expect(
      uploadPaymentSlip({
        agreementId: "550e8400-e29b-41d4-a716-446655440000",
        kind: "installment",
        entityId: "550e8400-e29b-41d4-a716-446655440000",
        file: validFile,
      }),
    ).resolves.toEqual({ path: "path.png" });

    expect(useSignedUrlMocks.uploadToPrivateBucket).toHaveBeenCalledTimes(1);
  });

  it("rejects spoofed files before upload", async () => {
    const spoofedFile = new File([new TextEncoder().encode("<html>fake</html>")], "slip.jpg", {
      type: "image/jpeg",
    });

    await expect(
      uploadPaymentSlip({
        agreementId: "550e8400-e29b-41d4-a716-446655440000",
        kind: "reschedule",
        entityId: "550e8400-e29b-41d4-a716-446655440000",
        file: spoofedFile,
      }),
    ).resolves.toMatchObject({
      error: expect.any(Error),
    });

    expect(useSignedUrlMocks.uploadToPrivateBucket).not.toHaveBeenCalled();
  });

  it("rejects unsafe signed url paths", async () => {
    await expect(getPaymentSlipSignedUrl("../admin/evil.pdf", 300)).resolves.toBeNull();
    expect(useSignedUrlMocks.getSignedUrl).not.toHaveBeenCalled();
  });
});
