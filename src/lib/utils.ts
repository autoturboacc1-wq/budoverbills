import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Mask phone number to show only last 4 digits
 * e.g., "0812345678" → "••••••5678"
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  
  // Remove non-digit characters for processing
  const digitsOnly = phone.replace(/\D/g, "");
  
  if (digitsOnly.length <= 4) {
    return phone; // Don't mask if too short
  }
  
  const lastFour = digitsOnly.slice(-4);
  const maskedPart = "•".repeat(digitsOnly.length - 4);
  
  return maskedPart + lastFour;
}

/**
 * Format phone number for display with partial masking
 * e.g., "0812345678" → "081-•••-5678"
 */
export function formatMaskedPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  
  const digitsOnly = phone.replace(/\D/g, "");
  
  if (digitsOnly.length < 9) {
    return maskPhoneNumber(phone);
  }
  
  // Format as XXX-•••-XXXX
  const first3 = digitsOnly.slice(0, 3);
  const last4 = digitsOnly.slice(-4);
  
  return `${first3}-•••-${last4}`;
}
