import { describe, it, expect } from "vitest";
import { thaiBahtText } from "./thaiNumber";

describe("thaiBahtText", () => {
  it("reads zero", () => {
    expect(thaiBahtText(0)).toBe("ศูนย์บาทถ้วน");
  });

  it("reads single digits", () => {
    expect(thaiBahtText(1)).toBe("หนึ่งบาทถ้วน");
    expect(thaiBahtText(7)).toBe("เจ็ดบาทถ้วน");
  });

  it("uses เอ็ด for trailing 1 in tens+ numbers", () => {
    expect(thaiBahtText(11)).toBe("สิบเอ็ดบาทถ้วน");
    expect(thaiBahtText(21)).toBe("ยี่สิบเอ็ดบาทถ้วน");
    expect(thaiBahtText(101)).toBe("หนึ่งร้อยเอ็ดบาทถ้วน");
  });

  it("uses ยี่สิบ for 20s", () => {
    expect(thaiBahtText(20)).toBe("ยี่สิบบาทถ้วน");
    expect(thaiBahtText(25)).toBe("ยี่สิบห้าบาทถ้วน");
  });

  it("drops หนึ่ง before สิบ", () => {
    expect(thaiBahtText(10)).toBe("สิบบาทถ้วน");
    expect(thaiBahtText(15)).toBe("สิบห้าบาทถ้วน");
  });

  it("reads hundreds and thousands", () => {
    expect(thaiBahtText(123)).toBe("หนึ่งร้อยยี่สิบสามบาทถ้วน");
    expect(thaiBahtText(1500)).toBe("หนึ่งพันห้าร้อยบาทถ้วน");
  });

  it("reads millions", () => {
    expect(thaiBahtText(1_000_000)).toBe("หนึ่งล้านบาทถ้วน");
    expect(thaiBahtText(2_500_000)).toBe("สองล้านห้าแสนบาทถ้วน");
  });

  it("reads satang", () => {
    expect(thaiBahtText(1500.5)).toBe("หนึ่งพันห้าร้อยบาทห้าสิบสตางค์");
    expect(thaiBahtText(0.25)).toBe("ศูนย์บาทยี่สิบห้าสตางค์");
  });
});
