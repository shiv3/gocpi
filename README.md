# gocpi

A generics-first **OCPI** (Open Charge Point Interface) implementation in Go for
**OCPI 2.2.1** — the HTTP/JSON REST protocol for e-mobility roaming between CPOs,
eMSPs and Hubs.

> Status: WIP, pre-v1. Implemented: the `core` transport, generated types for all
> 10 modules, generated typed clients + server handler interfaces for the
> functional modules, role presets, and the Versions/Credentials handshake.
> Runtime JSON-Schema validation and observability adapters are still to come.
> The public API will change before v1.0.

gocpi is the OCPI sibling of [gocpp](https://github.com/shiv3/gocpp) (OCPP) and
shares its philosophy: generics-first ergonomics, version-prefixed packages,
codegen from the official spec, pluggable observability, and heavy testing.

## Why gocpi

- **Client + server in one module.** OCPI parties are both at once: gocpi gives
  you typed HTTP clients to call peers and `http.Handler` server endpoints to
  host your own — for every role (CPO, eMSP, Hub, ...).
- **Generated from the official OpenAPI.** Types, clients and server handler
  interfaces for all 10 modules (Locations, Sessions, CDRs, Tariffs, Tokens,
  Commands, ChargingProfiles, Credentials, Versions, HubClientInfo) are generated
  from the [official OCPI OpenAPI specification](https://github.com/ocpi/openapi-specification)
  — no hand-written, drift-prone structs.
- **OCPI semantics built in.** The standard response envelope, OCPI status codes,
  pagination (`Link` / `X-Total-Count` / `X-Limit` + iterators), Base64 token
  auth, the Versions+Credentials handshake, and hub message-routing headers.
- **Framework-agnostic.** The server is a plain `http.Handler` — mount it under
  any prefix in net/http, chi, echo, etc.
- **Pluggable** logging (`slog`) and metrics (Prometheus / OpenTelemetry).

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

The handler does relative routing, so mount it under any prefix:

```go
// chi
r.Handle("/ocpi/*", http.StripPrefix("/ocpi", cpo.Handler()))
// echo
e.Any("/ocpi/*", echo.WrapHandler(http.StripPrefix("/ocpi", cpo.Handler())))
```

### eMSP client

```go
emsp := core.NewClient(core.WithToken(tokenA)) // CREDENTIALS_TOKEN_A, out of band

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

A complete, runnable version of the above is in
[`examples/dual-role`](examples/dual-role).

## Packages

| Import | Status | Purpose |
|---|---|---|
| `core` | implemented | Response envelope, pagination, token auth, routing, request IDs, base client/server/mux |
| `core/status` | implemented | OCPI status codes (1xxx–4xxx) + typed `Error` |
| `core/transport` | implemented | `Doer` HTTP abstraction + in-memory fake for tests |
| `core/observability` | implemented | Pluggable `Metrics` (NoOp default; Prometheus/OTel adapters planned) |
| `v221` | implemented | Generated types (all 10 modules), typed clients + server handlers for functional modules, `RegisterCPO/MSP/Hub` role presets |
| `handshake` | implemented | Versions + Credentials registration |

## Testing

```sh
make test        # go test ./...
make test-race   # go test -race ./...
make generate    # regenerate v221 from the vendored OpenAPI
make lint        # golangci-lint
```

## License

MIT
