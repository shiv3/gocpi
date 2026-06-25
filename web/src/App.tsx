import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { JsonPanel } from './components/JsonPanel'
import type { JsonSyncStatus } from './components/JsonPanel'
import { AdvancedSettings } from './components/advanced/AdvancedSettings'
import type { AdvancedSection, TariffSourceMode } from './components/advanced/AdvancedSettings'
import { NativeSelect } from './components/controls/NativeSelect'
import { CalculationSettings } from './components/settings/CalculationSettings'
import { PresetPicker } from './components/settings/PresetPicker'
import { ChargingSession } from './components/session/ChargingSession'
import { TariffSetup } from './components/tariff/TariffSetup'
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Label } from './components/ui/label'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { Toaster } from './components/ui/sonner'
import { CostAnalysis } from './components/result/CostAnalysis'
import { CostBreakdown } from './components/result/CostBreakdown'
import { ResultSummary } from './components/result/ResultSummary'
import { ValidationResult } from './components/result/ValidationResult'
import { COMMON_CURRENCIES, TIME_ZONES, optionsWithCurrent } from './lib/options'
import { deserialize, reportMoneyToCdr, serialize, serializeTariff } from './lib/serialize'
import { computeCostSeries } from './lib/timeseries'
import type { CostSeriesPoint } from './lib/timeseries'
import { applyUpdater } from './lib/updater'
import type { Updater } from './lib/updater'
import { decodeState, encodeState } from './lib/urlstate'
import type { PersistedState } from './lib/urlstate'
import type { PeriodForm, SimForm } from './model/forms'
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

function formMatchesPreset(form: SimForm, key: string): boolean {
  return presets[key] != null && JSON.stringify(form) === JSON.stringify(presets[key])
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
  const [isPresetDirty, setIsPresetDirty] = useState(() =>
    boot ? !formMatchesPreset(boot.form, boot.presetKey ?? defaultPreset) : false,
  )
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
  const headerTimeZoneRef = useRef<HTMLSelectElement>(null)
  const skipFirstPersistRef = useRef(true)
  const initialPersistEncodedRef = useRef<string | null>(null)
  const hasPersistableChangeRef = useRef(false)

  const serializedText = useMemo(() => JSON.stringify(serialize(form, version), null, 2), [form, version])
  const jsonSyncStatus: JsonSyncStatus = parseError
    ? 'invalid'
    : rawJson == null || rawJson === serializedText
      ? 'synced'
      : 'unsaved'
  const tariffIds = useMemo(() => form.tariffs.map((tariff) => tariff.id).filter(Boolean), [form.tariffs])

  const replaceForm = (next: Updater<SimForm>, options: { markCustom?: boolean } = {}) => {
    setForm((prev) => applyUpdater(next, prev))
    if (options.markCustom ?? true) {
      setIsPresetDirty(true)
    }
    setRawJson(null)
    setParseError(undefined)
    setEngineError(null)
    setResultError(null)
  }

  const patchForm = (patch: Partial<SimForm>) => replaceForm((prev) => ({ ...prev, ...patch }))

  // The engine requires the CDR currency to match every tariff currency, so changing
  // the CDR currency cascades to all tariffs (avoids a spurious "currency mismatch").
  const setCurrency = (currency: string) =>
    replaceForm((prev) => ({ ...prev, currency, tariffs: prev.tariffs.map((tariff) => ({ ...tariff, currency })) }))

  const updatePeriods = (next: Updater<PeriodForm[]>) =>
    replaceForm((prev) => ({ ...prev, periods: applyUpdater(next, prev.periods) }))

  const selectPreset = (key: string) => {
    setPresetKey(key)
    setIsPresetDirty(false)
    replaceForm(cloneForm(presets[key]), { markCustom: false })
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
    setView('json')
  }

  const showForm = () => setView('form')

  const openValidationTarget = (target: string) => {
    if (target === 'header-time-zone') {
      headerTimeZoneRef.current?.focus()
      return
    }

    setView('form')

    if (target === 'calculation-settings') {
      window.requestAnimationFrame(() => document.getElementById('calculation-start')?.focus())
      return
    }

    setAdvancedOpen(target as AdvancedSection)
  }

  const onJsonChange = (text: string) => {
    setRawJson(text)
    setEngineError(null)
    setResultError(null)
    try {
      const parsed = JSON.parse(text)
      setParseError(undefined)
      setForm(deserialize(parsed, version))
      setIsPresetDirty(true)
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
    <>
      <main className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:gap-6">
            <div className="space-y-1 xl:shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="whitespace-nowrap text-xl font-semibold tracking-normal">gocpi pricing simulator</h1>
                <Badge variant="secondary">OCPI {version}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Build a CDR pricing scenario, run the OCPI engine, and compare calculated totals.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 xl:flex-1">
              <PresetPicker value={presetKey} isCustom={isPresetDirty} onChange={selectPreset} />
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
                <NativeSelect
                  ref={headerTimeZoneRef}
                  id="header-time-zone"
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.currentTarget.value)}
                >
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

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(360px,1fr)] xl:grid-cols-[minmax(0,2.4fr)_minmax(340px,1fr)] lg:px-6">
        <section aria-label="Simulator input" className="min-w-0">
          {view === 'form' ? (
            <div className="space-y-4">
              {parseError && (
                <Alert variant="destructive" className="py-3">
                  <AlertTitle>Invalid JSON</AlertTitle>
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                <div className="space-y-4">
                  <CalculationSettings
                    value={form}
                    timeZone={timeZone}
                    onCurrencyChange={setCurrency}
                    onCountryChange={(countryCode) => patchForm({ countryCode })}
                    onTimeZoneChange={setTimeZone}
                    onStartChange={(start) => patchForm({ start })}
                    onEndChange={(end) => patchForm({ end })}
                  />
                  <ChargingSession
                    value={form.periods}
                    calculationStart={form.start}
                    tariffIds={tariffIds}
                    hideTariffId={mode === 'override'}
                    onChange={updatePeriods}
                  />
                </div>
                <div className="space-y-4">
                  <TariffSetup
                    value={form}
                    onChange={replaceForm}
                    onOpenAdvancedTariffs={() => setAdvancedOpen('tariffs-rules')}
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
              </div>
            </div>
          ) : (
            <JsonPanel
              text={rawJson ?? serializedText}
              onChange={onJsonChange}
              parseError={parseError}
              syncStatus={jsonSyncStatus}
            />
          )}
        </section>

        <aside aria-label="Engine results" className="min-w-0">
          <div className="sticky top-4 space-y-3">
            {(engineError || resultError) && (
              <Alert variant="destructive">
                <AlertTitle>Calculation problem</AlertTitle>
                <AlertDescription>{engineError ?? resultError}</AlertDescription>
              </Alert>
            )}
            {isComputing && (
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                computing...
              </p>
            )}
            {calc ? (
              <>
                <ResultSummary report={calc} currency={form.currency} />
                <CostBreakdown report={calc} currency={form.currency} />
              </>
            ) : (
              <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">No calculation yet</p>
            )}
            {verd ? (
              <ValidationResult verdict={verd} onOpenAdvanced={openValidationTarget} />
            ) : (
              <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">No verification yet</p>
            )}
            {calc && (
              <CostAnalysis
                report={calc}
                series={series}
                unitMinutes={timeSeriesUnit}
                onUnitChange={setTimeSeriesUnit}
                currency={form.currency}
              />
            )}
          </div>
        </aside>
      </div>
      </main>
      <Toaster />
    </>
  )
}

export default App
