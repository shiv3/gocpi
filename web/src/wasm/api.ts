import { loadEngine } from './loader'
import type { CalculateResponse, VerifyResponse } from '../model/dto'

export type Version = '2.2.1' | '2.3.0'
export interface EngineOptions {
  currencyPrecision?: number
  timeZone?: string
  tolerance?: string
}

async function ensure() {
  await loadEngine()
}

export const toCdrJson = (cdr: unknown): string => (typeof cdr === 'string' ? cdr : JSON.stringify(cdr))

export async function calculate(version: Version, cdr: unknown, opts: EngineOptions): Promise<CalculateResponse> {
  await ensure()
  const raw = (window as any).gocpiCalculate(version, toCdrJson(cdr), JSON.stringify(opts))
  return JSON.parse(raw) as CalculateResponse
}

export async function verify(version: Version, cdr: unknown, opts: EngineOptions): Promise<VerifyResponse> {
  await ensure()
  const raw = (window as any).gocpiVerify(version, toCdrJson(cdr), JSON.stringify(opts))
  return JSON.parse(raw) as VerifyResponse
}
