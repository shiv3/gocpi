# gocpi

[![Go Reference](https://pkg.go.dev/badge/github.com/shiv3/gocpi.svg)](https://pkg.go.dev/github.com/shiv3/gocpi)
[![CI](https://github.com/shiv3/gocpi/actions/workflows/ci.yml/badge.svg)](https://github.com/shiv3/gocpi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A generics-first **OCPI** (Open Charge Point Interface) implementation in Go for
**OCPI 2.2.1 and 2.3.0** — the HTTP/JSON REST protocol for e-mobility roaming
between CPOs, eMSPs and Hubs.

> Status: WIP, pre-v1. Implemented: the `core` transport (envelope, status codes,
> pagination, token auth, routing, retries, metrics), generated types + typed
> clients + server handler interfaces for every module of both versions, role
> presets, the Versions/Credentials handshake, and two-layer validation
> (struct-tag + JSON-Schema). The public API may change before v1.0.

gocpi is the OCPI sibling of [gocpp](https://github.com/shiv3/gocpp) (OCPP) and
shares its philosophy: generics-first ergonomics, version-prefixed packages,
codegen from the official spec, pluggable observability, and heavy testing.

## Why gocpi

- **Client + server in one module.** OCPI parties are both at once: gocpi gives
  you typed HTTP clients to call peers and `http.Handler` server endpoints to
  host your own — for every role (CPO, eMSP, Hub, ...).
- **Generated from the official OpenAPI.** Types, clients and server handler
  interfaces for every module of OCPI 2.2.1 (`v221`) and 2.3.0 (`v230`,
  incl. bookings & payments) are generated from the
  [official OCPI OpenAPI specification](https://github.com/ocpi/openapi-specification)
  — no hand-written, drift-prone structs.
- **OCPI semantics built in.** The standard response envelope, OCPI status codes,
  pagination (`Link` / `X-Total-Count` / `X-Limit` + iterators), Base64 token
  auth, the Versions+Credentials handshake, hub message-routing headers, and
  transient-failure retries.
- **Two-layer validation.** Generated `validate` struct tags (`core.Validate`)
  plus an embedded JSON-Schema validator (`v221.ValidateJSON`).
- **Framework-agnostic.** The server is a plain `http.Handler` — mount it under
  any prefix in net/http, chi, echo, etc.
- **Pluggable observability.** `slog` logging and a `Metrics` interface with
  Prometheus and OpenTelemetry adapters.

## Pricing

The [`github.com/shiv3/gocpi/core/pricing`](https://github.com/shiv3/gocpi/tree/main/core/pricing)
package provides a version-neutral OCPI 2.2.1 and 2.3.0 tariff calculation and
CDR total verification engine. Version entry points live in the version
packages (`v221`, `v230`) and return the neutral `pricing.Report` / `pricing.Verdict`.

```go
import (
    pricing "github.com/shiv3/gocpi/core/pricing"
    "github.com/shiv3/gocpi/v221"
)

// Primary path: price using the tariffs embedded in the CDR (resolves each
// charging period's tariff_id, including multi-tariff CDRs).
rep, err := v221.CalculateCDR(cdr, pricing.Options{})
verdict, err := v221.VerifyCDR(cdr, pricing.Options{})

// Override path: price every period against an explicit tariff, ignoring
// per-period tariff_id.
rep, err = v221.CalculateWithTariff(cdr, tariff, pricing.Options{})
```

The current v1 engine supports one tariff per CDR; CDRs that require multiple
tariffs through per-period `tariff_id` values return `InvalidInput`.
Reservation cost is not computed, though its sub-total is checked and returns
`NotVerifiable` when present. OCPI 2.3.0 booking-restricted tariff elements are
unsupported and never match, and the local-time boundary-crossing diagnostic is
deferred.

Current v1 limitations:

- Single tariff per CDR; multi-tariff CDRs return `InvalidInput`.
- Reservation cost is not computed; its sub-total verifies as `NotVerifiable`.
- OCPI 2.3.0 booking-restricted elements are unsupported.
- Multi-timezone countries are not inferred; pass `Options.TimeZone`.
- Totals stay at OCPI scale-4 unless `Options.CurrencyPrecision` is set.

## Install

```sh
go get github.com/shiv3/gocpi
```

Requires Go 1.26+.

## Quick start

### CPO server

```go
cpo := core.NewServer(core.WithBaseURL("https://cpo.example/ocpi"))

// Versions + Credentials handshake endpoints.
handshake.Mount(cpo.Mux(), handshake.ServerConfig{ /* versions, details, onRegister */ })

// Functional-module endpoints for the CPO role (Locations Sender, Tokens
// Receiver, ...). A nil handler field is skipped.
v221.RegisterCPO(cpo.Mux(), "https://cpo.example/ocpi/2.2.1", v221.CPOHandlers{
    Locations: myLocationsSender, // implements v221.LocationsSenderHandler
})

http.ListenAndServe(":8080", cpo.Handler())
```

Mount under any prefix (the handler does relative routing):

```go
r.Handle("/ocpi/*", http.StripPrefix("/ocpi", cpo.Handler()))                       // chi
e.Any("/ocpi/*", echo.WrapHandler(http.StripPrefix("/ocpi", cpo.Handler())))        // echo
```

### eMSP client

```go
emsp := core.NewClient(core.WithToken(tokenA), core.WithRetry(3))

// Register: discover versions, exchange credentials.
peer, err := handshake.Register(ctx, emsp, handshake.RegisterRequest{
    PeerVersionsURL: "https://cpo.example/ocpi/versions",
    PreferVersion:   v221.VersionNumber221,
    OurCredentials:  ourCredentials,
})

// Call the discovered Locations endpoint with the generated typed client.
locURL, _ := peer.Endpoint(v221.ModuleIDLocations)
page, err := v221.NewLocationsSenderClient(emsp, locURL).GetLocations(ctx, core.PageOpts{})
```

A complete, runnable version is in [`examples/dual-role`](examples/dual-role).

## Validation

```go
core.Validate(loc)                          // struct-tag layer (go-playground/validator)
err := v221.ValidateJSON("Location", raw)   // wire layer (JSON-Schema, embedded)
```

## Observability

```go
cpo := core.NewServer(core.WithMetrics(prom.New(prometheus.DefaultRegisterer)))
emsp := core.NewClient(core.WithClientMetrics(otelm))
```

## Packages

| Import | Purpose |
|---|---|
| `core` | Response envelope, pagination, token auth, routing, request IDs, retries, base client/server/mux |
| `core/status` | OCPI status codes (1xxx–4xxx) + typed `Error` |
| `core/transport` | `Doer` HTTP abstraction + in-memory fake for tests |
| `core/schema` | JSON-Schema `Validator` |
| `core/observability` (+ `metrics/{prom,otel}`) | `Metrics` interface + Prometheus/OpenTelemetry adapters |
| `v221` / `v230` | Generated types, typed clients + server handlers, `RegisterCPO/MSP/Hub`, embedded JSON-Schema validator |
| `handshake` | Versions + Credentials registration |

## Versions

| Package | OCPI version | Modules |
|---|---|---|
| `v221` | 2.2.1 | locations, sessions, cdrs, tariffs, tokens, commands, chargingprofiles, hubclientinfo, credentials, versions |
| `v230` | 2.3.0 | the above **+ bookings, payments** |

## Testing

```sh
make test        # go test ./...
make test-race   # go test -race ./...
make generate    # regenerate v221 + v230 from the vendored OpenAPI
make lint        # golangci-lint
```

See [docs/architecture.md](docs/architecture.md) for the design overview.

## License

MIT
