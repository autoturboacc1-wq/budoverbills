import type { AgreementFrequency } from "@/domains/debt";

export interface DebtItem {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  interestRate: number;
  frequency: AgreementFrequency;
}

export interface MonthlySnapshot {
  month: number;
  totalBalance: number;
  totalInterestPaid: number;
}

export interface PaymentPlan {
  monthsToPayoff: number;
  totalInterestPaid: number;
  totalPaid: number;
  payoffOrder: string[];
  monthlySnapshots: MonthlySnapshot[];
}

const MAX_SIMULATION_MONTHS = 600;

const PAYMENTS_PER_MONTH: Record<AgreementFrequency, number> = {
  daily: 30,
  weekly: 4,
  monthly: 1,
};

function getMonthlyRate(interestRate: number, frequency: AgreementFrequency): number {
  const periodicRate = Math.max(interestRate, 0) / 100;
  const periodsPerMonth = PAYMENTS_PER_MONTH[frequency];

  if (periodicRate <= 0 || periodsPerMonth <= 0) {
    return 0;
  }

  return Math.pow(1 + periodicRate, periodsPerMonth) - 1;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function estimateMonthlyPayment(amount: number, frequency: AgreementFrequency): number {
  return roundCurrency(Math.max(amount, 0) * PAYMENTS_PER_MONTH[frequency]);
}

export function frequencyNeedsMonthlyEstimate(frequency: AgreementFrequency): boolean {
  return frequency !== "monthly";
}

export function snowball(debts: DebtItem[], extraPayment = 0): PaymentPlan {
  return simulate(
    [...debts].sort((left, right) => {
      if (left.balance !== right.balance) {
        return left.balance - right.balance;
      }

      return right.interestRate - left.interestRate;
    }),
    extraPayment,
  );
}

export function avalanche(debts: DebtItem[], extraPayment = 0): PaymentPlan {
  return simulate(
    [...debts].sort((left, right) => {
      if (left.interestRate !== right.interestRate) {
        return right.interestRate - left.interestRate;
      }

      return left.balance - right.balance;
    }),
    extraPayment,
  );
}

function simulate(orderedDebts: DebtItem[], extraPayment: number): PaymentPlan {
  const debts = orderedDebts.map((debt) => ({
    ...debt,
    balance: roundCurrency(debt.balance),
    minPayment: roundCurrency(Math.max(debt.minPayment, 0)),
    interestRate: Math.max(debt.interestRate, 0),
  }));

  let month = 0;
  let totalInterestPaid = 0;
  let totalPaid = 0;
  const payoffOrder: string[] = [];
  const monthlySnapshots: MonthlySnapshot[] = [];

  while (debts.some((debt) => debt.balance > 0.01) && month < MAX_SIMULATION_MONTHS) {
    month += 1;
    let extraBudget = roundCurrency(Math.max(extraPayment, 0));

    for (const debt of debts) {
      if (debt.balance <= 0.01) {
        debt.balance = 0;
        continue;
      }

      const monthlyRate = getMonthlyRate(debt.interestRate, debt.frequency);
      const monthlyInterest = roundCurrency(debt.balance * monthlyRate);

      debt.balance = roundCurrency(debt.balance + monthlyInterest);
      totalInterestPaid = roundCurrency(totalInterestPaid + monthlyInterest);

      const scheduledPayment = Math.min(debt.minPayment, debt.balance);
      debt.balance = roundCurrency(debt.balance - scheduledPayment);
      totalPaid = roundCurrency(totalPaid + scheduledPayment);

      const unusedMinimum = roundCurrency(debt.minPayment - scheduledPayment);
      if (unusedMinimum > 0) {
        extraBudget = roundCurrency(extraBudget + unusedMinimum);
      }

      if (debt.balance <= 0.01) {
        debt.balance = 0;
        if (!payoffOrder.includes(debt.id)) {
          payoffOrder.push(debt.id);
        }
      }
    }

    for (const debt of debts) {
      if (extraBudget <= 0 || debt.balance <= 0.01) {
        continue;
      }

      const extraApplied = Math.min(extraBudget, debt.balance);
      debt.balance = roundCurrency(debt.balance - extraApplied);
      totalPaid = roundCurrency(totalPaid + extraApplied);
      extraBudget = roundCurrency(extraBudget - extraApplied);

      if (debt.balance <= 0.01) {
        debt.balance = 0;
        if (!payoffOrder.includes(debt.id)) {
          payoffOrder.push(debt.id);
        }
      }
    }

    monthlySnapshots.push({
      month,
      totalBalance: roundCurrency(
        debts.reduce((sum, debt) => sum + Math.max(debt.balance, 0), 0),
      ),
      totalInterestPaid,
    });
  }

  return {
    monthsToPayoff: month,
    totalInterestPaid,
    totalPaid,
    payoffOrder,
    monthlySnapshots,
  };
}
