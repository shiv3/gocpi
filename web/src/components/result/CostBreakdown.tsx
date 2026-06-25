import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { money, usageUnitLabel } from '@/lib/units'
import type { DimensionResult, Money, Report } from '@/model/dto'

const DIMENSIONS = ['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT'] as const

type DimensionName = (typeof DIMENSIONS)[number]

export interface CostBreakdownProps {
  report: Report
  currency: string
}

const ITEM_LABELS: Record<DimensionName, string> = {
  ENERGY: 'Energy',
  TIME: 'Charging time',
  PARKING_TIME: 'Parking time',
  FLAT: 'Flat fee',
}

const TOTAL_COST_BY_DIMENSION: Record<DimensionName, keyof Report> = {
  ENERGY: 'totalEnergyCost',
  TIME: 'totalTimeCost',
  PARKING_TIME: 'totalParkingCost',
  FLAT: 'totalFixedCost',
}

function numericValue(value: string | null | undefined): number {
  if (value == null || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasCost(value: Money | null | undefined): boolean {
  return numericValue(value?.beforeTaxes) !== 0 || numericValue(value?.afterTaxes) !== 0
}

function isUsed(dimension: DimensionResult | undefined, cost: Money | null | undefined): boolean {
  return numericValue(dimension?.volume) !== 0 || hasCost(dimension?.cost) || hasCost(cost)
}

function formatUsage(dimension: DimensionResult | undefined, name: DimensionName): string {
  if (!dimension?.volume) return 'Not used'

  const unit = usageUnitLabel(name)
  return unit ? `${dimension.volume} ${unit}` : dimension.volume
}

function formatMoneyValue(value: string | null | undefined, currency: string): string {
  return money(value, currency)
}

export function CostBreakdown({ report, currency }: CostBreakdownProps) {
  const rows = DIMENSIONS.flatMap((name) => {
    const dimension = report.dimensions[name]
    const totalCost = report[TOTAL_COST_BY_DIMENSION[name]] as Money
    const cost = dimension?.cost ?? totalCost

    if (!isUsed(dimension, cost)) return []

    return [{ name, dimension, cost }]
  })

  return (
    <Card className="rounded-md">
      <CardHeader className="p-5">
        <CardTitle className="text-lg">Cost breakdown</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No used dimensions.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Before tax</TableHead>
                <TableHead>After tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{ITEM_LABELS[row.name]}</TableCell>
                  <TableCell>{formatUsage(row.dimension, row.name)}</TableCell>
                  <TableCell>{formatMoneyValue(row.cost.beforeTaxes, currency)}</TableCell>
                  <TableCell>{formatMoneyValue(row.cost.afterTaxes, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
