import { getSignedUrl, normalizeStoragePath, uploadToPrivateBucket } from '@/hooks/useSignedUrl';
import { supabase } from '@/integrations/supabase/client';

export const PAYMENT_SLIP_BUCKET = 'payment-slips';
export const PAYMENT_SLIP_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const PAYMENT_SLIP_MAX_BYTES = 5 * 1024 * 1024;

export type PaymentSlipKind = 'transfer' | 'installment' | 'reschedule';

export function validatePaymentSlipFile(file: File): string | null {
  if (!PAYMENT_SLIP_ALLOWED_TYPES.includes(file.type as (typeof PAYMENT_SLIP_ALLOWED_TYPES)[number])) {
    return 'รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF';
  }

  if (file.size > PAYMENT_SLIP_MAX_BYTES) {
    return 'ไฟล์ต้องมีขนาดไม่เกิน 5MB';
  }

  return null;
}

export function buildPaymentSlipPath(params: {
  agreementId: string;
  kind: PaymentSlipKind;
  entityId: string;
  fileType: string;
  timestamp?: number;
}): string {
  const agreementId = sanitizePathSegment(params.agreementId, "agreementId");
  const kind = sanitizePaymentSlipKind(params.kind);
  const entityId = sanitizePathSegment(params.entityId, "entityId");
  const sanitizedExt = getFileExtensionForType(params.fileType);
  const ts = params.timestamp ?? Date.now();
  return `${agreementId}/${kind}/${entityId}-${ts}.${sanitizedExt}`;
}

export async function uploadPaymentSlip(params: {
  agreementId: string;
  kind: PaymentSlipKind;
  entityId: string;
  file: File;
}): Promise<{ path: string } | { error: Error }> {
  try {
    const validationError = await validatePaymentSlipMagicBytes(params.file);
    if (validationError) {
      return { error: new Error(validationError) };
    }

    const filePath = buildPaymentSlipPath({
      agreementId: params.agreementId,
      kind: params.kind,
      entityId: params.entityId,
      fileType: params.file.type,
    });

    return uploadToPrivateBucket(PAYMENT_SLIP_BUCKET, filePath, params.file, {
      cacheControl: '3600',
      upsert: true,
    });
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Upload failed") };
  }
}

export async function getPaymentSlipSignedUrl(
  path: string,
  expiresIn: number = 300
): Promise<string | null> {
  const normalizedPath = normalizeAndValidatePaymentSlipPath(path);
  if (!normalizedPath) {
    return null;
  }

  return getSignedUrl(PAYMENT_SLIP_BUCKET, normalizedPath, expiresIn);
}

export async function deletePaymentSlip(path: string): Promise<void> {
  const normalizedPath = normalizeAndValidatePaymentSlipPath(path);
  if (!normalizedPath) {
    return;
  }

  const { error } = await supabase.storage.from(PAYMENT_SLIP_BUCKET).remove([normalizedPath]);
  if (error) {
    throw error;
  }
}

export function normalizeAndValidatePaymentSlipPath(path: string): string | null {
  const normalizedPath = normalizeStoragePath(path).trim().replace(/^\/+/, "");
  if (!normalizedPath) {
    return null;
  }

  const segments = normalizedPath.split("/");

  // New layout: {agreement_id}/{transfer|installment|reschedule}/{entityId-ts.ext}
  if (segments.length === 3) {
    const [agreementId, kind, fileName] = segments;

    if (!isSafePathSegment(agreementId) || !isSafePaymentSlipKind(kind) || !isSafePaymentSlipFileName(fileName)) {
      return null;
    }

    return `${agreementId}/${kind}/${fileName}`;
  }

  // Legacy layouts that the payment-slips storage policy still accepts:
  //   transfers/transfer-{agreement_id}-{ts}.{ext}
  //   slips/{installment_id}-{ts}.{ext}
  //   slips/reschedule-{installment_id}-{ts}.{ext}
  // Reject anything else.  Frontend used to be stricter than RLS here, which
  // surfaced as "ไม่สามารถโหลดสลิปได้" for slips uploaded before April 2026.
  if (segments.length === 2) {
    const [folder, fileName] = segments;
    if (folder === "transfers" && /^transfer-[0-9a-fA-F-]{36}-\d+\.[A-Za-z0-9]{1,8}$/.test(fileName)) {
      return `${folder}/${fileName}`;
    }
    if (folder === "slips" && /^(?:reschedule-)?[0-9a-fA-F-]{36}-\d+\.[A-Za-z0-9]{1,8}$/.test(fileName)) {
      return `${folder}/${fileName}`;
    }
  }

  return null;
}

async function validatePaymentSlipMagicBytes(file: File): Promise<string | null> {
  if (!PAYMENT_SLIP_ALLOWED_TYPES.includes(file.type as (typeof PAYMENT_SLIP_ALLOWED_TYPES)[number])) {
    return 'รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF';
  }

  const header = await readFileHeader(file, 16);

  switch (file.type) {
    case 'image/jpeg':
      if (header.length < 3 || header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
        return 'ไฟล์ไม่ตรงกับชนิดที่ประกาศไว้';
      }
      break;
    case 'image/png':
      if (
        header.length < 8 ||
        header[0] !== 0x89 ||
        header[1] !== 0x50 ||
        header[2] !== 0x4e ||
        header[3] !== 0x47 ||
        header[4] !== 0x0d ||
        header[5] !== 0x0a ||
        header[6] !== 0x1a ||
        header[7] !== 0x0a
      ) {
        return 'ไฟล์ไม่ตรงกับชนิดที่ประกาศไว้';
      }
      break;
    case 'image/webp':
      if (
        header.length < 12 ||
        header[0] !== 0x52 ||
        header[1] !== 0x49 ||
        header[2] !== 0x46 ||
        header[3] !== 0x46 ||
        header[8] !== 0x57 ||
        header[9] !== 0x45 ||
        header[10] !== 0x42 ||
        header[11] !== 0x50
      ) {
        return 'ไฟล์ไม่ตรงกับชนิดที่ประกาศไว้';
      }
      break;
    case 'application/pdf':
      if (
        header.length < 5 ||
        header[0] !== 0x25 ||
        header[1] !== 0x50 ||
        header[2] !== 0x44 ||
        header[3] !== 0x46 ||
        header[4] !== 0x2d
      ) {
        return 'ไฟล์ไม่ตรงกับชนิดที่ประกาศไว้';
      }
      break;
  }

  return null;
}

async function readFileHeader(file: File, size: number): Promise<Uint8Array> {
  const blob = file.slice(0, size);

  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file header'));
    };

    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read file header'));
        return;
      }

      resolve(new Uint8Array(reader.result));
    };

    reader.readAsArrayBuffer(blob);
  });
}

function getFileExtensionForType(fileType: string): string {
  switch (fileType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      throw new Error('Unsupported payment slip file type');
  }
}

function sanitizePathSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!isSafePathSegment(normalized)) {
    throw new Error(`Invalid payment slip ${label}`);
  }

  return normalized;
}

function sanitizePaymentSlipKind(kind: PaymentSlipKind): PaymentSlipKind {
  if (!isSafePaymentSlipKind(kind)) {
    throw new Error('Invalid payment slip kind');
  }

  return kind;
}

function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function isSafePaymentSlipKind(value: string): value is PaymentSlipKind {
  return value === 'transfer' || value === 'installment' || value === 'reschedule';
}

function isSafePaymentSlipFileName(value: string): boolean {
  return /^[A-Za-z0-9_-]+-\d+\.[A-Za-z0-9]{1,8}$/.test(value);
}
