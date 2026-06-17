# Vendored OCPI OpenAPI specifications

These are the codegen inputs for gocpi — the official OCPI OpenAPI source files,
vendored for reproducible generation.

- **Source**: https://github.com/ocpi/openapi-specification
- **Pinned commit**: `7bacd82ba531fc565fc6d7a09a49d4dabd3aaef0`
- **Versions**: `2.2.1/`, `2.3.0/`

Each version directory holds the spec's `components/`, `modules/`, `roles/` and
`config.json` as published (OpenAPI 3.1). `internal/codegen` parses the
per-module schema and interface YAML files directly (no Node/redocly bundling
required) to generate the `v221` / `v230` Go packages.

To update: re-copy the relevant `ocpi/<version>/` tree from a newer commit of the
source repo, update the pinned commit above, and run `make generate`.
