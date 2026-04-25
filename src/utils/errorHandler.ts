import { toast } from 'sonner';
import { captureException } from '@/lib/observability';

export function getErrorMessage(error: unknown, fallback: string = 'Unknown error'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const obj = error as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof obj.message === 'string' && obj.message.length > 0) {
      return obj.message;
    }
    if (typeof obj.error_description === 'string' && obj.error_description.length > 0) {
      return obj.error_description;
    }
    if (typeof obj.details === 'string' && obj.details.length > 0) {
      return obj.details;
    }
    if (typeof obj.hint === 'string' && obj.hint.length > 0) {
      return obj.hint;
    }
    if (typeof obj.code === 'string' && obj.code.length > 0) {
      return `Error code: ${obj.code}`;
    }
  }
  return fallback;
}

export function handleSupabaseError(
  error: unknown,
  context: string,
  fallbackMessage: string
): void {
  console.error(`[${context}]`, error);
  captureException(error, { context });
  toast.error(fallbackMessage);
}
