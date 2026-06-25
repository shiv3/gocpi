export type TaxIncluded = 'YES' | 'NO' | 'N/A'
export type DimType = 'ENERGY' | 'TIME' | 'PARKING_TIME' | 'FLAT'
export interface ComponentForm {
  type: DimType
  price: string
  stepSize: number
  vat?: string
}
export interface RestrictionForm {
  startTime?: string
  endTime?: string
  minKwh?: string
  maxKwh?: string
}
export interface ElementForm {
  restriction?: RestrictionForm
  components: ComponentForm[]
}
export interface TariffForm {
  id: string
  currency: string
  taxIncluded: TaxIncluded
  minPrice?: string
  maxPrice?: string
  elements: ElementForm[]
}
export interface DimensionForm {
  type: Exclude<DimType, 'FLAT'> | 'ENERGY' | 'TIME' | 'PARKING_TIME'
  volume: string
}
export interface PeriodForm {
  start: string
  tariffId?: string
  dimensions: DimensionForm[]
}
export interface EmbeddedTotalsForm {
  totalCost?: string
  totalEnergy?: string
  totalTime?: string
  totalEnergyCost?: string
  totalTimeCost?: string
  totalParkingCost?: string
  totalFixedCost?: string
}
export interface SimForm {
  currency: string
  countryCode: string
  start: string
  end: string
  tariffs: TariffForm[]
  periods: PeriodForm[]
  embedded: EmbeddedTotalsForm
}
