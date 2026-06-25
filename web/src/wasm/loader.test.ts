import { afterEach, describe, expect, it, vi } from 'vitest'

function installGoRuntime(registerEngine: boolean) {
  const run = vi.fn(() => {
    if (registerEngine) {
      ;(window as any).gocpiCalculate = vi.fn()
      ;(window as any).gocpiVerify = vi.fn()
    }
    return Promise.resolve()
  })
  const Go = vi.fn(() => ({ importObject: {}, run }))
  ;(window as any).Go = Go
  return { Go, run }
}

function installWasmMocks({ streamingRejects = false } = {}) {
  const instance = {} as WebAssembly.Instance
  const module = {} as WebAssembly.Module
  const source = { instance, module }
  const buffer = new ArrayBuffer(8)
  const arrayBuffer = vi.fn(async () => buffer)
  const clone = vi.fn(() => ({ arrayBuffer: vi.fn(async () => buffer) }))
  const response = { clone, arrayBuffer }
  const fetch = vi.fn(async () => response)
  const instantiateStreaming = vi.fn(async () => {
    if (streamingRejects) throw new Error('streaming failed')
    return source
  })
  const instantiate = vi.fn(async () => source)

  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('WebAssembly', {
    ...globalThis.WebAssembly,
    instantiateStreaming,
    instantiate,
  })

  return { arrayBuffer, clone, fetch, instantiate, instantiateStreaming, instance }
}

async function freshLoader() {
  vi.resetModules()
  return import('./loader')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  delete (window as any).Go
  delete (window as any).gocpiCalculate
  delete (window as any).gocpiVerify
})

describe('loadEngine', () => {
  it('loads the wasm engine once, registers globals, and memoizes the ready promise', async () => {
    const go = installGoRuntime(true)
    const wasm = installWasmMocks()
    const { loadEngine } = await freshLoader()

    const first = loadEngine()
    const second = loadEngine()

    expect(second).toBe(first)
    await expect(first).resolves.toBeUndefined()
    expect((window as any).gocpiCalculate).toBeTypeOf('function')
    expect((window as any).gocpiVerify).toBeTypeOf('function')
    expect(go.Go).toHaveBeenCalledTimes(1)
    expect(go.run).toHaveBeenCalledWith(wasm.instance)
    expect(wasm.fetch).toHaveBeenCalledTimes(1)
    expect(wasm.instantiateStreaming).toHaveBeenCalledTimes(1)
    expect(wasm.instantiate).not.toHaveBeenCalled()
  })

  it('rejects when the engine does not register calculate and verify globals', async () => {
    installGoRuntime(false)
    installWasmMocks()
    const { loadEngine } = await freshLoader()

    await expect(loadEngine()).rejects.toThrow('engine failed to register')
    expect((window as any).gocpiCalculate).toBeUndefined()
    expect((window as any).gocpiVerify).toBeUndefined()
  })

  it('falls back to arrayBuffer instantiation when instantiateStreaming rejects', async () => {
    installGoRuntime(true)
    const wasm = installWasmMocks({ streamingRejects: true })
    const { loadEngine } = await freshLoader()

    await expect(loadEngine()).resolves.toBeUndefined()
    expect(wasm.instantiateStreaming).toHaveBeenCalledTimes(1)
    expect(wasm.clone).toHaveBeenCalledTimes(1)
    expect(wasm.arrayBuffer).toHaveBeenCalledTimes(1)
    expect(wasm.instantiate).toHaveBeenCalledWith(expect.any(ArrayBuffer), {})
  })
})
