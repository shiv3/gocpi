# Vendored OCPI OpenAPI specifications

These are the codegen inputs for gocpi, vendored for reproducible generation.

## Official specifications

- **Source**: https://github.com/ocpi/openapi-specification
- **Pinned commit**: `7bacd82ba531fc565fc6d7a09a49d4dabd3aaef0`
- **Versions**: `2.2.1/`, `2.3.0/`

The 2.2.1 and 2.3.0 directories hold the spec's `components/`, `modules/`,
`roles/` and `config.json` as published (OpenAPI 3.1). `internal/codegen` parses
the per-module schema and interface YAML files directly (no Node/redocly
bundling required) to generate the `v221` / `v230` Go packages.

To update: re-copy the relevant `ocpi/<version>/` tree from a newer commit of the
source repo, update the pinned commit above, and run `make generate`.

## Community-derived 2.1.1

- **Source**: `juherr/ocpi-fyi@bbac33665952b5fdfd52f33de52d21fa0f291710`
- **Source path**: `openapi/ocpi-2.1.1`
- **Version**: `2.1.1/`

The 2.1.1 tree is community-derived and non-official; no official
machine-readable OCPI 2.1.1 OpenAPI specification is available upstream. It is
reshaped into the same static layout expected by `internal/codegen` and generates
the `v211` Go package.

See `schemas/2.1.1/RE_VENDORING.md` for provenance, source-to-target mapping,
and the transforms required when re-vendoring.
