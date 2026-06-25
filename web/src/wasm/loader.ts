let ready: Promise<void> | null = null

interface GoRuntime {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
}

interface GoWindow extends Window {
  Go?: new () => GoRuntime
  gocpiCalculate?: unknown
  gocpiVerify?: unknown
}

function engineWindow(): GoWindow {
  return window as GoWindow
}

function scriptURL(base: string): string {
  return `${base}wasm_exec.js`
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-gocpi-wasm-exec="${src}"]`)
    if (existing) {
      if (engineWindow().Go) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.gocpiWasmExec = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`failed to load ${src}`))
    document.head.appendChild(script)
  })
}

async function loadGoRuntime(base: string): Promise<void> {
  if (engineWindow().Go) return

  // wasm_exec.js is a classic script in /public that sets globalThis.Go as a side
  // effect; it is NOT an ES module, so it must be loaded via a <script> tag, never
  // import() (Vite dev rejects importing /public files from source code).
  await injectScript(scriptURL(base))
}

export function loadEngine(): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    const base = import.meta.env.BASE_URL
    await loadGoRuntime(base)

    const Go = engineWindow().Go
    if (!Go) {
      throw new Error('failed to load Go wasm runtime')
    }

    const go = new Go()
    const resp = await fetch(`${base}main.wasm`)
    const result =
      typeof WebAssembly.instantiateStreaming === 'function'
        ? await WebAssembly.instantiateStreaming(resp.clone(), go.importObject).catch(async () =>
            WebAssembly.instantiate(await resp.arrayBuffer(), go.importObject),
          )
        : await WebAssembly.instantiate(await resp.arrayBuffer(), go.importObject)

    void go.run(result.instance)

    if (typeof engineWindow().gocpiCalculate !== 'function' || typeof engineWindow().gocpiVerify !== 'function') {
      throw new Error('engine failed to register')
    }
  })()
  return ready
}
