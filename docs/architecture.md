# gocpi architecture

OCPI is an HTTP/JSON REST protocol where every party is **both** an HTTP server
(it hosts endpoints) and an HTTP client (it calls peers). gocpi is organised in
three layers.

## Layers

```
core/            version-independent OCPI transport (hand-written)
  status/          OCPI status codes (1xxx–4xxx) + typed Error
  transport/       Doer abstraction + in-memory fake for tests
  schema/          JSON-Schema validator
  observability/   Metrics interface + prom/otel adapters
v211/ , v221/ , v230/
                 generated: types + clients + server handlers + roles + schema
handshake/       Versions + Credentials registration (role-agnostic)
```

- **core** owns the OCPI semantics shared by every module and version: the
  response envelope (`Response[T]`), pagination (`PageOpts`/`Page[T]` + a Go 1.23
  iterator), Base64 token auth, message-routing headers, ULID request IDs, the
  base `Client` (auth/retry/metrics) and `Server` (an `http.Handler` with auth,
  routing, panic-recovery and metrics middleware over a Go 1.22 method-aware
  `Mux`). It is framework-agnostic — mount the handler anywhere.
- **v211 / v221 / v230** are generated. All of a version's types live in **one
  package** because OCPI modules reference each other's schemas cyclically (which
  Go forbids across packages); type names are globally unique, so a single
  namespace is collision-free. The package also holds typed Sender/Receiver
  clients, `RegisterXxx` server wiring, role presets, and an embedded JSON-Schema
  document for runtime validation.
- **handshake** implements the Versions + Credentials flow (Mount/Discover/
  Register) on top of core and the generated types.

## Codegen

`internal/codegen` reads the vendored OpenAPI under `schemas/<version>/` and is
**config-driven**: `config.json` declares the module set, each module's
interfaces (sender/receiver), and the role→module mapping. From this it emits:

1. **types** — Go structs + enums with `json` and `validate` tags, mapping
   `$ref`s to Go types and OpenAPI scalars (`number`→decimal, `date-time`→time).
2. **clients + server handlers** — from each module's interface YAML: typed
   client methods (path params, pagination, request/response bodies) and a
   handler interface + `RegisterXxx` route wiring.
3. **role presets** — `RegisterCPO/MSP/Hub` from the role map.
4. **JSON Schema** — `schema.json` ($defs per type) embedded for `ValidateJSON`.

Generation is deterministic; CI regenerates and fails on drift. Adding a new OCPI
version is mostly vendoring its spec and running `make generate`; note that 2.1.1
is generated from a community-derived, non-official OpenAPI source because no
official machine-readable 2.1.1 OpenAPI spec is available upstream.

## Validation

Two layers: the generated `validate` struct tags (`core.Validate`, via
go-playground/validator) and the embedded JSON Schema (`v221.ValidateJSON`, via
santhosh-tekuri/jsonschema).

## Testing

Per-package unit tests, an in-memory `transport.Fake` that wires a server handler
to a client without sockets (used for the handshake loopback and the generated
client/server round-trip), and `-race`-clean concurrency.
