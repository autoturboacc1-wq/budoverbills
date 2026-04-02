import { describe, expect, it } from "vitest";
import { generatePromptPayPayload } from "@/utils/promptpay";

describe("generatePromptPayPayload", () => {
  it("builds a PromptPay payload from a Thai phone number", () => {
    const payload = generatePromptPayPayload("081-234-5678", 123.45);

    expect(payload).toContain("29370016A00000067701011101130066812345678");
    expect(payload).toContain("5303764");
    expect(payload).toContain("5406123.45");
    expect(payload).toContain("5802TH6304");
    expect(payload).toMatch(/[0-9A-F]{4}$/);
  });

  it("builds a PromptPay payload from a national id without an amount", () => {
    const payload = generatePromptPayPayload("1234567890123");
    const payloadBody = payload.split("5802TH6304")[0];

    expect(payload).toContain("29370016A00000067701011102131234567890123");
    expect(payloadBody).not.toContain("54");
  });

  it("throws for unsupported PromptPay targets", () => {
    expect(() => generatePromptPayPayload("55555")).toThrow(
      "PromptPay รองรับเบอร์โทรศัพท์ 10 หลักหรือเลขบัตรประชาชน 13 หลัก",
    );
  });
});
