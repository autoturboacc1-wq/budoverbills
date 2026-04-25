import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderReact } from "@/test/reactHarness";

const pageMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  refreshProfile: vi.fn(),
  from: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag) => tag,
    },
  ),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => pageMocks.navigate,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { pdpa_accepted_at: null },
    refreshProfile: pageMocks.refreshProfile,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: pageMocks.toastSuccess,
    error: pageMocks.toastError,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: pageMocks.from,
  },
}));

import PDPAConsent from "@/pages/PDPAConsent";

describe("PDPAConsent", () => {
  it("renders the confirmation button for users who have not accepted PDPA", async () => {
    const { container, unmount } = await renderReact(<PDPAConsent />);

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("ยืนยันและเริ่มใช้งาน"),
    );

    expect(confirmButton).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();

    await unmount();
  });
});
