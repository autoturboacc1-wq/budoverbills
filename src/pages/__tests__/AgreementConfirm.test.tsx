import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderReact, flushReact } from '@/test/reactHarness';
import { createAgreement } from '@/test/fixtures/debt';

const pageMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  params: { id: 'agreement-1' },
  refresh: vi.fn(),
  getAgreement: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  getClientIP: vi.fn(),
  getDeviceIdString: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag) => tag,
    }
  ),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => pageMocks.navigate,
  useParams: () => pageMocks.params,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'borrower-id' } }),
}));

vi.mock('@/hooks/useDebtAgreements', () => ({
  useDebtAgreements: () => ({
    getAgreement: pageMocks.getAgreement,
    refresh: pageMocks.refresh,
  }),
}));

vi.mock('@/components/AgreementLegalText', () => ({
  AgreementLegalText: ({ onAcceptChange, accepted }: { onAcceptChange: (accepted: boolean) => void; accepted: boolean }) => (
    <button data-testid="accept-agreement" onClick={() => onAcceptChange(!accepted)}>
      accept-agreement
    </button>
  ),
}));

vi.mock('@/components/PasswordConfirmDialog', () => ({
  PasswordConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (
      <button data-testid="password-confirm" onClick={onConfirm}>
        confirm-password
      </button>
    ) : null,
}));

vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => null,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/utils/deviceInfo', () => ({
  getClientIP: pageMocks.getClientIP,
  getDeviceIdString: pageMocks.getDeviceIdString,
}));

vi.mock('@/utils/paymentSlipStorage', () => ({
  getPaymentSlipSignedUrl: vi.fn(),
  uploadPaymentSlip: vi.fn(),
  validatePaymentSlipFile: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: pageMocks.toastSuccess,
    error: pageMocks.toastError,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: pageMocks.rpc,
    from: pageMocks.from,
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));

import AgreementConfirm from '@/pages/AgreementConfirm';

describe('AgreementConfirm', () => {
  beforeEach(() => {
    pageMocks.navigate.mockReset();
    pageMocks.refresh.mockReset();
    pageMocks.getAgreement.mockReset();
    pageMocks.rpc.mockReset();
    pageMocks.from.mockReset();
    pageMocks.toastSuccess.mockReset();
    pageMocks.toastError.mockReset();
    pageMocks.getClientIP.mockReset();
    pageMocks.getDeviceIdString.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:34:56.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes an ISO confirmation timestamp into confirm_agreement_transfer', async () => {
    const agreement = createAgreement({
      lender_confirmed: false,
      borrower_confirmed: false,
      lender_id: 'lender-id',
      borrower_id: 'borrower-id',
      transfer_slip_url: null,
      contract_finalized_at: '2026-04-15T12:00:00.000Z',
    });

    pageMocks.getAgreement.mockReturnValue(agreement);
    pageMocks.refresh.mockResolvedValue(undefined);
    pageMocks.getClientIP.mockResolvedValue('203.0.113.10');
    pageMocks.getDeviceIdString.mockReturnValue('device-123');
    pageMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              display_name: 'ผู้ให้ยืม',
              first_name: 'Niran',
              last_name: 'Somchai',
            },
          }),
        };
      }

      if (table === "debt_agreements") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              status: 'pending_confirmation',
              lender_confirmed: false,
              borrower_confirmed: false,
              borrower_confirmed_transfer: false,
              transfer_slip_url: null,
              contract_finalized_at: '2026-04-15T12:00:00.000Z',
            },
            error: null,
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
    pageMocks.rpc.mockResolvedValue({ data: { success: true }, error: null });

    const { container, unmount } = await renderReact(<AgreementConfirm />);

    await act(async () => {
      container.querySelector('[data-testid="accept-agreement"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('ยอมรับข้อตกลง')
    );
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const passwordConfirmButton = container.querySelector('[data-testid="password-confirm"]');
    expect(passwordConfirmButton).toBeTruthy();

    await act(async () => {
      passwordConfirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await flushReact();

    expect(pageMocks.rpc).toHaveBeenCalledWith('confirm_agreement_transfer', {
      p_agreement_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      p_transfer_slip_url: null,
      p_mark_lender_confirmed: false,
      p_mark_borrower_confirmed: true,
      p_mark_borrower_transfer_confirmed: false,
      p_confirmed_at: '2026-04-15T12:34:56.000Z',
      p_client_ip: '203.0.113.10',
      p_device_id: 'device-123',
    });

    await unmount();
  });
});
