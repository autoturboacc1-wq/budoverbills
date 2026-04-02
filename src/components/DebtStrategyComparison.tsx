import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  avalanche,
  type DebtItem,
  type PaymentPlan,
  snowball,
} from "@/utils/debtStrategies";

interface DebtStrategyComparisonProps {
  debts: DebtItem[];
  isEstimate: boolean;
}

const PLAN_COLORS = {
  snowball: "#1d4ed8",
  avalanche: "#ea580c",
} as const;

export function DebtStrategyComparison({
  debts,
  isEstimate,
}: DebtStrategyComparisonProps) {
  const [extraPayment, setExtraPayment] = useState(0);

  const { snowballPlan, avalanchePlan, interestSaved, chartData } = useMemo(() => {
    const snowballPlan = snowball(debts, extraPayment);
    const avalanchePlan = avalanche(debts, extraPayment);
    const maxMonths = Math.max(
      snowballPlan.monthlySnapshots.length,
      avalanchePlan.monthlySnapshots.length,
    );

    return {
      snowballPlan,
      avalanchePlan,
      interestSaved: Math.max(
        snowballPlan.totalInterestPaid - avalanchePlan.totalInterestPaid,
        0,
      ),
      chartData: Array.from({ length: maxMonths }, (_, index) => ({
        month: index + 1,
        snowball: snowballPlan.monthlySnapshots[index]?.totalBalance ?? 0,
        avalanche: avalanchePlan.monthlySnapshots[index]?.totalBalance ?? 0,
      })),
    };
  }, [debts, extraPayment]);

  const payoffNameMap = useMemo(
    () => new Map(debts.map((debt) => [debt.id, debt.name])),
    [debts],
  );

  const baselineMinimum = useMemo(
    () => debts.reduce((sum, debt) => sum + debt.minPayment, 0),
    [debts],
  );

  return (
    <div className="space-y-4">
      <Card className="border-primary/10 bg-primary/5">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="extra-payment">จ่ายเพิ่มต่อเดือน</Label>
              <Input
                id="extra-payment"
                type="number"
                min={0}
                value={extraPayment || ""}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setExtraPayment(Number.isFinite(nextValue) ? Math.max(nextValue, 0) : 0);
                }}
                placeholder="0"
                className="w-full sm:w-44"
              />
            </div>
            <div className="rounded-2xl bg-background/80 px-4 py-3 text-sm">
              <p className="text-muted-foreground">ขั้นต่ำรวมต่อเดือน</p>
              <p className="font-heading text-lg font-semibold text-foreground">
                ฿{baselineMinimum.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {isEstimate
              ? "ประมาณการนี้แปลงหนี้รายวันและรายสัปดาห์เป็นยอดต่อเดือนเพื่อใช้เปรียบเทียบกลยุทธ์"
              : "ประมาณการนี้อ้างอิงจากยอดคงเหลือและค่างวดรายเดือนปัจจุบัน"}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <StrategyCard
          title="Debt Snowball"
          subtitle="ปิดก้อนเล็กก่อนเพื่อสร้างแรงต่อเนื่อง"
          plan={snowballPlan}
          payoffNames={payoffNameMap}
          colorClass="text-blue-700 dark:text-blue-300"
          accentColor={PLAN_COLORS.snowball}
          recommended={interestSaved === 0}
        />
        <StrategyCard
          title="Debt Avalanche"
          subtitle="ปิดก้อนดอกเบี้ยสูงก่อนเพื่อลดต้นทุนรวม"
          plan={avalanchePlan}
          payoffNames={payoffNameMap}
          colorClass="text-orange-700 dark:text-orange-300"
          accentColor={PLAN_COLORS.avalanche}
          recommended={interestSaved > 0}
          savings={interestSaved}
        />
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">แนวโน้มหนี้คงเหลือ</CardTitle>
          <p className="text-sm text-muted-foreground">
            เปรียบเทียบยอดคงเหลือรวมรายเดือนของแต่ละแผน
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  `฿${Number(value).toLocaleString("th-TH", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  })}`
                }
              />
              <Tooltip
                formatter={(value: number) =>
                  `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`
                }
                labelFormatter={(label) => `เดือนที่ ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="snowball"
                stroke={PLAN_COLORS.snowball}
                name="Snowball"
                dot={false}
                strokeWidth={3}
              />
              <Line
                type="monotone"
                dataKey="avalanche"
                stroke={PLAN_COLORS.avalanche}
                name="Avalanche"
                dot={false}
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function StrategyCard({
  title,
  subtitle,
  plan,
  payoffNames,
  colorClass,
  accentColor,
  recommended,
  savings,
}: {
  title: string;
  subtitle: string;
  plan: PaymentPlan;
  payoffNames: Map<string, string>;
  colorClass: string;
  accentColor: string;
  recommended?: boolean;
  savings?: number;
}) {
  const payoffPreview = plan.payoffOrder
    .slice(0, 3)
    .map((id) => payoffNames.get(id) ?? id)
    .join(" -> ");

  return (
    <Card
      className={recommended ? "border-transparent ring-2 ring-primary/30" : undefined}
      style={{ boxShadow: recommended ? `0 0 0 1px ${accentColor}20` : undefined }}
    >
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className={`font-heading text-lg font-semibold ${colorClass}`}>{title}</p>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {recommended ? <Badge>แนะนำ</Badge> : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricBox
            label="ปิดหนี้หมดใน"
            value={`${plan.monthsToPayoff.toLocaleString("th-TH")} เดือน`}
          />
          <MetricBox
            label="ดอกเบี้ยรวม"
            value={`฿${plan.totalInterestPaid.toLocaleString("th-TH", {
              maximumFractionDigits: 2,
            })}`}
          />
          <MetricBox
            label="ยอดจ่ายรวม"
            value={`฿${plan.totalPaid.toLocaleString("th-TH", {
              maximumFractionDigits: 2,
            })}`}
          />
          <MetricBox
            label="ลำดับที่ปิดก่อน"
            value={payoffPreview || "ยังไม่มีข้อมูล"}
            compact
          />
        </div>

        {savings && savings > 0 ? (
          <p className="mt-3 text-sm font-medium text-green-600 dark:text-green-400">
            ประหยัดดอกเบี้ยได้ประมาณ ฿
            {savings.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricBox({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-secondary/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={compact ? "mt-1 text-sm font-medium" : "mt-1 font-semibold"}>
        {value}
      </p>
    </div>
  );
}
