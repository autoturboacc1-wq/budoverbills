import { jsPDF } from "jspdf";
import { format } from "date-fns";

interface AgreementPDFData {
  agreementId: string;
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
  installments: Array<{
    installmentNumber: number;
    dueDate: string;
    amount: number;
    status: string;
    paidAt?: string;
  }>;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const INTEREST_TYPE_LABELS: Record<string, string> = {
  none: "No interest",
  flat: "Flat rate",
  effective: "Effective rate",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  overdue: "Overdue",
  rescheduled: "Rescheduled",
};

function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "-";
  }

  return `${Number(amount).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} THB`;
}

function formatDateOnly(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return format(new Date(value), "d MMM yyyy");
}

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return format(new Date(value), "d MMM yyyy HH:mm:ss");
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

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 20;
  let y = 18;

  const setFont = (style: "normal" | "bold", size: number, color = 20) => {
    doc.setFont("helvetica", style);
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
    setFont(options?.style ?? "normal", options?.size ?? 10, options?.color ?? 20);

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
    const drawY = yPosition === y ? y : yPosition;

    setFont(options?.style ?? "normal", options?.size ?? 9, options?.color ?? 20);
    doc.text(lines, x, drawY);

    return requiredHeight;
  };

  const drawRule = () => {
    doc.setDrawColor(220, 224, 230);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  const drawSectionTitle = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 16 : 10);
    addText(title, margin, y, { size: 12, style: "bold" });
    y += 5;

    if (subtitle) {
      addText(subtitle, margin, y, { size: 8, color: 110 });
      y += 4;
    }
  };

  const drawMetricCard = (
    x: number,
    cardWidth: number,
    label: string,
    value: string,
    accent: [number, number, number],
  ) => {
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.roundedRect(x, y, cardWidth, 18, 3, 3, "F");
    setFont("normal", 8, 255);
    doc.text(label.toUpperCase(), x + 3, y + 5.5);
    setFont("bold", 11, 255);
    doc.text(value, x + 3, y + 12.5);
  };

  const drawLabeledValue = (label: string, value: string, valueWidth = contentWidth - 38) => {
    ensureSpace(8);
    addText(label, margin, y, { size: 8, style: "bold", color: 90 });
    const consumedHeight = addWrappedText(value, margin + 38, y, valueWidth, {
      size: 9,
      lineHeight: 4.4,
    });
    y += Math.max(consumedHeight, 4.4) + 1.5;
  };

  const drawPartyCard = (
    x: number,
    width: number,
    title: string,
    name: string,
    details: string[],
  ) => {
    const displayName = truncateText(name, 32) ?? "Not specified";
    const detailLines = details.flatMap((detail) => doc.splitTextToSize(detail, width - 6));
    const cardHeight = Math.max(34, 17 + detailLines.length * 3.8 + 5);

    ensureSpace(cardHeight + 2);
    const cardY = y;

    doc.setFillColor(247, 248, 250);
    doc.roundedRect(x, cardY, width, cardHeight, 3, 3, "F");

    setFont("bold", 8, 90);
    doc.text(title.toUpperCase(), x + 3, cardY + 5.5);

    setFont("bold", 11, 20);
    doc.text(displayName, x + 3, cardY + 12);

    setFont("normal", 8, 80);
    let detailY = cardY + 17;
    details.forEach((detail) => {
      const wrapped = doc.splitTextToSize(detail, width - 6);
      doc.text(wrapped, x + 3, detailY);
      detailY += wrapped.length * 3.8;
    });

    return cardHeight;
  };

  const drawTableHeader = () => {
    doc.setFillColor(32, 42, 68);
    doc.rect(margin, y, contentWidth, 7, "F");
    addText("#", margin + 3, y + 4.7, { size: 8, style: "bold", color: 255 });
    addText("Due date", margin + 14, y + 4.7, { size: 8, style: "bold", color: 255 });
    addText("Amount", margin + 58, y + 4.7, { size: 8, style: "bold", color: 255 });
    addText("Status", margin + 100, y + 4.7, { size: 8, style: "bold", color: 255 });
    addText("Paid at", margin + 136, y + 4.7, { size: 8, style: "bold", color: 255 });
    y += 9;
  };

  const drawFooter = () => {
    const pageCount = doc.getNumberOfPages();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      doc.setPage(pageNumber);
      doc.setDrawColor(225, 228, 232);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      addText("BudOverBills agreement record", margin, pageHeight - 7, {
        size: 7,
        color: 120,
      });
      addText(`Page ${pageNumber} / ${pageCount}`, margin, pageHeight - 7, {
        align: "right",
        size: 7,
        color: 120,
      });
    }
  };

  const paidInstallments = data.installments.filter((installment) => installment.status === "paid");
  const unpaidInstallments = data.installments.filter((installment) => installment.status !== "paid");
  const remainingBalance = unpaidInstallments.reduce((sum, installment) => sum + installment.amount, 0);

  doc.setFillColor(24, 54, 96);
  doc.roundedRect(margin, y - 6, contentWidth, 24, 4, 4, "F");
  addText("BUDOVERBILLS AGREEMENT RECORD", margin + 4, y + 2, {
    size: 16,
    style: "bold",
    color: 255,
  });
  addText("Electronic loan summary with repayment trail", margin + 4, y + 8, {
    size: 9,
    color: 230,
  });
  addText(`Agreement ID: ${data.agreementId.slice(0, 8).toUpperCase()}`, margin + 4, y + 15, {
    size: 8,
    color: 215,
  });
  addText(`Generated: ${format(new Date(), "d MMM yyyy HH:mm")}`, margin, y + 15, {
    align: "right",
    size: 8,
    color: 215,
  });
  y += 24;

  drawSectionTitle("Snapshot", "Key commercial terms and repayment position");
  const gap = 3;
  const cardWidth = (contentWidth - gap * 3) / 4;
  drawMetricCard(margin, cardWidth, "Principal", formatMoney(data.principalAmount), [40, 111, 180]);
  drawMetricCard(margin + cardWidth + gap, cardWidth, "Total", formatMoney(data.totalAmount), [16, 185, 129]);
  drawMetricCard(
    margin + (cardWidth + gap) * 2,
    cardWidth,
    "Remaining",
    formatMoney(remainingBalance),
    [234, 88, 12],
  );
  drawMetricCard(
    margin + (cardWidth + gap) * 3,
    cardWidth,
    "Installments",
    `${paidInstallments.length}/${data.installments.length} paid`,
    [97, 76, 175],
  );
  y += 24;

  drawRule();
  drawSectionTitle("Parties & Confirmation", "Digital evidence captured at agreement confirmation");

  const partyCardWidth = (contentWidth - 4) / 2;
  const lenderCardHeight = drawPartyCard(margin, partyCardWidth, "Lender", data.lenderName, [
    `Confirmed at: ${formatDateTime(data.lenderConfirmedAt)}`,
    `IP: ${data.lenderConfirmedIP ?? "-"}`,
    `Device: ${truncateText(data.lenderConfirmedDevice) ?? "-"}`,
  ]);
  const borrowerCardHeight = drawPartyCard(margin + partyCardWidth + 4, partyCardWidth, "Borrower", data.borrowerName, [
    `Confirmed at: ${formatDateTime(data.borrowerConfirmedAt)}`,
    `IP: ${data.borrowerConfirmedIP ?? "-"}`,
    `Device: ${truncateText(data.borrowerConfirmedDevice) ?? "-"}`,
  ]);
  y += Math.max(lenderCardHeight, borrowerCardHeight) + 5;

  drawRule();
  drawSectionTitle("Commercial Terms");
  drawLabeledValue("Interest", `${data.interestRate}% (${INTEREST_TYPE_LABELS[data.interestType] ?? data.interestType})`);
  drawLabeledValue("Payment frequency", FREQUENCY_LABELS[data.frequency] ?? data.frequency);
  drawLabeledValue("First payment date", formatDateOnly(data.startDate));
  drawLabeledValue("Scheduled installments", `${data.numInstallments}`);
  if (data.description) {
    drawLabeledValue("Description", data.description);
  }

  drawRule();
  drawSectionTitle("Repayment Schedule", "Status per installment at the time of export");
  drawTableHeader();

  data.installments.forEach((installment, index) => {
    ensureSpace(8);
    if (y > bottomLimit - 12) {
      doc.addPage();
      y = 18;
      drawSectionTitle("Repayment Schedule (cont.)");
      drawTableHeader();
    }

    if (index % 2 === 0) {
      doc.setFillColor(247, 248, 250);
      doc.rect(margin, y - 4.5, contentWidth, 7, "F");
    }

    addText(String(installment.installmentNumber), margin + 3, y, { size: 8 });
    addText(formatDateOnly(installment.dueDate), margin + 14, y, { size: 8 });
    addText(formatMoney(installment.amount), margin + 58, y, { size: 8 });
    addText(STATUS_LABELS[installment.status] ?? installment.status, margin + 100, y, {
      size: 8,
      style: installment.status === "paid" ? "bold" : "normal",
    });
    addText(formatDateTime(installment.paidAt), margin + 136, y, { size: 8 });
    y += 7;
  });

  drawRule();
  drawSectionTitle("Legal Note");
  const legalText =
    "This PDF is generated by BudOverBills as an electronic record of the agreement and its payment schedule. " +
    "The platform records the parties' activity trail but is not itself a contracting party or debt guarantor. " +
    "Use this together with the in-app agreement page and payment evidence when reviewing repayment history.";
  y += addWrappedText(legalText, margin, y, contentWidth, {
    size: 8,
    color: 95,
    lineHeight: 4,
  });
  y += 4;
  addText(`Exported on ${format(new Date(), "d MMMM yyyy HH:mm:ss")}`, margin, y, {
    size: 7,
    color: 120,
  });

  drawFooter();

  return doc.output("blob");
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const userAgent = window.navigator.userAgent;
  const isIosDevice =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isStandalonePwa =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

  if (isIosDevice || isStandalonePwa) {
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
