import { toast } from 'sonner';
import { captureException } from '@/lib/observability';

export function getErrorMessage(error: unknown, fallback: string = 'Unknown error'): string {
  return error instanceof Error ? error.message : fallback;
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
