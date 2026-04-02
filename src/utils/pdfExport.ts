import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { th } from "date-fns/locale";

interface AgreementPDFData {
  // Agreement info
  agreementId: string;
  principalAmount: number;
  totalAmount: number;
  interestRate: number;
  interestType: string;
  numInstallments: number;
  frequency: string;
  startDate: string;
  description?: string;
  
  // Lender info
  lenderName: string;
  lenderConfirmedAt?: string;
  lenderConfirmedIP?: string;
  lenderConfirmedDevice?: string;
  
  // Borrower info
  borrowerName: string;
  borrowerConfirmedAt?: string;
  borrowerConfirmedIP?: string;
  borrowerConfirmedDevice?: string;
  
  // Installments
  installments: Array<{
    installmentNumber: number;
    dueDate: string;
    amount: number;
    status: string;
    paidAt?: string;
  }>;
}

// Thai text support - we'll use romanized text to avoid font issues
function romanizeThai(text: string): string {
  // For now, keep Thai as-is - jsPDF can handle basic Thai with proper font
  return text;
}

export async function generateAgreementPDF(data: AgreementPDFData): Promise<Blob> {
  // Create PDF with default font (Helvetica supports basic Latin)
  // For Thai text, we'll include it but it may not render perfectly without custom fonts
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Helper function to add text
  const addText = (text: string, x: number, yPos: number, options?: { fontSize?: number; fontStyle?: string; align?: "left" | "center" | "right" }) => {
    doc.setFontSize(options?.fontSize || 10);
    if (options?.fontStyle === "bold") {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    
    if (options?.align === "center") {
      doc.text(text, pageWidth / 2, yPos, { align: "center" });
    } else if (options?.align === "right") {
      doc.text(text, pageWidth - margin, yPos, { align: "right" });
    } else {
      doc.text(text, x, yPos);
    }
  };

  // Title
  addText("LOAN AGREEMENT RECORD", margin, y, { fontSize: 16, fontStyle: "bold", align: "center" });
  y += 5;
  addText("Budoverbills - Electronic Agreement", margin, y, { fontSize: 10, align: "center" });
  y += 10;

  // Separator line
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Agreement ID and Date
  addText(`Agreement ID: ${data.agreementId}`, margin, y, { fontSize: 9 });
  y += 5;
  addText(`Generated: ${format(new Date(), "d MMM yyyy HH:mm")}`, margin, y, { fontSize: 9 });
  y += 10;

  // Parties Section
  addText("PARTIES", margin, y, { fontSize: 12, fontStyle: "bold" });
  y += 7;

  // Lender
  addText("Lender:", margin, y, { fontStyle: "bold" });
  addText(data.lenderName || "Not specified", margin + 40, y);
  y += 5;
  if (data.lenderConfirmedAt) {
    addText(`  Confirmed: ${format(new Date(data.lenderConfirmedAt), "d MMM yyyy HH:mm:ss")}`, margin, y, { fontSize: 8 });
    y += 4;
  }
  if (data.lenderConfirmedIP) {
    addText(`  IP: ${data.lenderConfirmedIP}`, margin, y, { fontSize: 8 });
    y += 4;
  }
  if (data.lenderConfirmedDevice) {
    addText(`  Device: ${data.lenderConfirmedDevice.substring(0, 50)}...`, margin, y, { fontSize: 8 });
    y += 4;
  }
  y += 3;

  // Borrower
  addText("Borrower:", margin, y, { fontStyle: "bold" });
  addText(data.borrowerName || "Not specified", margin + 40, y);
  y += 5;
  if (data.borrowerConfirmedAt) {
    addText(`  Confirmed: ${format(new Date(data.borrowerConfirmedAt), "d MMM yyyy HH:mm:ss")}`, margin, y, { fontSize: 8 });
    y += 4;
  }
  if (data.borrowerConfirmedIP) {
    addText(`  IP: ${data.borrowerConfirmedIP}`, margin, y, { fontSize: 8 });
    y += 4;
  }
  if (data.borrowerConfirmedDevice) {
    addText(`  Device: ${data.borrowerConfirmedDevice.substring(0, 50)}...`, margin, y, { fontSize: 8 });
    y += 4;
  }
  y += 10;

  // Loan Details Section
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  addText("LOAN DETAILS", margin, y, { fontSize: 12, fontStyle: "bold" });
  y += 7;

  const frequencyLabels: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
  };

  const interestTypeLabels: Record<string, string> = {
    none: "No Interest",
    flat: "Flat Rate",
    effective: "Effective Rate",
  };

  const details = [
    ["Principal Amount:", `${data.principalAmount.toLocaleString()} THB`],
    ["Total Amount:", `${data.totalAmount.toLocaleString()} THB`],
    ["Interest Rate:", `${data.interestRate}%`],
    ["Interest Type:", interestTypeLabels[data.interestType] || data.interestType],
    ["Number of Installments:", data.numInstallments.toString()],
    ["Payment Frequency:", frequencyLabels[data.frequency] || data.frequency],
    ["First Payment Date:", format(new Date(data.startDate), "d MMM yyyy")],
  ];

  if (data.description) {
    details.push(["Description:", data.description]);
  }

  details.forEach(([label, value]) => {
    addText(label, margin, y, { fontStyle: "bold" });
    addText(value, margin + 50, y);
    y += 5;
  });

  y += 5;

  // Payment Schedule Section
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  addText("PAYMENT SCHEDULE", margin, y, { fontSize: 12, fontStyle: "bold" });
  y += 7;

  // Table header
  const colWidths = [20, 35, 35, 30, 50];
  const tableX = margin;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(tableX, y - 4, pageWidth - margin * 2, 7, "F");
  
  addText("#", tableX + 2, y, { fontStyle: "bold", fontSize: 9 });
  addText("Due Date", tableX + colWidths[0], y, { fontStyle: "bold", fontSize: 9 });
  addText("Amount", tableX + colWidths[0] + colWidths[1], y, { fontStyle: "bold", fontSize: 9 });
  addText("Status", tableX + colWidths[0] + colWidths[1] + colWidths[2], y, { fontStyle: "bold", fontSize: 9 });
  addText("Paid At", tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, { fontStyle: "bold", fontSize: 9 });
  y += 7;

  // Table rows
  data.installments.forEach((inst, index) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    
    const statusText = inst.status === "paid" ? "PAID" : inst.status === "pending" ? "PENDING" : "UPCOMING";
    
    addText(inst.installmentNumber.toString(), tableX + 2, y, { fontSize: 9 });
    addText(format(new Date(inst.dueDate), "d MMM yyyy"), tableX + colWidths[0], y, { fontSize: 9 });
    addText(`${inst.amount.toLocaleString()} THB`, tableX + colWidths[0] + colWidths[1], y, { fontSize: 9 });
    addText(statusText, tableX + colWidths[0] + colWidths[1] + colWidths[2], y, { fontSize: 9 });
    addText(inst.paidAt ? format(new Date(inst.paidAt), "d MMM yy HH:mm") : "-", tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, { fontSize: 9 });
    y += 5;
    
    // Light separator line
    if (index < data.installments.length - 1) {
      doc.setDrawColor(230);
      doc.line(tableX, y - 1, pageWidth - margin, y - 1);
    }
  });

  y += 10;

  // Footer / Disclaimer
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  doc.setFontSize(8);
  doc.setTextColor(100);
  const disclaimer = [
    "DISCLAIMER",
    "This document is generated by Budoverbills (https://budoverbills.app) and serves as a record of",
    "the electronic agreement between the parties. Budoverbills is a recording tool, not a contracting",
    "party, and is not responsible for debt repayment. This document may be used as legal evidence",
    "in accordance with the Electronic Transactions Act B.E. 2544 (2001) of Thailand.",
    "",
    `Document generated on: ${format(new Date(), "d MMMM yyyy HH:mm:ss OOOO")}`,
  ];

  disclaimer.forEach((line) => {
    addText(line, margin, y, { fontSize: 7 });
    y += 4;
  });

  // Return as blob
  return doc.output("blob");
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
