# gocpi

A generics-first **OCPI** (Open Charge Point Interface) implementation in Go for
**OCPI 2.2.1** — the HTTP/JSON REST protocol for e-mobility roaming between CPOs,
eMSPs and Hubs.

> Status: early WIP. The version-independent `core` transport is implemented and
> tested; the generated module API (`v221/...`) and the Versions/Credentials
> handshake are in progress. The public API will change before v1.0.

gocpi is the OCPI sibling of [gocpp](https://github.com/shiv3/gocpp) (OCPP) and
shares its philosophy: generics-first ergonomics, version-prefixed packages,
codegen from the official spec, pluggable observability, and heavy testing.

## Why gocpi

- **Client + server in one module.** OCPI parties are both at once: gocpi gives
  you a typed HTTP client to call peers and `http.Handler` server endpoints to
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

## Quick start (target API)

> These sketches show the intended high-level API; the generated module layer is
> still being built. The `core` transport they sit on is implemented today.

### CPO server

```go
srv := gocpi.NewServer(
    gocpi.WithBaseURL("https://example.com/ocpi"),
    gocpi.WithTokenStore(myStore),
)

v221.RegisterCPO(srv, v221.CPOHandlers{
    Locations: myLocationsSender, // CPO is the Sender for Locations
    Tokens:    myTokensReceiver,  // CPO is the Receiver for Tokens
    // ...
})

http.ListenAndServe(":8080", srv.Handler())
```

The handler does relative routing, so mount it under any prefix:

```go
// chi
r.Handle("/ocpi/*", http.StripPrefix("/ocpi", srv.Handler()))
// echo
e.Any("/ocpi/*", echo.WrapHandler(http.StripPrefix("/ocpi", srv.Handler())))
```

### eMSP client

```go
peer, err := handshake.Register(ctx, handshake.RegisterRequest{
    PeerVersionsURL: "https://cpo.example/ocpi/versions",
    OurToken:        tokenA, // CREDENTIALS_TOKEN_A, received out of band
    OurCredentials:  ourCreds,
})

client := peer.V221()
locs, err := client.Locations().Sender().GetLocations(ctx, core.PageOpts{Limit: 50})
```

## Packages

| Import | Status | Purpose |
|---|---|---|
| `core` | implemented | Response envelope, pagination, token auth, routing, request IDs, base client/server/mux |
| `core/status` | implemented | OCPI status codes (1xxx–4xxx) + typed `Error` |
| `core/transport` | implemented | `Doer` HTTP abstraction + in-memory fake for tests |
| `core/observability` | implemented | Pluggable `Metrics` (NoOp default; Prometheus/OTel adapters planned) |
| `core/types` | implemented | OCPI primitives (`CiString`, `Number`) |
| `v221/<module>` | in progress | Generated types / client / server handlers per module |
| `handshake` | in progress | Versions + Credentials registration and token rotation |

## Testing

```sh
make test        # go test ./...
make test-race   # go test -race ./...
make generate    # regenerate v221 from the vendored OpenAPI
make lint        # golangci-lint
```

## License

MIT
