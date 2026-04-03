const THAI_PHONE_DIGITS = 10;
const THAI_PROMPTPAY_ID_DIGITS = 13;
const THAI_BANK_ACCOUNT_DIGITS = 10;
const DISPLAY_NAME_MAX_LENGTH = 50;
const DISPLAY_NAME_ALLOWED_CHARS = /^[\p{L}\p{N}\p{M}\s.'_-]+$/u;

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidThaiPhone(value: string): boolean {
  const digits = normalizeDigits(value);
  return digits.length === THAI_PHONE_DIGITS && digits.startsWith("0");
}

export function getThaiPhoneError(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  return isValidThaiPhone(value) ? null : "เบอร์โทรศัพท์ต้องเป็นเลข 10 หลักและขึ้นต้นด้วย 0";
}

export function isValidPromptPay(value: string): boolean {
  const digits = normalizeDigits(value);
  return (
    (digits.length === THAI_PHONE_DIGITS && digits.startsWith("0")) ||
    digits.length === THAI_PROMPTPAY_ID_DIGITS
  );
}

export function isValidBankAccount(value: string): boolean {
  return normalizeDigits(value).length === THAI_BANK_ACCOUNT_DIGITS;
}

export function getBankAccountError(bankName: string, value: string): string | null {
  if (!bankName || !value.trim()) {
    return "กรุณากรอกข้อมูลให้ครบ";
  }

  if (bankName === "promptpay") {
    return isValidPromptPay(value)
      ? null
      : "พร้อมเพย์ต้องเป็นเบอร์ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก";
  }

  return isValidBankAccount(value)
    ? null
    : "เลขบัญชีธนาคารต้องเป็นตัวเลข 10 หลัก";
}

export function normalizeBankAccountForStorage(bankName: string, value: string): string {
  const digits = normalizeDigits(value);

  if (bankName === "promptpay" && digits.length === THAI_PHONE_DIGITS) {
    return digits;
  }

  return digits;
}

export function getDisplayNameError(value: string): string | null {
  const displayName = normalizeDisplayName(value);

  if (!displayName) {
    return "กรุณากรอกชื่อที่แสดง";
  }

  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return "ชื่อที่แสดงต้องไม่เกิน 50 ตัวอักษร";
  }

  if (!DISPLAY_NAME_ALLOWED_CHARS.test(displayName)) {
    return "ชื่อที่แสดงใช้ได้เฉพาะตัวอักษร ตัวเลข ช่องว่าง และ . _ -";
  }

  return null;
}
