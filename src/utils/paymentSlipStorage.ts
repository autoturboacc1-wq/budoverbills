import { getSignedUrl, normalizeStoragePath, uploadToPrivateBucket } from '@/hooks/useSignedUrl';

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
  fileName: string;
  timestamp?: number;
}): string {
  const sanitizedExt = getFileExtension(params.fileName);
  const ts = params.timestamp ?? Date.now();
  return `${params.agreementId}/${params.kind}/${params.entityId}-${ts}.${sanitizedExt}`;
}

export async function uploadPaymentSlip(params: {
  agreementId: string;
  kind: PaymentSlipKind;
  entityId: string;
  file: File;
}): Promise<{ path: string } | { error: Error }> {
  const filePath = buildPaymentSlipPath({
    agreementId: params.agreementId,
    kind: params.kind,
    entityId: params.entityId,
    fileName: params.file.name,
  });

  return uploadToPrivateBucket(PAYMENT_SLIP_BUCKET, filePath, params.file, {
    cacheControl: '3600',
    upsert: true,
  });
}

export async function getPaymentSlipSignedUrl(
  path: string,
  expiresIn: number = 300
): Promise<string | null> {
  return getSignedUrl(PAYMENT_SLIP_BUCKET, normalizeStoragePath(path), expiresIn);
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && extension.length > 0 ? extension : 'bin';
}
