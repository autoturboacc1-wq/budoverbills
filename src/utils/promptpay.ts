function tlv(tag: string, value: string): string {
  return `${tag}${value.length.toString().padStart(2, "0")}${value}`;
}

export function crc16(data: string): string {
  let crc = 0xffff;

  for (let index = 0; index < data.length; index += 1) {
    crc ^= data.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }

  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function normalizePromptPayTarget(target: string): { accountType: "01" | "02"; value: string } {
  const sanitized = target.replace(/\D/g, "");

  if (sanitized.length === 13) {
    return {
      accountType: "02",
      value: sanitized,
    };
  }

  if (sanitized.length === 10 && /^0[6789]\d{8}$/.test(sanitized)) {
    return {
      accountType: "01",
      value: `0066${sanitized.slice(1)}`,
    };
  }

  throw new Error(
    "PromptPay รองรับเบอร์โทรศัพท์มือถือ 10 หลัก (ขึ้นต้นด้วย 06, 07, 08 หรือ 09) หรือเลขบัตรประชาชน 13 หลัก",
  );
}

export function generatePromptPayPayload(target: string, amount?: number): string {
  const { accountType, value } = normalizePromptPayTarget(target);

  const merchantAccount = tlv("00", "A000000677010111") + tlv(accountType, value);
  const formattedAmount =
    typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ? tlv("54", amount.toFixed(2))
      : "";

  const payloadWithoutCrc =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("29", merchantAccount) +
    tlv("53", "764") +
    formattedAmount +
    tlv("58", "TH") +
    "6304";

  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
}
