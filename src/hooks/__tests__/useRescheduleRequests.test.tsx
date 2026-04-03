import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderReact, flushReact } from '@/test/reactHarness';

const hookMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  user: { id: 'borrower-id' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: hookMocks.rpc,
    from: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: hookMocks.user }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: hookMocks.toastSuccess,
    error: hookMocks.toastError,
  },
}));

import { useRescheduleRequests } from '@/hooks/useRescheduleRequests';

function HookProbe({ onReady }: { onReady: (api: ReturnType<typeof useRescheduleRequests>) => void }) {
  const api = useRescheduleRequests();

  useEffect(() => {
    onReady(api);
  }, [api, onReady]);

  return null;
}

describe('useRescheduleRequests', () => {
  beforeEach(() => {
    hookMocks.rpc.mockReset();
    hookMocks.toastSuccess.mockReset();
    hookMocks.toastError.mockReset();
    hookMocks.user = { id: 'borrower-id' };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps createRequest inputs to the create_reschedule_request rpc payload', async () => {
    hookMocks.rpc.mockResolvedValueOnce({ data: { success: true }, error: null });

    let api: ReturnType<typeof useRescheduleRequests> | null = null;
    const { unmount } = await renderReact(
      <HookProbe
        onReady={(value) => {
          api = value;
        }}
      />
    );

    expect(api).not.toBeNull();

    const success = await api!.createRequest({
      installmentId: 'installment-1',
      agreementId: 'agreement-1',
      originalDueDate: '2026-04-10',
      newDueDate: '2026-05-10',
      principalPerInstallment: 1000,
      interestPerInstallment: 100,
      currentInterestRate: 12,
      interestType: 'flat',
      feeInstallments: 1,
      customFeeRate: 40,
      slipUrl: 'agreement-1/reschedule/installment-1-slip.png',
      submittedAmount: 40,
    });

    await flushReact();
    await unmount();

    expect(success).toBe(true);
    expect(hookMocks.rpc).toHaveBeenCalledWith('create_reschedule_request', {
      p_installment_id: 'installment-1',
      p_agreement_id: 'agreement-1',
      p_original_due_date: '2026-04-10',
      p_new_due_date: '2026-05-10',
      p_principal_per_installment: 1000,
      p_interest_per_installment: 100,
      p_current_interest_rate: 12,
      p_interest_type: 'flat',
      p_fee_installments: 1,
      p_custom_fee_rate: 40,
      p_slip_url: 'agreement-1/reschedule/installment-1-slip.png',
      p_submitted_amount: 40,
    });
    expect(hookMocks.toastSuccess).toHaveBeenCalledWith('ส่งคำขอเลื่อนงวดเรียบร้อย');
  });

  it('uses the RPC shifted_count to build the approval success toast', async () => {
    hookMocks.rpc.mockResolvedValueOnce({
      data: { shifted_count: 4 },
      error: null,
    });

    let api: ReturnType<typeof useRescheduleRequests> | null = null;
    const { unmount } = await renderReact(
      <HookProbe
        onReady={(value) => {
          api = value;
        }}
      />
    );

    expect(api).not.toBeNull();

    const success = await api!.approveRequest('request-1');

    await flushReact();
    await unmount();

    expect(success).toBe(true);
    expect(hookMocks.rpc).toHaveBeenCalledWith('approve_reschedule_request', {
      p_request_id: 'request-1',
    });
    expect(hookMocks.toastSuccess).toHaveBeenCalledWith('อนุมัติเรียบร้อย! เลื่อนงวดที่ขอและงวดถัดไปอีก 3 งวด');
  });
});
