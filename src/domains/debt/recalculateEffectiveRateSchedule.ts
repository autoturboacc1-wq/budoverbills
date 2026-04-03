import { AgreementFrequency } from '@/domains/debt/types';
import { roundMoney, sumMoney, toMoney } from '@/utils/money';

export interface EffectiveInstallmentBreakdown {
  installment: number;
  principal: number;
  interest: number;
  total: number;
}

export function getPeriodsPerYear(frequency: AgreementFrequency): number {
  switch (frequency) {
    case 'daily':
      return 365;
    case 'weekly':
      return 52;
    case 'monthly':
    default:
      return 12;
  }
}

export function buildEffectiveRateSchedule(params: {
  principal: number;
  annualRatePercent: number;
  installments: number;
  frequency: AgreementFrequency;
}): EffectiveInstallmentBreakdown[] {
  const principal = toMoney(params.principal);
  const annualRatePercent = params.annualRatePercent;
  const installments = Math.max(0, Math.trunc(params.installments));

  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0 || principal <= 0 || installments <= 0) {
    return [];
  }

  const periodRate = annualRatePercent / 100 / getPeriodsPerYear(params.frequency);

  if (periodRate <= 0) {
    const equalPrincipal = roundMoney(principal / installments);
    let remainingPrincipal = principal;

    return Array.from({ length: installments }, (_, index) => {
      const isLast = index === installments - 1;
      const principalPortion = isLast ? remainingPrincipal : equalPrincipal;
      const total = roundMoney(principalPortion);
      remainingPrincipal = roundMoney(remainingPrincipal - principalPortion);

      return {
        installment: index + 1,
        principal: principalPortion,
        interest: 0,
        total,
      };
    });
  }

  const payment =
    (principal * (periodRate * Math.pow(1 + periodRate, installments))) /
    (Math.pow(1 + periodRate, installments) - 1);

  let remainingPrincipal = principal;
  const schedule: EffectiveInstallmentBreakdown[] = [];

  for (let index = 0; index < installments; index += 1) {
    const isLast = index === installments - 1;
    const interestPortion = roundMoney(remainingPrincipal * periodRate);
    const principalPortion = isLast
      ? roundMoney(remainingPrincipal)
      : roundMoney(payment - interestPortion);
    const total = sumMoney(principalPortion, interestPortion);

    remainingPrincipal = roundMoney(Math.max(0, remainingPrincipal - principalPortion));

    schedule.push({
      installment: index + 1,
      principal: principalPortion,
      interest: interestPortion,
      total,
    });
  }

  return schedule;
}

export function recalculateEffectiveRateSchedule(params: {
  remainingPrincipal: number;
  annualRatePercent: number;
  installments: number;
  frequency: AgreementFrequency;
}): EffectiveInstallmentBreakdown[] {
  return buildEffectiveRateSchedule({
    principal: params.remainingPrincipal,
    annualRatePercent: params.annualRatePercent,
    installments: params.installments,
    frequency: params.frequency,
  });
}
