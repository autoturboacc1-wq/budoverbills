import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { registerThaiFont } from "./pdfFont";

interface PaymentBucketSummary {
  paid: number;
  pending: number;
  total: number;
}

interface AgreementPDFData {
  agreementId: string;
  agreementStatus: string;
  principalAmount: number;
  totalAmount: number;
  interestRate: number;
  interestType: string;
  numInstallments: number;
  frequency: string;
  startDate: string;
  description?: string;
  lenderName: string;
  lenderConfirmedAt?: string;
  lenderConfirmedIP?: string;
  lenderConfirmedDevice?: string;
  borrowerName: string;
  borrowerConfirmedAt?: string;
  borrowerConfirmedIP?: string;
  borrowerConfirmedDevice?: string;
  paymentSummary: {
    principal: PaymentBucketSummary;
    interest: PaymentBucketSummary;
    fee: PaymentBucketSummary;
    overall: PaymentBucketSummary;
  };
  rescheduleInfo?: string;
  installments: Array<{
    installmentNumber: number;
    dueDate: string;
    amount: number;
    principalAmount: number;
    interestAmount: number;
    displayStatus: string;
    paidAt?: string;
  }>;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
};

const INTEREST_TYPE_LABELS: Record<string, string> = {
  none: "ไม่มีดอกเบี้ย",
  flat: "ดอกเบี้ยคงที่",
  effective: "ดอกเบี้ยลดต้นลดดอก",
};

const STATUS_LABELS: Record<string, string> = {
  active: "กำลังใช้งาน",
  pending_confirmation: "รอยืนยัน",
  completed: "ปิดครบแล้ว",
  cancelled: "ยกเลิกแล้ว",
  rescheduling: "กำลังเลื่อนงวด",
  paid: "ชำระแล้ว",
  pending: "รอชำระ",
  overdue: "เกินกำหนด",
  rescheduled: "เลื่อนงวดแล้ว",
  rejected: "สลิปถูกตีกลับ",
  verifying: "รอตรวจสลิป",
};

function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "-";
  }

  return `฿${Number(amount).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;

  try {
    const parsed = parseISO(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  } catch {
    // Fall through to native parser.
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDateOnly(value: string | undefined): string {
  const parsed = parseDate(value);
  if (!parsed) {
    return "-";
  }

  return format(parsed, "d MMM yyyy", { locale: th });
}

function formatDateTime(value: string | undefined): string {
  const parsed = parseDate(value);
  if (!parsed) {
    return "-";
  }

  return format(parsed, "d MMM yyyy HH:mm", { locale: th });
}

function truncateText(value: string | undefined, maxLength = 90): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export async function generateAgreementPDF(data: AgreementPDFData): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const fontFamily = await registerThaiFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 18;
  let y = 18;

  const paidInstallments = data.installments.filter((installment) => installment.displayStatus === "paid");
  const progressPercent = data.numInstallments > 0
    ? (paidInstallments.length / data.numInstallments) * 100
    : 0;

  const setFont = (style: "normal" | "bold", size: number, color = 24) => {
    doc.setFont(fontFamily, style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= bottomLimit) {
      return;
    }

    doc.addPage();
    y = 18;
  };

  const addText = (
    text: string,
    x: number,
    yPosition: number,
    options?: {
      align?: "left" | "center" | "right";
      size?: number;
      style?: "normal" | "bold";
      color?: number;
    },
  ) => {
    setFont(options?.style ?? "normal", options?.size ?? 10, options?.color ?? 24);

    if (options?.align === "center") {
      doc.text(text, pageWidth / 2, yPosition, { align: "center" });
      return;
    }

    if (options?.align === "right") {
      doc.text(text, pageWidth - margin, yPosition, { align: "right" });
      return;
    }

    doc.text(text, x, yPosition);
  };

  const addRightText = (
    text: string,
    rightX: number,
    yPosition: number,
    options?: {
      size?: number;
      style?: "normal" | "bold";
      color?: number;
    },
  ) => {
    setFont(options?.style ?? "normal", options?.size ?? 10, options?.color ?? 24);
    doc.text(text, rightX, yPosition, { align: "right" });
  };

  const addWrappedText = (
    text: string,
    x: number,
    yPosition: number,
    maxWidth: number,
    options?: {
      size?: number;
      style?: "normal" | "bold";
      color?: number;
      lineHeight?: number;
    },
  ) => {
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineHeight = options?.lineHeight ?? 4.2;
    const requiredHeight = lines.length * lineHeight;

    ensureSpace(requiredHeight + 2);

    setFont(options?.style ?? "normal", options?.size ?? 9, options?.color ?? 24);
    doc.text(lines, x, yPosition);

    return requiredHeight;
  };

  const drawRule = () => {
    doc.setDrawColor(225, 229, 236);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  const drawSectionTitle = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 14 : 8);
    addText(title, margin, y, { size: 12, style: "bold" });
    y += 5;

    if (subtitle) {
      addText(subtitle, margin, y, { size: 8, color: 105 });
      y += 4;
    }
  };

  const drawMetricCard = (
    x: number,
    width: number,
    label: string,
    value: string,
    accent: [number, number, number],
  ) => {
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.roundedRect(x, y, width, 18, 3, 3, "F");
    setFont("normal", 8, 255);
    doc.text(label, x + 3, y + 5.5);
    setFont("bold", 11, 255);
    doc.text(value, x + 3, y + 12.3);
  };

  const drawLabeledValue = (label: string, value: string, valueWidth = contentWidth - 32) => {
    ensureSpace(8);
    addText(label, margin, y, { size: 8, style: "bold", color: 96 });
    const consumedHeight = addWrappedText(value, margin + 32, y, valueWidth, {
      size: 9,
      lineHeight: 4.2,
    });
    y += Math.max(consumedHeight, 4.2) + 1.2;
  };

  const drawSummaryRow = (label: string, summary: PaymentBucketSummary, emphasize = false) => {
    ensureSpace(7);
    const color = emphasize ? 20 : 60;
    addText(label, margin, y, { size: emphasize ? 9 : 8.5, style: emphasize ? "bold" : "normal", color });
    addRightText(formatMoney(summary.paid), margin + 86, y, {
      size: emphasize ? 9 : 8.5,
      style: emphasize ? "bold" : "normal",
      color: emphasize ? 20 : 34,
    });
    addRightText(formatMoney(summary.pending), margin + 132, y, {
      size: emphasize ? 9 : 8.5,
      style: emphasize ? "bold" : "normal",
      color: emphasize ? 20 : 34,
    });
    addRightText(formatMoney(summary.total), pageWidth - margin, y, {
      size: emphasize ? 9 : 8.5,
      style: emphasize ? "bold" : "normal",
      color: emphasize ? 20 : 34,
    });
    y += 5.8;
  };

  const drawAuditCard = (
    x: number,
    width: number,
    title: string,
    name: string,
    confirmedAt?: string,
    confirmedIP?: string,
    confirmedDevice?: string,
  ) => {
    const details = [
      `ชื่อ: ${truncateText(name, 34) ?? "-"}`,
      `ยืนยันเมื่อ: ${formatDateTime(confirmedAt)}`,
      `IP: ${confirmedIP ?? "-"}`,
      `อุปกรณ์: ${truncateText(confirmedDevice, 40) ?? "-"}`,
    ];
    const wrappedDetailLines = details.flatMap((detail) => doc.splitTextToSize(detail, width - 6));
    const cardHeight = Math.max(31, 10 + wrappedDetailLines.length * 3.8 + 5);

    ensureSpace(cardHeight + 2);
    const cardY = y;

    doc.setFillColor(247, 248, 250);
    doc.roundedRect(x, cardY, width, cardHeight, 3, 3, "F");

    addText(title, x + 3, cardY + 5.3, { size: 8, style: "bold", color: 90 });

    let detailY = cardY + 10.5;
    wrappedDetailLines.forEach((line) => {
      addText(line, x + 3, detailY, { size: 8, color: 55 });
      detailY += 3.8;
    });

    return cardHeight;
  };

  const drawTableHeader = () => {
    doc.setFillColor(28, 45, 82);
    doc.rect(margin, y, contentWidth, 7.5, "F");
    addText("งวด", margin + 3, y + 4.9, { size: 7.5, style: "bold", color: 255 });
    addText("ครบกำหนด", margin + 15, y + 4.9, { size: 7.5, style: "bold", color: 255 });
    addText("เงินต้น", margin + 52, y + 4.9, { size: 7.5, style: "bold", color: 255 });
    addText("ดอกเบี้ย/ค่าเลื่อน", margin + 78, y + 4.9, { size: 7.5, style: "bold", color: 255 });
    addText("ยอดงวด", margin + 118, y + 4.9, { size: 7.5, style: "bold", color: 255 });
    addText("สถานะ", margin + 144, y + 4.9, { size: 7.5, style: "bold", color: 255 });
    y += 9;
  };

  const drawFooter = () => {
    const pageCount = doc.getNumberOfPages();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      doc.setPage(pageNumber);
      doc.setDrawColor(225, 228, 232);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      addText("BudOverBills • สรุปข้อตกลงการกู้ยืม", margin, pageHeight - 7, {
        size: 7,
        color: 120,
      });
      addText(`หน้า ${pageNumber} / ${pageCount}`, margin, pageHeight - 7, {
        align: "right",
        size: 7,
        color: 120,
      });
    }
  };

  doc.setFillColor(22, 54, 95);
  doc.roundedRect(margin, y - 6, contentWidth, 28, 4, 4, "F");
  addText("สรุปข้อตกลงการกู้ยืม", margin + 4, y + 2.5, {
    size: 16,
    style: "bold",
    color: 255,
  });
  addText("ข้อมูลสรุปยอดและสถานะการชำระ ณ วันที่ส่งออก", margin + 4, y + 8.8, {
    size: 9,
    color: 226,
  });
  addText(`รหัสข้อตกลง ${data.agreementId.slice(0, 8).toUpperCase()}`, margin + 4, y + 15.3, {
    size: 8,
    color: 216,
  });
  addText(`สร้างเมื่อ ${format(new Date(), "d MMM yyyy HH:mm", { locale: th })}`, margin, y + 15.3, {
    align: "right",
    size: 8,
    color: 216,
  });
  addText(`สถานะปัจจุบัน: ${STATUS_LABELS[data.agreementStatus] ?? data.agreementStatus}`, margin + 4, y + 21.4, {
    size: 8,
    color: 216,
  });
  y += 30;

  drawSectionTitle("ภาพรวม");
  const gap = 3;
  const cardWidth = (contentWidth - gap * 3) / 4;
  drawMetricCard(margin, cardWidth, "ยอดตามสัญญา", formatMoney(data.totalAmount), [34, 94, 168]);
  drawMetricCard(
    margin + cardWidth + gap,
    cardWidth,
    "ชำระแล้ว",
    formatMoney(data.paymentSummary.overall.paid),
    [15, 158, 103],
  );
  drawMetricCard(
    margin + (cardWidth + gap) * 2,
    cardWidth,
    "ยอดคงเหลือ",
    formatMoney(data.paymentSummary.overall.pending),
    [234, 88, 12],
  );
  drawMetricCard(
    margin + (cardWidth + gap) * 3,
    cardWidth,
    "ความคืบหน้า",
    `${paidInstallments.length}/${data.numInstallments} งวด`,
    [97, 76, 175],
  );
  y += 22;

  ensureSpace(13);
  addText("สัดส่วนการชำระ", margin, y, { size: 8, style: "bold", color: 96 });
  doc.setFillColor(232, 236, 242);
  doc.roundedRect(margin, y + 2, contentWidth, 5.5, 2, 2, "F");
  doc.setFillColor(24, 123, 88);
  doc.roundedRect(margin, y + 2, contentWidth * Math.min(Math.max(progressPercent, 0), 100) / 100, 5.5, 2, 2, "F");
  addText(`${progressPercent.toFixed(0)}%`, margin, y + 12, { size: 8, color: 88 });
  y += 17;

  drawRule();
  drawSectionTitle("ข้อมูลข้อตกลง");
  drawLabeledValue("ผู้ให้ยืม", data.lenderName);
  drawLabeledValue("ผู้ยืม", data.borrowerName);
  drawLabeledValue("เงินต้น", formatMoney(data.principalAmount));
  drawLabeledValue("ดอกเบี้ย", `${data.interestRate}% (${INTEREST_TYPE_LABELS[data.interestType] ?? data.interestType})`);
  drawLabeledValue("ความถี่การชำระ", FREQUENCY_LABELS[data.frequency] ?? data.frequency);
  drawLabeledValue("วันเริ่มงวดแรก", formatDateOnly(data.startDate));
  drawLabeledValue("จำนวนงวด", `${data.numInstallments} งวด`);
  if (data.description) {
    drawLabeledValue("หมายเหตุ", data.description);
  }
  if (data.rescheduleInfo) {
    drawLabeledValue("เงื่อนไขเลื่อนงวด", data.rescheduleInfo);
  }

  drawRule();
  drawSectionTitle("สรุปยอดชำระ");
  addText("รายการ", margin, y, { size: 8, style: "bold", color: 96 });
  addRightText("จ่ายแล้ว", margin + 86, y, { size: 8, style: "bold", color: 96 });
  addRightText("คงเหลือ", margin + 132, y, { size: 8, style: "bold", color: 96 });
  addRightText("รวม", pageWidth - margin, y, { size: 8, style: "bold", color: 96 });
  y += 6;
  drawSummaryRow("เงินต้น", data.paymentSummary.principal);
  if (data.paymentSummary.interest.total > 0) {
    drawSummaryRow("ดอกเบี้ย", data.paymentSummary.interest);
  }
  if (data.paymentSummary.fee.total > 0) {
    drawSummaryRow("ค่าเลื่อนงวด", data.paymentSummary.fee);
  }
  doc.setDrawColor(225, 229, 236);
  doc.line(margin, y - 1.8, pageWidth - margin, y - 1.8);
  drawSummaryRow("รวมทั้งหมด", data.paymentSummary.overall, true);

  drawRule();
  drawSectionTitle("ตารางงวด", "ตัวเลขในตารางนี้ใช้สถานะเดียวกับหน้ารายละเอียดหนี้");
  drawTableHeader();

  data.installments.forEach((installment, index) => {
    const rowHeight = installment.paidAt ? 7.9 : 4.5;
    const beforeY = y;
    ensureSpace(rowHeight);
    if (y !== beforeY) {
      // ensureSpace caused a page break — repeat the table header on the new page.
      drawSectionTitle("ตารางงวด (ต่อ)");
      drawTableHeader();
    }

    if (index % 2 === 0) {
      doc.setFillColor(247, 248, 250);
      doc.rect(margin, y - 4.3, contentWidth, 7.1, "F");
    }

    addText(String(installment.installmentNumber), margin + 3, y, { size: 7.5 });
    addText(formatDateOnly(installment.dueDate), margin + 15, y, { size: 7.5 });
    addText(formatMoney(installment.principalAmount), margin + 52, y, { size: 7.5 });
    addText(formatMoney(installment.interestAmount), margin + 78, y, { size: 7.5 });
    addText(formatMoney(installment.amount), margin + 118, y, { size: 7.5 });
    addText(STATUS_LABELS[installment.displayStatus] ?? installment.displayStatus, margin + 144, y, {
      size: 7.5,
      style: installment.displayStatus === "paid" ? "bold" : "normal",
      color: installment.displayStatus === "overdue" || installment.displayStatus === "rejected" ? 176 : 24,
    });
    y += 4.5;

    if (installment.paidAt) {
      addText(`ชำระเมื่อ ${formatDateTime(installment.paidAt)}`, margin + 144, y, {
        size: 6.5,
        color: 110,
      });
      y += 3.4;
    }
  });

  drawRule();
  drawSectionTitle("หลักฐานการยืนยัน");
  const auditCardWidth = (contentWidth - 4) / 2;
  const lenderCardHeight = drawAuditCard(
    margin,
    auditCardWidth,
    "ผู้ให้ยืม",
    data.lenderName,
    data.lenderConfirmedAt,
    data.lenderConfirmedIP,
    data.lenderConfirmedDevice,
  );
  const borrowerCardHeight = drawAuditCard(
    margin + auditCardWidth + 4,
    auditCardWidth,
    "ผู้ยืม",
    data.borrowerName,
    data.borrowerConfirmedAt,
    data.borrowerConfirmedIP,
    data.borrowerConfirmedDevice,
  );
  y += Math.max(lenderCardHeight, borrowerCardHeight) + 5;

  drawRule();
  drawSectionTitle("หมายเหตุทางระบบ");
  const legalText =
    "เอกสารนี้เป็นสรุปข้อมูลจาก BudOverBills เพื่อใช้ทบทวนยอดหนี้ สถานะการชำระ และประวัติการยืนยันของคู่สัญญา " +
    "โดยตัวแพลตฟอร์มไม่ใช่คู่สัญญาและไม่ใช่ผู้ค้ำประกันหนี้ หากมีข้อพิพาทควรตรวจร่วมกับสัญญาในระบบและหลักฐานการโอนเงินที่เกี่ยวข้อง";
  y += addWrappedText(legalText, margin, y, contentWidth, {
    size: 8,
    color: 95,
    lineHeight: 4,
  });
  y += 4;
  addText(`ส่งออกเมื่อ ${format(new Date(), "d MMMM yyyy HH:mm:ss", { locale: th })}`, margin, y, {
    size: 7,
    color: 120,
  });

  drawFooter();

  return doc.output("blob");
}

export async function downloadPDF(blob: Blob, filename: string): Promise<void> {
  // Try the Web Share API first when running as an installed PWA on iOS — that is
  // the only reliable way to surface a "save to Files" prompt from a standalone
  // window. canShare() must be checked because not every iOS build supports
  // sharing files.
  const isStandalonePwa =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)));

  if (isStandalonePwa && typeof navigator !== "undefined" && navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch {
      // Fall through to the anchor-download path.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke after a tick so the browser has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
