import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import type { Report } from '@/model/dto'
import { CostChart } from './CostChart'
import { CostTimeSeries } from './CostTimeSeries'

export interface CostAnalysisProps {
  report: Report
  series: { t: string; label: string; cost: number }[]
  unitMinutes: number
  onUnitChange(unitMinutes: number): void
  currency: string
}

export function CostAnalysis({ report, series, unitMinutes, onUnitChange, currency }: CostAnalysisProps) {
  return (
    <Card className="rounded-md">
      <CardContent className="p-5">
        <Accordion type="single" collapsible defaultValue="cost-analysis">
          <AccordionItem value="cost-analysis">
            <AccordionTrigger>Cost analysis</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <CostChart report={report} />
              <CostTimeSeries
                series={series}
                unitMinutes={unitMinutes}
                onUnitChange={onUnitChange}
                currency={currency}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
