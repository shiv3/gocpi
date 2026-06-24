import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { JsonPanel } from './components/JsonPanel'
import { ChargingPeriodEditor } from './components/form/ChargingPeriodEditor'
import { EmbeddedTotalsEditor } from './components/form/EmbeddedTotalsEditor'
import { TariffEditor } from './components/form/TariffEditor'
import { CostBreakdown } from './components/result/CostBreakdown'
import { CostChart } from './components/result/CostChart'
import { VerdictView } from './components/result/VerdictView'
import { fromLocalInput, toLocalInput } from './lib/datetime'
import { COMMON_COUNTRY_CODES, COMMON_CURRENCIES, optionsWithCurrent } from './lib/options'
import { deserialize, reportMoneyToCdr, serialize } from './lib/serialize'
import type { ElementForm, PeriodForm, SimForm, TariffForm } from './model/forms'
import type { Report, Verdict } from './model/dto'
import { defaultPreset, presets } from './presets'
import { calculate, verify } from './wasm/api'
import type { EngineOptions, Version } from './wasm/api'

type View = 'form' | 'json'

const engineOptions: EngineOptions = {}

function cloneForm(form: SimForm): SimForm {
  return JSON.parse(JSON.stringify(form)) as SimForm
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function defaultElement(): ElementForm {
  return { components: [{ type: 'ENERGY', price: '0', stepSize: 1 }] }
}

function defaultTariff(currency: string, index: number): TariffForm {
  return {
    id: `tariff-${index + 1}`,
    currency: currency || 'EUR',
    taxIncluded: 'NO',
    elements: [defaultElement()],
  }
}

function defaultPeriod(start: string, tariffId?: string): PeriodForm {
  return {
    start,
    tariffId,
    dimensions: [{ type: 'ENERGY', volume: '0' }],
  }
}

export function App() {
  const [version, setVersion] = useState<Version>('2.2.1')
  const [presetKey, setPresetKey] = useState(defaultPreset)
  const [form, setForm] = useState<SimForm>(() => cloneForm(presets[defaultPreset]))
  const [rawJson, setRawJson] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | undefined>()
  const [calc, setCalc] = useState<Report | null>(null)
  const [verd, setVerd] = useState<Verdict | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [view, setView] = useState<View>('form')
  const requestIdRef = useRef(0)

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
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const timeout = window.setTimeout(() => {
      void (async () => {
        const isLatest = () => requestIdRef.current === requestId
        const runErrors: string[] = []

        if (!isLatest()) return
        setIsComputing(true)
        setEngineError(null)
        setResultError(null)

        try {
          const input = rawJson != null ? rawJson : serialize(form, version)
          const calculation = await calculate(version, input, engineOptions)
          if (!isLatest()) return

          if (calculation.ok && calculation.report) {
            setCalc(calculation.report)
          } else {
            setCalc(null)
            runErrors.push(calculation.error ?? 'Calculate failed')
          }

          if (rawJson != null) {
            const response = await verify(version, rawJson, engineOptions)
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

            const response = await verify(version, cdr, engineOptions)
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
  }, [form, rawJson, version])

  const setTariff = (index: number, tariff: TariffForm) => {
    patchForm({ tariffs: form.tariffs.map((existing, currentIndex) => (currentIndex === index ? tariff : existing)) })
  }

  const removeTariff = (index: number) => {
    patchForm({ tariffs: form.tariffs.filter((_, currentIndex) => currentIndex !== index) })
  }

  const setPeriod = (index: number, period: PeriodForm) => {
    patchForm({ periods: form.periods.map((existing, currentIndex) => (currentIndex === index ? period : existing)) })
  }

  const removePeriod = (index: number) => {
    patchForm({ periods: form.periods.filter((_, currentIndex) => currentIndex !== index) })
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>gocpi pricing simulator</h1>
        </div>
        <div className="toolbar">
          <label>
            version
            <select value={version} onChange={(event) => selectVersion(event.currentTarget.value as Version)}>
              <option value="2.2.1">2.2.1</option>
              <option value="2.3.0">2.3.0</option>
            </select>
          </label>
          <label>
            preset
            <select value={presetKey} onChange={(event) => selectPreset(event.currentTarget.value)}>
              {Object.keys(presets).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented-control" aria-label="input view">
            <button type="button" className={view === 'form' ? 'is-active' : ''} onClick={showForm}>
              Form
            </button>
            <button type="button" className={view === 'json' ? 'is-active' : ''} onClick={showJson}>
              JSON
            </button>
          </div>
        </div>
      </header>

      {engineError && (
        <div className="error-banner" role="alert">
          {engineError}
        </div>
      )}

      <div className="workspace">
        <section className="editor-pane" aria-label="simulator input">
          {view === 'form' ? (
            <div className="stack">
              <section className="form-section" aria-labelledby="session-heading">
                <div className="section-heading">
                  <h2 id="session-heading">Session</h2>
                </div>
                <div className="form-grid">
                  <label>
                    currency
                    <select value={form.currency} onChange={(event) => setCurrency(event.currentTarget.value)}>
                      {optionsWithCurrent(COMMON_CURRENCIES, form.currency).map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    country_code
                    <select value={form.countryCode} onChange={(event) => patchForm({ countryCode: event.currentTarget.value })}>
                      {optionsWithCurrent(COMMON_COUNTRY_CODES, form.countryCode).map((countryCode) => (
                        <option key={countryCode} value={countryCode}>
                          {countryCode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    start (UTC)
                    <input
                      type="datetime-local"
                      value={toLocalInput(form.start)}
                      onChange={(event) => patchForm({ start: fromLocalInput(event.currentTarget.value) })}
                    />
                  </label>
                  <label>
                    end (UTC)
                    <input
                      type="datetime-local"
                      value={toLocalInput(form.end)}
                      onChange={(event) => patchForm({ end: fromLocalInput(event.currentTarget.value) })}
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="tariffs-heading">
                <div className="section-heading">
                  <h2 id="tariffs-heading">Tariffs</h2>
                  <button
                    type="button"
                    onClick={() => patchForm({ tariffs: [...form.tariffs, defaultTariff(form.currency, form.tariffs.length)] })}
                  >
                    Add tariff
                  </button>
                </div>
                <div className="stack">
                  {form.tariffs.map((tariff, index) => (
                    <details className="collapsible-row" key={`${tariff.id}-${index}`} open>
                      <summary>
                        Tariff {index + 1}: {tariff.id || '(no id)'} ({tariff.currency || form.currency})
                      </summary>
                      <div className="collapsible-row__body">
                        <TariffEditor value={tariff} version={version} onChange={(next) => setTariff(index, next)} />
                        <div className="row-actions">
                          <button type="button" className="ghost-button" onClick={() => removeTariff(index)}>
                            Remove tariff
                          </button>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>

              <section className="form-section" aria-labelledby="periods-heading">
                <div className="section-heading">
                  <h2 id="periods-heading">Charging periods</h2>
                  <button
                    type="button"
                    onClick={() => patchForm({ periods: [...form.periods, defaultPeriod(form.start, tariffIds[0])] })}
                  >
                    Add period
                  </button>
                </div>
                <div className="stack">
                  {form.periods.map((period, index) => (
                    <details className="collapsible-row" key={`${period.start}-${index}`} open>
                      <summary>
                        Period {index + 1} - {period.start || '(no start)'} {period.tariffId || '(no tariff)'}
                      </summary>
                      <div className="collapsible-row__body">
                        <ChargingPeriodEditor value={period} tariffIds={tariffIds} onChange={(next) => setPeriod(index, next)} />
                        <div className="row-actions">
                          <button type="button" className="ghost-button" onClick={() => removePeriod(index)}>
                            Remove period
                          </button>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>

              <EmbeddedTotalsEditor value={form.embedded} onChange={(embedded) => patchForm({ embedded })} />
            </div>
          ) : (
            <JsonPanel text={rawJson ?? serializedText} onChange={onJsonChange} parseError={parseError} />
          )}
        </section>

        <section className="results-pane" aria-label="engine results">
          {isComputing && (
            <p className="computing-indicator" role="status" aria-live="polite">
              computing...
            </p>
          )}
          {resultError && (
            <div className="result-error" role="alert">
              {resultError}
            </div>
          )}
          {calc ? (
            <>
              <CostChart report={calc} />
              <CostBreakdown report={calc} />
            </>
          ) : (
            <p className="empty-state">No calculation yet</p>
          )}
          {verd ? <VerdictView verdict={verd} /> : <p className="empty-state">No verification yet</p>}
        </section>
      </div>
    </main>
  )
}

export default App
