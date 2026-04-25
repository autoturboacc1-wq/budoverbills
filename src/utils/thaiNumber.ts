// Convert a number (with up to 2 decimal places) to its Thai-language reading.
// Used to render the principal amount of a loan contract in words, which is
// standard practice for Thai legal documents (สัญญากู้ยืมเงิน).
//
// Examples:
//   123        -> "หนึ่งร้อยยี่สิบสามบาทถ้วน"
//   1500.50    -> "หนึ่งพันห้าร้อยบาทห้าสิบสตางค์"
//   1000000    -> "หนึ่งล้านบาทถ้วน"

const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function readSixDigit(group: string): string {
  // group has 1-6 digits, read right-to-left
  const padded = group.padStart(6, "0");
  let out = "";
  for (let i = 0; i < padded.length; i++) {
    const d = parseInt(padded[i]!, 10);
    const place = padded.length - i - 1;

    if (d === 0) continue;

    let digitWord = DIGITS[d]!;

    // Tens place special cases:
    //  - 1 in tens place => "สิบ" (drop "หนึ่ง")
    //  - 2 in tens place => "ยี่สิบ"
    if (place === 1) {
      if (d === 1) digitWord = "";
      else if (d === 2) digitWord = "ยี่";
    }

    // Units place special case: trailing 1 after a 10s+ digit => "เอ็ด"
    if (place === 0 && d === 1 && padded.replace(/0+$/, "").length > 1) {
      digitWord = "เอ็ด";
    }

    out += digitWord + PLACES[place]!;
  }
  return out;
}

function readInteger(num: string): string {
  if (num === "" || /^0+$/.test(num)) return "ศูนย์";

  // Split into millions blocks (Thai reads each 6-digit block + "ล้าน")
  const blocks: string[] = [];
  let rest = num;
  while (rest.length > 6) {
    blocks.unshift(rest.slice(-6));
    rest = rest.slice(0, -6);
  }
  blocks.unshift(rest);

  let out = "";
  blocks.forEach((block, idx) => {
    const isLast = idx === blocks.length - 1;
    if (/^0+$/.test(block) && !isLast) {
      // empty middle block — still need "ล้าน" placeholder
      out += "ล้าน";
      return;
    }
    if (/^0+$/.test(block)) return;
    out += readSixDigit(block);
    if (!isLast) out += "ล้าน";
  });

  return out;
}

export function thaiBahtText(amount: number): string {
  if (!Number.isFinite(amount)) return "";

  const negative = amount < 0;
  const abs = Math.abs(amount);

  // Round to 2 decimal places to handle float noise
  const rounded = Math.round(abs * 100) / 100;
  const [intPart, decPartRaw = ""] = rounded.toFixed(2).split(".");
  const decPart = decPartRaw.padEnd(2, "0").slice(0, 2);

  const bahtWord = readInteger(intPart!);
  const satangNum = parseInt(decPart, 10);

  let result = `${bahtWord}บาท`;
  if (satangNum === 0) {
    result += "ถ้วน";
  } else {
    result += `${readInteger(decPart)}สตางค์`;
  }

  return negative ? `ลบ${result}` : result;
}
