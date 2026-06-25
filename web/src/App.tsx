import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { JsonPanel } from './components/JsonPanel'
import { AdvancedSettings } from './components/advanced/AdvancedSettings'
import type { AdvancedSection, TariffSourceMode } from './components/advanced/AdvancedSettings'
import { NativeSelect } from './components/controls/NativeSelect'
import { CalculationSettings } from './components/settings/CalculationSettings'
import { ChargingSession } from './components/session/ChargingSession'
import { TariffSetup } from './components/tariff/TariffSetup'
import { Alert, AlertDescription } from './components/ui/alert'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Label } from './components/ui/label'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { CostBreakdown } from './components/result/CostBreakdown'
import { CostChart } from './components/result/CostChart'
import { CostTimeSeries } from './components/result/CostTimeSeries'
import { VerdictView } from './components/result/VerdictView'
import { COMMON_CURRENCIES, TIME_ZONES, optionsWithCurrent } from './lib/options'
import { deserialize, reportMoneyToCdr, serialize, serializeTariff } from './lib/serialize'
import { computeCostSeries } from './lib/timeseries'
import type { CostSeriesPoint } from './lib/timeseries'
import { decodeState, encodeState } from './lib/urlstate'
import type { PersistedState } from './lib/urlstate'
import type { SimForm } from './model/forms'
import type { Report, Verdict } from './model/dto'
import { defaultPreset, presets } from './presets'
import { calculate, calculateWithTariff, verify, verifyWithTariff } from './wasm/api'
import type { EngineOptions, Version } from './wasm/api'

type View = PersistedState['view']

function cloneForm(form: SimForm): SimForm {
  return JSON.parse(JSON.stringify(form)) as SimForm
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readBootState(): PersistedState | null {
  return typeof window === 'undefined' ? null : decodeState(window.location.hash)
}

export function App() {
  const bootRef = useRef<PersistedState | null | undefined>(undefined)
  if (bootRef.current === undefined) {
    bootRef.current = readBootState()
  }
  const boot = bootRef.current

  const [version, setVersion] = useState<Version>(() => boot?.version ?? '2.2.1')
  const [timeZone, setTimeZone] = useState<string>(() => boot?.timeZone ?? '')
  const [currencyPrecision, setCurrencyPrecision] = useState<number>(() => boot?.currencyPrecision ?? 2)
  const [presetKey, setPresetKey] = useState(() => boot?.presetKey ?? defaultPreset)
  const [form, setForm] = useState<SimForm>(() => (boot ? cloneForm(boot.form) : cloneForm(presets[defaultPreset])))
  const [rawJson, setRawJson] = useState<string | null>(() => boot?.rawJson ?? null)
  const [parseError, setParseError] = useState<string | undefined>()
  const [calc, setCalc] = useState<Report | null>(null)
  const [verd, setVerd] = useState<Verdict | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [view, setView] = useState<View>(() => boot?.view ?? 'form')
  const [mode, setMode] = useState<TariffSourceMode>(() => boot?.mode ?? 'embedded')
  const [timeSeriesUnit, setTimeSeriesUnit] = useState<number>(() => boot?.timeSeriesUnit ?? 10)
  const [series, setSeries] = useState<CostSeriesPoint[]>([])
  const [runNonce, setRunNonce] = useState(0)
  const [advancedOpen, setAdvancedOpen] = useState<AdvancedSection | undefined>()
  const requestIdRef = useRef(0)
  const timeSeriesRequestIdRef = useRef(0)
  const skipFirstPersistRef = useRef(true)
  const initialPersistEncodedRef = useRef<string | null>(null)
  const hasPersistableChangeRef = useRef(false)

  const serializedText = useMemo(() => JSON.stringify(serialize(form, version), null, 2), [form, version])
  const tariffIds = useMemo(() => form.tariffs.map((tariff) => tariff.id).filter(Boolean), [form.tariffs])

  const replaceForm = (next: SimForm) => {
    setForm(next)
    setRawJson(null)
    setParseError(undefined)
    setEngineError(null)
    setResultError(null)
  }

  const patchForm = (patch: Partial<SimForm>) => replaceForm({ ...form, ...patch })

  // The engine requires the CDR currency to match every tariff currency, so changing
  // the CDR currency cascades to all tariffs (avoids a spurious "currency mismatch").
  const setCurrency = (currency: string) =>
    patchForm({ currency, tariffs: form.tariffs.map((tariff) => ({ ...tariff, currency })) })

  const selectPreset = (key: string) => {
    setPresetKey(key)
    replaceForm(cloneForm(presets[key]))
  }

  const selectVersion = (nextVersion: Version) => {
    setVersion(nextVersion)
    setRawJson(null)
    setParseError(undefined)
    setEngineError(null)
    setResultError(null)
  }

  const selectMode = (nextMode: TariffSourceMode) => {
    setMode(nextMode)
    setRawJson(null)
    setParseError(undefined)
    setEngineError(null)
    setResultError(null)
  }

  const showJson = () => {
    if (rawJson == null) {
      setRawJson(serializedText)
    }
    setParseError(undefined)
    setView('json')
  }

  const showForm = () => setView('form')

  const onJsonChange = (text: string) => {
    setRawJson(text)
    setEngineError(null)
    setResultError(null)
    try {
      const parsed = JSON.parse(text)
      setParseError(undefined)
      setForm(deserialize(parsed, version))
    } catch (parseOrDeserializeError) {
      setParseError(messageFromError(parseOrDeserializeError))
    }
  }

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.history ||
      typeof window.history.replaceState !== 'function'
    ) {
      return
    }

    const encodedState = encodeState({
      v: 1,
      version,
      mode,
      timeZone,
      currencyPrecision,
      view,
      form,
      rawJson,
      presetKey,
      timeSeriesUnit,
    })

    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false
      initialPersistEncodedRef.current = encodedState
      return
    }

    if (encodedState !== initialPersistEncodedRef.current) {
      hasPersistableChangeRef.current = true
    }

    if (!hasPersistableChangeRef.current) {
      return
    }

    const timeout = window.setTimeout(() => {
      try {
        window.history.replaceState(null, '', `#${encodedState}`)
      } catch {
        // URL persistence is best-effort; oversized or blocked history writes should not break the simulator.
      }
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [currencyPrecision, form, mode, presetKey, rawJson, timeSeriesUnit, timeZone, version, view])

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const timeout = window.setTimeout(() => {
      void (async () => {
        const isLatest = () => requestIdRef.current === requestId
        const runErrors: string[] = []

        if (!isLatest()) return
        setEngineError(null)
        setResultError(null)

        if (mode === 'override' && form.tariffs.length === 0) {
          setCalc(null)
          setVerd(null)
          setResultError('Override mode needs a tariff')
          setIsComputing(false)
          return
        }

        setIsComputing(true)

        try {
          const engineOptions: EngineOptions = {
            ...(currencyPrecision >= 0 ? { currencyPrecision } : {}),
            ...(timeZone ? { timeZone } : {}),
          }
          const input = rawJson != null ? rawJson : serialize(form, version)
          const overrideTariff =
            mode === 'override' ? serializeTariff(form.tariffs[0], version, form.countryCode, form.start) : null
          const calculation =
            mode === 'override' && overrideTariff != null
              ? await calculateWithTariff(version, input, overrideTariff, engineOptions)
              : await calculate(version, input, engineOptions)
          if (!isLatest()) return

          if (calculation.ok && calculation.report) {
            setCalc(calculation.report)
          } else {
            setCalc(null)
            runErrors.push(calculation.error ?? 'Calculate failed')
          }

          if (rawJson != null) {
            const response =
              mode === 'override' && overrideTariff != null
                ? await verifyWithTariff(version, rawJson, overrideTariff, engineOptions)
                : await verify(version, rawJson, engineOptions)
            if (!isLatest()) return

            if (response.ok && response.verdict) {
              setVerd(response.verdict)
            } else {
              setVerd(null)
              runErrors.push(response.error ?? 'Verify failed')
            }
          } else if (calculation.ok && calculation.report) {
            const cdr = serialize(form, version) as Record<string, unknown>
            if (!form.embedded.totalCost) {
              cdr.total_cost = reportMoneyToCdr(calculation.report.totalCost, version)
            }

            const response =
              mode === 'override' && overrideTariff != null
                ? await verifyWithTariff(version, cdr, overrideTariff, engineOptions)
                : await verify(version, cdr, engineOptions)
            if (!isLatest()) return

            if (response.ok && response.verdict) {
              setVerd(response.verdict)
            } else {
              setVerd(null)
              runErrors.push(response.error ?? 'Verify failed')
            }
          } else {
            setVerd(null)
          }

          setResultError(runErrors.length ? runErrors.join('\n') : null)
        } catch (runError) {
          if (isLatest()) {
            setCalc(null)
            setVerd(null)
            setEngineError(messageFromError(runError))
          }
        } finally {
          if (isLatest()) {
            setIsComputing(false)
          }
        }
      })()
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      if (requestIdRef.current === requestId) {
        requestIdRef.current += 1
      }
    }
  }, [currencyPrecision, form, mode, rawJson, runNonce, timeZone, version])

  useEffect(() => {
    const requestId = timeSeriesRequestIdRef.current + 1
    timeSeriesRequestIdRef.current = requestId
    const isLatest = () => timeSeriesRequestIdRef.current === requestId

    if (mode === 'override' && form.tariffs.length === 0) {
      setSeries([])
      return
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const engineOptions: EngineOptions = {
            ...(currencyPrecision >= 0 ? { currencyPrecision } : {}),
            ...(timeZone ? { timeZone } : {}),
          }
          const input = rawJson != null ? JSON.parse(rawJson) : serialize(form, version)
          if (input == null || typeof input !== 'object' || Array.isArray(input)) {
            throw new Error('CDR input must be a JSON object')
          }
          const overrideTariff =
            mode === 'override' ? serializeTariff(form.tariffs[0], version, form.countryCode, form.start) : null
          const nextSeries = await computeCostSeries({
            cdr: input as Record<string, unknown>,
            version,
            mode,
            unitMinutes: timeSeriesUnit,
            engineOptions,
            overrideTariff,
          })

          if (isLatest()) {
            setSeries(nextSeries)
          }
        } catch {
          if (isLatest()) {
            setSeries([])
          }
        }
      })()
    }, 400)

    return () => {
      window.clearTimeout(timeout)
      if (timeSeriesRequestIdRef.current === requestId) {
        timeSeriesRequestIdRef.current += 1
      }
    }
  }, [currencyPrecision, form, mode, rawJson, timeSeriesUnit, timeZone, version])

  return (
    <main className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-normal">gocpi pricing simulator</h1>
                <Badge variant="secondary">OCPI {version}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Build a CDR pricing scenario, run the OCPI engine, and compare calculated totals.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 xl:min-w-[920px]">
              <div className="space-y-2">
                <Label htmlFor="header-preset">Preset</Label>
                <NativeSelect id="header-preset" value={presetKey} onChange={(event) => selectPreset(event.currentTarget.value)}>
                  {Object.keys(presets).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="header-currency">Currency</Label>
                <NativeSelect id="header-currency" value={form.currency} onChange={(event) => setCurrency(event.currentTarget.value)}>
                  {optionsWithCurrent(COMMON_CURRENCIES, form.currency).map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="header-time-zone">Time zone</Label>
                <NativeSelect id="header-time-zone" value={timeZone} onChange={(event) => setTimeZone(event.currentTarget.value)}>
                  <option value="">(infer from country)</option>
                  {TIME_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="header-version">Version</Label>
                <NativeSelect id="header-version" value={version} onChange={(event) => selectVersion(event.currentTarget.value as Version)}>
                  <option value="2.2.1">2.2.1</option>
                  <option value="2.3.0">2.3.0</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col justify-end gap-2">
                <Button type="button" onClick={() => setRunNonce((nonce) => nonce + 1)} disabled={isComputing}>
                  {isComputing ? 'Calculating...' : 'Calculate'}
                </Button>
                <p className="text-xs text-muted-foreground">Auto-updates on change</p>
              </div>
            </div>
          </div>
          <Tabs
            value={view}
            onValueChange={(nextView) => {
              if (nextView === 'json') {
                showJson()
              } else {
                showForm()
              }
            }}
          >
            <TabsList aria-label="Input view">
              <TabsTrigger value="form" onClick={showForm}>
                Form
              </TabsTrigger>
              <TabsTrigger value="json" onClick={showJson}>
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(360px,1fr)] lg:px-6">
        <section aria-label="Simulator input" className="min-w-0">
          {engineError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{engineError}</AlertDescription>
            </Alert>
          )}

          {view === 'form' ? (
            <div className="space-y-5">
              <CalculationSettings
                value={form}
                timeZone={timeZone}
                onCurrencyChange={setCurrency}
                onCountryChange={(countryCode) => patchForm({ countryCode })}
                onTimeZoneChange={setTimeZone}
                onStartChange={(start) => patchForm({ start })}
                onEndChange={(end) => patchForm({ end })}
              />
              <TariffSetup
                value={form}
                onChange={replaceForm}
                onOpenAdvancedTariffs={() => setAdvancedOpen('tariffs-rules')}
              />
              <ChargingSession
                value={form.periods}
                calculationStart={form.start}
                tariffIds={tariffIds}
                hideTariffId={mode === 'override'}
                onChange={(periods) => patchForm({ periods })}
              />
              <AdvancedSettings
                value={form}
                version={version}
                mode={mode}
                currencyPrecision={currencyPrecision}
                openValue={advancedOpen}
                onOpenChange={setAdvancedOpen}
                onChange={replaceForm}
                onModeChange={selectMode}
                onCurrencyPrecisionChange={setCurrencyPrecision}
              />
            </div>
          ) : (
            <JsonPanel text={rawJson ?? serializedText} onChange={onJsonChange} parseError={parseError} />
          )}
        </section>

        <aside aria-label="Engine results" className="min-w-0">
          <div className="sticky top-4 space-y-4">
            <Card className="rounded-md">
              <CardHeader className="p-5">
                <CardTitle className="text-lg">Result summary</CardTitle>
                <CardDescription>Total cost summary is redesigned in Phase 1B.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                {calc ? (
                  <p className="text-sm text-muted-foreground">
                    Current result currency: <span className="font-medium text-foreground">{calc.currency}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No calculation yet</p>
                )}
              </CardContent>
            </Card>
            {isComputing && (
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                computing...
              </p>
            )}
            {resultError && (
              <Alert variant="destructive">
                <AlertDescription>{resultError}</AlertDescription>
              </Alert>
            )}
            {calc ? (
              <>
                <CostChart report={calc} />
                <CostTimeSeries
                  series={series}
                  unitMinutes={timeSeriesUnit}
                  onUnitChange={setTimeSeriesUnit}
                  currency={form.currency}
                />
                <CostBreakdown report={calc} />
              </>
            ) : (
              <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">No calculation yet</p>
            )}
            {verd ? <VerdictView verdict={verd} /> : <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">No verification yet</p>}
          </div>
        </aside>
      </div>
    </main>
  )
}

export default App
