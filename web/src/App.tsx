import { useMemo, useState } from 'react'
import './App.css'
import { JsonPanel } from './components/JsonPanel'
import { ChargingPeriodEditor } from './components/form/ChargingPeriodEditor'
import { EmbeddedTotalsEditor } from './components/form/EmbeddedTotalsEditor'
import { TariffEditor } from './components/form/TariffEditor'
import { CostBreakdown } from './components/result/CostBreakdown'
import { VerdictView } from './components/result/VerdictView'
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
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('form')

  const serializedText = useMemo(() => JSON.stringify(serialize(form, version), null, 2), [form, version])
  const tariffIds = useMemo(() => form.tariffs.map((tariff) => tariff.id).filter(Boolean), [form.tariffs])

  const replaceForm = (next: SimForm) => {
    setForm(next)
    setRawJson(null)
    setParseError(undefined)
    setError(null)
    setCalc(null)
    setVerd(null)
  }

  const patchForm = (patch: Partial<SimForm>) => replaceForm({ ...form, ...patch })

  const selectPreset = (key: string) => {
    setPresetKey(key)
    replaceForm(cloneForm(presets[key]))
  }

  const selectVersion = (nextVersion: Version) => {
    setVersion(nextVersion)
    setRawJson(null)
    setParseError(undefined)
    setError(null)
    setCalc(null)
    setVerd(null)
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
    setError(null)
    try {
      const parsed = JSON.parse(text)
      setParseError(undefined)
      setForm(deserialize(parsed, version))
    } catch (parseOrDeserializeError) {
      setParseError(messageFromError(parseOrDeserializeError))
    }
  }

  const engineInput = () => (rawJson != null ? rawJson : serialize(form, version))

  const onCalculate = async () => {
    setError(null)
    try {
      const response = await calculate(version, engineInput(), engineOptions)
      if (response.ok && response.report) {
        setCalc(response.report)
      } else {
        setCalc(null)
        setError(response.error ?? 'Calculate failed')
      }
    } catch (calculateError) {
      setError(messageFromError(calculateError))
    }
  }

  const onVerify = async () => {
    setError(null)
    try {
      if (rawJson != null) {
        const response = await verify(version, rawJson, engineOptions)
        if (response.ok && response.verdict) {
          setVerd(response.verdict)
        } else {
          setVerd(null)
          setError(response.error ?? 'Verify failed')
        }
        return
      }

      const calculation = await calculate(version, serialize(form, version), engineOptions)
      if (!calculation.ok || !calculation.report) {
        setError(calculation.error ?? 'Calculate failed')
        return
      }

      setCalc(calculation.report)
      const cdr = serialize(form, version) as Record<string, unknown>
      if (!form.embedded.totalCost) {
        cdr.total_cost = reportMoneyToCdr(calculation.report.totalCost, version)
      }
      const response = await verify(version, cdr, engineOptions)
      if (response.ok && response.verdict) {
        setVerd(response.verdict)
      } else {
        setVerd(null)
        setError(response.error ?? 'Verify failed')
      }
    } catch (verifyError) {
      setError(messageFromError(verifyError))
    }
  }

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
          <button type="button" className="primary-button" onClick={onCalculate}>
            Calculate
          </button>
          <button type="button" onClick={onVerify}>
            Verify
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
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
                    <input value={form.currency} onChange={(event) => patchForm({ currency: event.currentTarget.value })} />
                  </label>
                  <label>
                    country_code
                    <input value={form.countryCode} onChange={(event) => patchForm({ countryCode: event.currentTarget.value })} />
                  </label>
                  <label>
                    start
                    <input value={form.start} onChange={(event) => patchForm({ start: event.currentTarget.value })} />
                  </label>
                  <label>
                    end
                    <input value={form.end} onChange={(event) => patchForm({ end: event.currentTarget.value })} />
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
                    <div className="repeated-row repeated-row--vertical" key={`${tariff.id}-${index}`}>
                      <TariffEditor value={tariff} version={version} onChange={(next) => setTariff(index, next)} />
                      <button type="button" className="ghost-button" onClick={() => removeTariff(index)}>
                        Remove tariff
                      </button>
                    </div>
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
                    <div className="repeated-row repeated-row--vertical" key={`${period.start}-${index}`}>
                      <ChargingPeriodEditor value={period} tariffIds={tariffIds} onChange={(next) => setPeriod(index, next)} />
                      <button type="button" className="ghost-button" onClick={() => removePeriod(index)}>
                        Remove period
                      </button>
                    </div>
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
          {calc ? <CostBreakdown report={calc} /> : <p className="empty-state">No calculation yet</p>}
          {verd ? <VerdictView verdict={verd} /> : <p className="empty-state">No verification yet</p>}
        </section>
      </div>
    </main>
  )
}

export default App
