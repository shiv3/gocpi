import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Verdict, Warning } from '@/model/dto'

interface WarningAction {
  label: string
  target: string
}

interface WarningCopy {
  message: string
  actions?: WarningAction[]
}

const WARNING_COPY: Record<string, WarningCopy> = {
  WarnAfterTaxNotDerivable: {
    message: 'The after-tax total could not be verified from the embedded data. Check the VAT rate or embedded totals.',
    actions: [
      { label: 'Check tax settings', target: 'tariffs-rules' },
      { label: 'Open embedded totals', target: 'embedded-totals' },
    ],
  },
  WarnPeriodNoTariff: {
    message: 'A charging period has no matching tariff and was priced as zero.',
    actions: [{ label: 'Check tariff / usage', target: 'tariffs-rules' }],
  },
  WarnMinMaxUndefinedMultiTariff: {
    message: 'Min/max price was not applied because more than one tariff priced the session.',
  },
  WarnMixedStepSize: {
    message: 'Different billing units were used for the same usage type; the last one was applied.',
  },
  WarnUnusedTariff: {
    message: 'A tariff was defined but never used.',
  },
  WarnTariffWindow: {
    message: "The session falls outside the tariff's validity window.",
  },
  WarnPeriodOutsideBounds: {
    message: 'A charging period starts outside the calculation period.',
    actions: [{ label: 'Check Start/End time', target: 'calculation-settings' }],
  },
  WarnUnknownDimension: {
    message: 'An unrecognized usage type was ignored.',
  },
  WarnNoElement: {
    message: 'Some usage matched no price component in the tariff, so it was not priced.',
    actions: [{ label: 'Check tariff / usage', target: 'tariffs-rules' }],
  },
  WarnUnsupportedRestriction: {
    message: 'A tariff rule used a condition the engine cannot evaluate and was skipped.',
  },
  WarnReservationNotComputed: {
    message: 'Reservation cost is not computed; that part could not be verified.',
  },
  WarnBoundaryCross: {
    message: 'A local-time rule boundary was crossed during a charging period.',
  },
  WarnTZInferred: {
    message: 'Time zone was inferred from the country.',
    actions: [{ label: 'Set time zone', target: 'header-time-zone' }],
  },
  WarnTZUTC: {
    message: 'No time zone was available; calculated in UTC.',
    actions: [{ label: 'Set time zone', target: 'header-time-zone' }],
  },
}

export interface ValidationResultProps {
  verdict: Verdict
  onOpenAdvanced(target: string): void
}

function statusLabel(verdict: Verdict): 'Success' | 'Warning' | 'Error' | 'Not verifiable' {
  if (verdict.status === 'Mismatch') return 'Error'
  if (verdict.status === 'NotVerifiable') return 'Not verifiable'
  return verdict.warnings.length > 0 ? 'Warning' : 'Success'
}

function badgeVariant(label: ReturnType<typeof statusLabel>) {
  if (label === 'Error') return 'destructive'
  if (label === 'Success') return 'secondary'
  return 'outline'
}

function warningCopy(warning: Warning): WarningCopy {
  return WARNING_COPY[warning.code] ?? { message: warning.message }
}

function warningKindLabel(kind: Warning['kind']): string {
  return kind === 'diagnostic' ? 'Diagnostic' : 'Warning'
}

function TechnicalDetails({ verdict }: { verdict: Verdict }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="technical-details">
        <AccordionTrigger>Show technical details</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Status:</span> {verdict.status}
            </p>
            {verdict.warnings.length > 0 && (
              <ul className="space-y-2">
                {verdict.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>
                    <span className="font-medium text-foreground">{warning.code}</span>
                    {warning.message ? ` - ${warning.message}` : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export function ValidationResult({ verdict, onOpenAdvanced }: ValidationResultProps) {
  const label = statusLabel(verdict)
  const hasWarnings = verdict.warnings.length > 0
  const hasMismatches = verdict.mismatches.length > 0
  const Icon = label === 'Success' ? CheckCircle2 : label === 'Error' ? AlertCircle : label === 'Warning' ? TriangleAlert : Info

  return (
    <Card className="rounded-md">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4">
        <CardTitle className="text-base">Validation result</CardTitle>
        <Badge variant={badgeVariant(label)}>{label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <Alert variant={label === 'Error' ? 'destructive' : 'default'}>
          <Icon className="h-4 w-4" />
          <AlertTitle>{label}</AlertTitle>
          <AlertDescription>
            {hasMismatches
              ? 'Embedded totals do not match the calculated result.'
              : hasWarnings
                ? 'The result was calculated with warnings.'
                : 'No mismatches found.'}
          </AlertDescription>
        </Alert>

        {hasWarnings && (
          <div className="space-y-3">
            {verdict.warnings.map((warning, index) => {
              const copy = warningCopy(warning)
              return (
                <div key={`${warning.code}-${index}`} className="rounded-md border bg-background p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline">{warningKindLabel(warning.kind)}</Badge>
                  </div>
                  <p className="text-sm text-foreground">{copy.message}</p>
                  {copy.actions && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {copy.actions.map((action) => (
                        <Button
                          key={`${warning.code}-${action.label}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenAdvanced(action.target)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <section aria-labelledby="validation-heading" className="space-y-3">
          <h3 id="validation-heading" className="text-sm font-medium">
            Validation
          </h3>
          {hasMismatches ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Computed</TableHead>
                  <TableHead>Embedded</TableHead>
                  <TableHead>Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verdict.mismatches.map((mismatch) => (
                  <TableRow key={mismatch.field}>
                    <TableCell className="font-medium">{mismatch.field}</TableCell>
                    <TableCell>{mismatch.computed}</TableCell>
                    <TableCell>{mismatch.embedded}</TableCell>
                    <TableCell>{mismatch.delta}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No mismatches found</p>
          )}
        </section>

        <TechnicalDetails verdict={verdict} />
      </CardContent>
    </Card>
  )
}
