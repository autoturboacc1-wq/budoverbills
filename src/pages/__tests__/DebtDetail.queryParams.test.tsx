import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { flushReact, renderReact } from "@/test/reactHarness";
import { createAgreement, createInstallment } from "@/test/fixtures/debt";

const pageMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getAgreement: vi.fn(),
  refresh: vi.fn(),
  fetchRequests: vi.fn(),
  setSearchParams: vi.fn(),
  search: "",
  from: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag) => tag,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => pageMocks.navigate,
  useParams: () => ({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
  useSearchParams: () => [new URLSearchParams(pageMocks.search), pageMocks.setSearchParams],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "lender-id" } }),
}));

vi.mock("@/hooks/useDebtAgreements", () => ({
  useDebtAgreements: () => ({
    getAgreement: pageMocks.getAgreement,
    isLoading: false,
    refresh: pageMocks.refresh,
  }),
}));

vi.mock("@/hooks/useRescheduleRequests", () => ({
  useRescheduleRequests: () => ({
    requests: [],
    fetchRequests: pageMocks.fetchRequests,
    loading: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: pageMocks.from,
  },
}));

vi.mock("@/components/PaymentDialog", () => ({
  PaymentDialog: ({ open, installment }: { open: boolean; installment: { id: string } | null }) =>
    open ? <div data-testid="payment-dialog">{installment?.id}</div> : null,
}));

vi.mock("@/components/PaymentSlipUpload", () => ({
  PaymentSlipUpload: () => null,
}));

vi.mock("@/components/RescheduleRequestDialog", () => ({
  RescheduleRequestDialog: () => null,
}));

vi.mock("@/components/RescheduleApprovalCard", () => ({
  RescheduleApprovalCard: () => null,
}));

vi.mock("@/components/BankAccountSection", () => ({
  BankAccountSection: () => null,
}));

vi.mock("@/components/TransferProofSection", () => ({
  TransferProofSection: () => null,
}));

vi.mock("@/components/ui/StatusBadge", () => ({
  StatusBadge: () => null,
}));

vi.mock("@/components/ux", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  ReviewPanel: () => null,
  StatusTimeline: () => null,
}));

vi.mock("@/components/ux/PageTransition", () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/utils/pdfExport", () => ({
  generateAgreementPDF: vi.fn(),
  downloadPDF: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import DebtDetail from "@/pages/DebtDetail";

function createSupabaseQueryBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
}

describe("DebtDetail query params", () => {
  beforeEach(() => {
    pageMocks.navigate.mockReset();
    pageMocks.getAgreement.mockReset();
    pageMocks.refresh.mockReset();
    pageMocks.fetchRequests.mockReset();
    pageMocks.setSearchParams.mockReset();
    pageMocks.search = "";
    pageMocks.from.mockImplementation(() => createSupabaseQueryBuilder());
  });

  it("opens the payment dialog for the installment in the pay query param", async () => {
    const agreement = createAgreement();
    pageMocks.getAgreement.mockReturnValue(agreement);
    pageMocks.search = "pay=11111111-1111-1111-1111-111111111111";

    const { container, unmount } = await renderReact(<DebtDetail />);
    await flushReact();

    expect(container.querySelector('[data-testid="payment-dialog"]')?.textContent).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(pageMocks.setSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams), { replace: true });
    expect(pageMocks.setSearchParams.mock.calls[0][0].toString()).toBe("");

    await unmount();
  });

  it("clears an invalid or paid pay query param without opening the payment dialog", async () => {
    const agreement = createAgreement({
      installments: [
        createInstallment({
          id: "11111111-1111-1111-1111-111111111111",
          status: "paid",
        }),
      ],
    });
    pageMocks.getAgreement.mockReturnValue(agreement);
    pageMocks.search = "pay=11111111-1111-1111-1111-111111111111";

    const { container, unmount } = await renderReact(<DebtDetail />);
    await flushReact();

    expect(container.querySelector('[data-testid="payment-dialog"]')).toBeNull();
    expect(pageMocks.setSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams), { replace: true });
    expect(pageMocks.setSearchParams.mock.calls[0][0].toString()).toBe("");

    await unmount();
  });
});
