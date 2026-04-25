import { forwardRef } from "react";
import { thaiBahtText } from "@/utils/thaiNumber";

export const CONTRACT_TEMPLATE_VERSION = "v1.0";

const APPLE_SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Sukhumvit Set", Thonburi, Arial, system-ui, sans-serif';

export interface ContractParty {
  fullName: string;
  /** Full 13-digit Thai national ID. Legacy blobs may contain only last-4. */
  idCardNumber: string;
  address: string;
}

export interface ContractSignatureRecord {
  typedName: string;
  signedAtISO: string;
  ipAddress?: string | null;
  deviceId?: string | null;
}

export interface LoanContractData {
  agreementId: string;
  lender: ContractParty;
  borrower: ContractParty;
  principalAmount: number;
  totalAmount: number;
  interestRate: number;
  interestType: "none" | "flat" | "effective";
  numInstallments: number;
  frequency: "daily" | "weekly" | "monthly";
  startDate: string;
  loanPurpose: string;
  placeOfSigning: string;
  contractDateISO: string;
  installmentAmount: number;
  lenderSignature?: ContractSignatureRecord | null;
  borrowerSignature?: ContractSignatureRecord | null;
}

const FREQUENCY_LABEL: Record<LoanContractData["frequency"], string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543; // พ.ศ.
  return `${day} ${month} พ.ศ. ${year}`;
}

function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${formatThaiDate(iso)} เวลา ${time} น.`;
}

function maskIdCard(idCardNumber: string): string {
  const digits = (idCardNumber ?? "").replace(/\D/g, "");
  if (digits.length === 13) {
    // Show first digit + last 4, mask the rest: D-XXXX-XXXXX-XX-D
    return `${digits[0]}-XXXX-XXXXX-${digits.slice(9, 11)}-${digits.slice(11)}`;
  }
  if (digits.length === 4) {
    // Legacy: only last-4 stored
    return `X-XXXX-XXXXX-${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return "X-XXXX-XXXXX-XX-X";
}

/**
 * Renders an A4-styled Thai loan agreement (สัญญากู้ยืมเงิน).
 * The DOM produced here is what gets serialised → hashed → stored.
 * Keep markup deterministic — no random IDs, no Date.now().
 */
export const LoanContractTemplate = forwardRef<HTMLDivElement, { data: LoanContractData }>(
  ({ data }, ref) => {
    const interestClause = data.interestType === "none" || data.interestRate <= 0
      ? "โดยไม่มีดอกเบี้ย"
      : `อัตราดอกเบี้ยร้อยละ ${data.interestRate} ต่อปี (ไม่เกินร้อยละ 15 ต่อปี ตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 654)`;

    return (
      <div
        ref={ref}
        data-contract-root
        className="contract-page mx-auto bg-white text-black"
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "20mm 18mm",
          fontFamily: APPLE_SYSTEM_FONT,
          fontSize: "16px",
          lineHeight: 1.7,
          color: "#000",
        }}
      >
        <h1 style={{ textAlign: "center", fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>
          หนังสือสัญญากู้ยืมเงิน
        </h1>
        <p style={{ textAlign: "center", fontSize: "13px", color: "#444", marginBottom: "24px" }}>
          (ตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 653)
        </p>

        <p>
          ทำที่ <span style={{ borderBottom: "1px dotted #000", padding: "0 8px" }}>{data.placeOfSigning || "—"}</span>
          {" "}วันที่ <span style={{ borderBottom: "1px dotted #000", padding: "0 8px" }}>{formatThaiDate(data.contractDateISO)}</span>
        </p>

        <p style={{ marginTop: "16px" }}>
          สัญญานี้ทำขึ้นระหว่างคู่สัญญาทั้งสองฝ่าย ดังต่อไปนี้
        </p>

        <ol style={{ paddingLeft: "20px", marginTop: "8px" }}>
          <li style={{ marginBottom: "12px" }}>
            <strong>ผู้ให้กู้</strong>{" "}
            <span style={{ borderBottom: "1px dotted #000", padding: "0 6px" }}>{data.lender.fullName || "—"}</span>{" "}
            เลขประจำตัวประชาชน{" "}
            <span style={{ borderBottom: "1px dotted #000", padding: "0 6px" }}>{maskIdCard(data.lender.idCardNumber)}</span>{" "}
            ที่อยู่{" "}
            <span style={{ borderBottom: "1px dotted #000", padding: "0 6px" }}>{data.lender.address || "—"}</span>
            {" "}ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้ให้กู้"</strong>
          </li>
          <li>
            <strong>ผู้กู้</strong>{" "}
            <span style={{ borderBottom: "1px dotted #000", padding: "0 6px" }}>{data.borrower.fullName || "—"}</span>{" "}
            เลขประจำตัวประชาชน{" "}
            <span style={{ borderBottom: "1px dotted #000", padding: "0 6px" }}>{maskIdCard(data.borrower.idCardNumber)}</span>{" "}
            ที่อยู่{" "}
            <span style={{ borderBottom: "1px dotted #000", padding: "0 6px" }}>{data.borrower.address || "—"}</span>
            {" "}ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>"ผู้กู้"</strong>
          </li>
        </ol>

        <p style={{ marginTop: "16px" }}>
          คู่สัญญาทั้งสองฝ่ายตกลงกันมีข้อความดังต่อไปนี้
        </p>

        <p style={{ marginTop: "12px", textIndent: "24px" }}>
          <strong>ข้อ 1.</strong> ผู้กู้ได้รับเงินกู้จากผู้ให้กู้เป็นจำนวน{" "}
          <strong>{data.principalAmount.toLocaleString("en-US")} บาท</strong>{" "}
          (<em>{thaiBahtText(data.principalAmount)}</em>){" "}
          เพื่อ<span style={{ borderBottom: "1px dotted #000", padding: "0 6px" }}>{data.loanPurpose || "—"}</span>{" "}
          และผู้กู้ได้รับเงินจำนวนดังกล่าวจากผู้ให้กู้ครบถ้วนในวันทำสัญญานี้แล้ว
        </p>

        <p style={{ marginTop: "12px", textIndent: "24px" }}>
          <strong>ข้อ 2.</strong> ผู้กู้ตกลงชำระเงินกู้คืนให้แก่ผู้ให้กู้{" "}
          {interestClause} โดยมียอดรวมที่ต้องชำระทั้งสิ้น{" "}
          <strong>{data.totalAmount.toLocaleString("en-US")} บาท</strong>{" "}
          (<em>{thaiBahtText(data.totalAmount)}</em>)
        </p>

        <p style={{ marginTop: "12px", textIndent: "24px" }}>
          <strong>ข้อ 3.</strong> ผู้กู้ตกลงผ่อนชำระเป็นจำนวน{" "}
          <strong>{data.numInstallments} งวด</strong>{" "}
          แบบ{FREQUENCY_LABEL[data.frequency]} งวดละ{" "}
          <strong>{data.installmentAmount.toLocaleString("en-US")} บาท</strong>{" "}
          (<em>{thaiBahtText(data.installmentAmount)}</em>){" "}
          โดยเริ่มชำระงวดแรกในวันที่ <strong>{formatThaiDate(data.startDate)}</strong>
        </p>

        <p style={{ marginTop: "12px", textIndent: "24px" }}>
          <strong>ข้อ 4.</strong> หากผู้กู้ผิดนัดชำระงวดใดงวดหนึ่ง ผู้กู้ยินยอมให้ผู้ให้กู้
          เรียกร้องให้ชำระเงินที่ค้างชำระทั้งหมดได้ทันที พร้อมดอกเบี้ยผิดนัดในอัตราที่กฎหมายกำหนด
          และผู้กู้ยินยอมรับผิดชอบค่าใช้จ่ายในการทวงถามหรือดำเนินคดีตามที่เกิดขึ้นจริง
        </p>

        <p style={{ marginTop: "12px", textIndent: "24px" }}>
          <strong>ข้อ 5.</strong> สัญญานี้จัดทำในรูปแบบอิเล็กทรอนิกส์ผ่านแอปพลิเคชัน Budoverbills
          คู่สัญญาทั้งสองฝ่ายตกลงให้ลายมือชื่ออิเล็กทรอนิกส์
          (โดยการพิมพ์ชื่อยืนยันพร้อมการบันทึกข้อมูลการเข้าใช้งาน)
          มีผลผูกพันตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544
        </p>

        <p style={{ marginTop: "12px", textIndent: "24px" }}>
          <strong>ข้อ 6.</strong> คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความในสัญญานี้โดยตลอดแล้ว
          เห็นว่าถูกต้องตรงตามเจตนา จึงได้ลงลายมือชื่ออิเล็กทรอนิกส์ไว้เป็นหลักฐานต่อหน้ากันและกัน
        </p>

        {/* Signature blocks */}
        <div style={{ display: "flex", gap: "24px", marginTop: "48px" }}>
          <SignatureBlock label="ผู้ให้กู้" expectedName={data.lender.fullName} signature={data.lenderSignature} />
          <SignatureBlock label="ผู้กู้" expectedName={data.borrower.fullName} signature={data.borrowerSignature} />
        </div>

        <p style={{ marginTop: "32px", fontSize: "12px", color: "#555", textAlign: "center" }}>
          เอกสารฉบับนี้ออกโดยระบบ Budoverbills (เอกสารหมายเลข {data.agreementId})
        </p>
        <p style={{ fontSize: "11px", color: "#777", textAlign: "center", marginTop: "4px" }}>
          Budoverbills เป็นเครื่องมือบันทึกข้อตกลง ไม่ใช่คู่สัญญา
          ข้อพิพาทใดๆ ให้คู่สัญญาทั้งสองฝ่ายเป็นผู้รับผิดชอบโดยตรง
        </p>
      </div>
    );
  }
);
LoanContractTemplate.displayName = "LoanContractTemplate";

function SignatureBlock({
  label,
  expectedName,
  signature,
}: {
  label: string;
  expectedName: string;
  signature?: ContractSignatureRecord | null;
}) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div
        style={{
          height: "56px",
          borderBottom: "1px solid #000",
          marginBottom: "6px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          fontFamily: APPLE_SYSTEM_FONT,
          fontSize: "22px",
          paddingBottom: "4px",
        }}
      >
        {signature?.typedName ?? ""}
      </div>
      <p style={{ margin: 0, fontWeight: 600 }}>(ลงชื่อ) {label}</p>
      <p style={{ margin: 0, fontSize: "13px" }}>{expectedName || "—"}</p>
      {signature ? (
        <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#444" }}>
          ลงนามอิเล็กทรอนิกส์ {formatThaiDateTime(signature.signedAtISO)}
          <br />
          IP: {signature.ipAddress ?? "—"} | Device: {signature.deviceId ?? "—"}
        </p>
      ) : (
        <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#999" }}>(ยังไม่ได้ลงนาม)</p>
      )}
    </div>
  );
}
