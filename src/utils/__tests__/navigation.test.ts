import { describe, expect, it } from "vitest";

import { getSafeInternalPath, getSafeNotificationTarget, isSafeInternalPath } from "@/utils/navigation";

describe("navigation utils", () => {
  it("allows only safe internal paths", () => {
    expect(isSafeInternalPath("/profile")).toBe(true);
    expect(isSafeInternalPath("/chat/123")).toBe(true);
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("/\\evil.com")).toBe(false);
    expect(isSafeInternalPath("/bad path")).toBe(false);
  });

  it("falls back when a path is unsafe after decoding", () => {
    expect(getSafeInternalPath("/notifications")).toBe("/notifications");
    expect(getSafeInternalPath("/%5Cevil.com", "/")).toBe("/");
  });

  it("rejects non-uuid notification ids for interpolated routes", () => {
    expect(
      getSafeNotificationTarget({
        action_url: null,
        related_id: "../admin",
        related_type: "chat",
      }),
    ).toBeNull();

    expect(
      getSafeNotificationTarget({
        action_url: null,
        related_id: "550e8400-e29b-41d4-a716-446655440000",
        related_type: "agreement",
      }),
    ).toBe("/debt/550e8400-e29b-41d4-a716-446655440000");
  });
});
