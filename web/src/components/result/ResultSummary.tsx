import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { money } from '@/lib/units'
import type { Report } from '@/model/dto'

export interface ResultSummaryProps {
  report: Report
  currency: string
}

function decimalPlaces(value: string): number {
  const [, decimals = ''] = value.split('.')
  return decimals.length
}

function subtractMoney(afterTaxes: string | null, beforeTaxes: string): string | null {
  if (afterTaxes == null) return null

  const after = Number(afterTaxes)
  const before = Number(beforeTaxes)
  if (!Number.isFinite(after) || !Number.isFinite(before)) return null

  const places = Math.max(decimalPlaces(afterTaxes), decimalPlaces(beforeTaxes))
  return (after - before).toFixed(places)
}

export function ResultSummary({ report, currency }: ResultSummaryProps) {
  const beforeTaxes = report.totalCost.beforeTaxes
  const afterTaxes = report.totalCost.afterTaxes ?? beforeTaxes
  const vat = subtractMoney(report.totalCost.afterTaxes, beforeTaxes)

  return (
    <Card className="rounded-md">
      <CardHeader className="p-5">
        <CardTitle className="text-lg">Result summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Total after tax</p>
          <p aria-label="Total after tax" className="text-4xl font-semibold tracking-normal">
            {money(afterTaxes, currency)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Before tax</p>
            <p aria-label="Before tax" className="text-lg font-semibold">
              {money(beforeTaxes, currency)}
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">VAT</p>
            <p aria-label="VAT" className="text-lg font-semibold">
              {vat == null ? '—' : money(vat, currency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
