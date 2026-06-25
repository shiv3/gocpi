import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { money } from '@/lib/units'
import { cn } from '@/lib/utils'
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
  const afterTaxesText = money(afterTaxes, currency)
  const beforeTaxesText = money(beforeTaxes, currency)
  const vatText = vat == null ? '—' : money(vat, currency)
  const flashClass = 'animate-value-flash rounded-sm px-1 -mx-1'

  return (
    <Card className="rounded-md">
      <CardHeader className="p-5">
        <CardTitle className="text-lg">Result summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Total after tax</p>
          <p
            key={afterTaxesText}
            aria-label="Total after tax"
            data-value-key={afterTaxesText}
            className={cn('text-4xl font-semibold tracking-normal', flashClass)}
          >
            {afterTaxesText}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Before tax</p>
            <p
              key={beforeTaxesText}
              aria-label="Before tax"
              data-value-key={beforeTaxesText}
              className={cn('text-lg font-semibold', flashClass)}
            >
              {beforeTaxesText}
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">VAT</p>
            <p key={vatText} aria-label="VAT" data-value-key={vatText} className={cn('text-lg font-semibold', flashClass)}>
              {vatText}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
