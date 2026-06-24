export interface Tax {
  name: string | null
  percent: string | null
  amount: string | null
}

export interface Money {
  beforeTaxes: string
  afterTaxes: string | null
  taxes: Tax[]
}

export interface DimensionResult {
  volume: string
  cost: Money
}

export interface Warning {
  code: string
  kind: 'warning' | 'diagnostic'
  message: string
  periodIndex: number | null
  tariffIndex: number | null
  dimension: string | null
}

export interface Report {
  currency: string
  totalCost: Money
  totalEnergyCost: Money
  totalTimeCost: Money
  totalParkingCost: Money
  totalFixedCost: Money
  totalReservationCost: Money | null
  dimensions: Record<string, DimensionResult>
  warnings: Warning[]
}

export interface Mismatch {
  field: string
  computed: string
  embedded: string
  delta: string
}

export interface Verdict {
  status: 'OK' | 'Mismatch' | 'NotVerifiable'
  mismatches: Mismatch[]
  warnings: Warning[]
}

export interface CalculateResponse {
  ok: boolean
  error: string | null
  report?: Report
}

export interface VerifyResponse {
  ok: boolean
  error: string | null
  verdict?: Verdict
}
