// List of Thai banks for dropdown selection
export const THAI_BANKS = [
  { value: "kbank", label: "ธนาคารกสิกรไทย (KBANK)" },
  { value: "scb", label: "ธนาคารไทยพาณิชย์ (SCB)" },
  { value: "bbl", label: "ธนาคารกรุงเทพ (BBL)" },
  { value: "ktb", label: "ธนาคารกรุงไทย (KTB)" },
  { value: "bay", label: "ธนาคารกรุงศรีอยุธยา (BAY)" },
  { value: "ttb", label: "ธนาคารทหารไทยธนชาต (TTB)" },
  { value: "cimb", label: "ธนาคารซีไอเอ็มบีไทย (CIMB)" },
  { value: "uob", label: "ธนาคารยูโอบี (UOB)" },
  { value: "tisco", label: "ธนาคารทิสโก้ (TISCO)" },
  { value: "kk", label: "ธนาคารเกียรตินาคินภัทร (KK)" },
  { value: "lhb", label: "ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)" },
  { value: "gsb", label: "ธนาคารออมสิน (GSB)" },
  { value: "ghb", label: "ธนาคารอาคารสงเคราะห์ (GHB)" },
  { value: "baac", label: "ธ.ก.ส. (BAAC)" },
  { value: "promptpay", label: "พร้อมเพย์ (PromptPay)" },
] as const;

export type ThaiBank = typeof THAI_BANKS[number]["value"];
