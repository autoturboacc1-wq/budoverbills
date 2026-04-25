import { describe, expect, it } from "vitest";
import { getRequiredOnboardingPath } from "@/utils/onboardingGuard";

describe("getRequiredOnboardingPath", () => {
  it("requires personal info before app access when profile is missing", () => {
    expect(getRequiredOnboardingPath(null, "/")).toBe("/personal-info");
  });

  it("requires PDPA consent before app access after personal info is complete", () => {
    expect(
      getRequiredOnboardingPath(
        {
          first_name: "Niran",
          last_name: "Somchai",
          phone: "0812345678",
          pdpa_accepted_at: null,
        },
        "/",
      ),
    ).toBe("/pdpa-consent");
  });

  it("allows app access after personal info and PDPA consent are complete", () => {
    expect(
      getRequiredOnboardingPath(
        {
          first_name: "Niran",
          last_name: "Somchai",
          phone: "0812345678",
          pdpa_accepted_at: "2026-04-25T00:00:00.000Z",
        },
        "/",
      ),
    ).toBeNull();
  });

  it("keeps incomplete users on the personal info page before PDPA consent", () => {
    expect(getRequiredOnboardingPath(null, "/personal-info")).toBeNull();
  });

  it("does not allow missing-profile users to accept PDPA before personal info exists", () => {
    expect(getRequiredOnboardingPath(null, "/pdpa-consent")).toBe("/personal-info");
  });
});
