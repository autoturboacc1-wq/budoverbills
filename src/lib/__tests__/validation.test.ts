import { describe, expect, it } from "vitest";

import { getBankAccountError, isValidBankAccount } from "@/lib/validation";

describe("bank account validation", () => {
  it("accepts 10-digit bank account numbers", () => {
    expect(isValidBankAccount("1234567890")).toBe(true);
    expect(getBankAccountError("kbank", "1234567890")).toBeNull();
  });

  it("accepts 12-digit bank account numbers for supported banks", () => {
    expect(isValidBankAccount("123456789012")).toBe(true);
    expect(getBankAccountError("gsb", "123456789012")).toBeNull();
  });

  it("rejects unsupported bank account lengths", () => {
    expect(isValidBankAccount("123456789")).toBe(false);
    expect(getBankAccountError("scb", "123456789")).toBe("เลขบัญชีธนาคารต้องเป็นตัวเลข 10 หรือ 12 หลัก");
  });
});
