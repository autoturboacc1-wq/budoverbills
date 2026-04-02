import { describe, expect, it } from "vitest";

import {
  avalanche,
  estimateMonthlyPayment,
  frequencyNeedsMonthlyEstimate,
  snowball,
  type DebtItem,
} from "@/utils/debtStrategies";

const debts: DebtItem[] = [
  {
    id: "small-balance",
    name: "Small balance",
    balance: 1_000,
    minPayment: 100,
    interestRate: 5,
    frequency: "monthly",
  },
  {
    id: "high-interest",
    name: "High interest",
    balance: 5_000,
    minPayment: 100,
    interestRate: 20,
    frequency: "monthly",
  },
];

describe("debtStrategies", () => {
  it("converts scheduled payments to estimated monthly payments", () => {
    expect(estimateMonthlyPayment(100, "daily")).toBe(3000);
    expect(estimateMonthlyPayment(250, "weekly")).toBe(1000);
    expect(estimateMonthlyPayment(900, "monthly")).toBe(900);
  });

  it("flags non-monthly agreements as estimated", () => {
    expect(frequencyNeedsMonthlyEstimate("daily")).toBe(true);
    expect(frequencyNeedsMonthlyEstimate("weekly")).toBe(true);
    expect(frequencyNeedsMonthlyEstimate("monthly")).toBe(false);
  });

  it("makes avalanche save at least as much interest as snowball for mixed-rate debts", () => {
    const snowballPlan = snowball(debts, 200);
    const avalanchePlan = avalanche(debts, 200);

    expect(avalanchePlan.totalInterestPaid).toBeLessThan(snowballPlan.totalInterestPaid);
    expect(avalanchePlan.monthlySnapshots.length).toBeGreaterThan(0);
    expect(snowballPlan.payoffOrder[0]).toBe("small-balance");
    expect(new Set(avalanchePlan.payoffOrder)).toEqual(new Set(debts.map((debt) => debt.id)));
  });
});
