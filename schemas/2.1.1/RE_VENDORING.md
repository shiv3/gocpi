# OCPI 2.1.1 Re-vendoring Notes

## Provenance

- Source: `juherr/ocpi-fyi@bbac33665952b5fdfd52f33de52d21fa0f291710`
- Source path: `openapi/ocpi-2.1.1`
- License: CC-BY-ND
- Warning: community spec — NOT official. No official machine-readable OCPI 2.1.1 OpenAPI spec is
  available upstream.

## Source To Target Map

This tree is reshaped into the static `schemas/2.1.1/` layout expected by `internal/codegen`.
Canonical type ownership follows `INVENTORY.md`; each type name is emitted exactly once.

- `shared/common.yaml`:
  `OcpiResponse` maps to `components/schema.yaml#/components/schemas/OCPIResponse` with `DateTime`
  inlined. `OcpiResponseData`, `OcpiResponseDataList`, `OcpiResponseString`, and module-specific
  `*Response` wrappers are dropped in favor of inline `allOf` response envelopes.
- `shared/headers.yaml` and `shared/parameters.yaml`:
  common request headers, routing headers, pagination parameters, date filters, and identity path
  parameters map to `components/schema.yaml` and `components/parameters.yaml`.
- `shared/schemas/types.yaml`:
  `DisplayText` and `Price` map to `components/schema.yaml`. `DateTime` is not emitted as a schema;
  timestamp properties are inlined. `Role` is owned by the credentials module when that module is
  authored.
- `shared/schemas/locations.yaml`:
  cross-domain `BusinessDetails`, `Image`, and `ImageCategory` map to `components/schema.yaml`.
  location-domain shared types such as geo, hours, and energy-mix types map to
  `modules/locations/schema.yaml`.
- `shared/schemas/cdrs.yaml`:
  `CdrToken`, `CdrLocation`, `ChargingPeriod`, `CdrDimension`, `SignedData`, `SignedValue`,
  `AuthMethod`, and `CdrDimensionType` map to `modules/cdrs/schema.yaml`.
- `shared/schemas/tokens.yaml`:
  `LocationReferences`, `EnergyContract`, `TokenType`, `WhitelistType`, and `AllowedType` map to
  `modules/tokens/schema.yaml`.
- `locations.yaml`, `sessions.yaml`, `cdrs.yaml`, `tariffs.yaml`, `tokens.yaml`, and
  `commands.yaml`:
  combined source module files are split into `modules/<module>/schema.yaml`,
  `modules/<module>/sender-interface.yaml`, and `modules/<module>/receiver-interface.yaml`.
- `credentials.yaml` and `versions.yaml`:
  configuration-module types map to `modules/credentials/schema.yaml` and
  `modules/versions/schema.yaml`; their `interface.yaml` files are kept for spec completeness but
  are not parsed by API codegen.

## D3 Transform Checklist

1. Split each combined module file into `sender-interface.yaml`, `receiver-interface.yaml`, and
   `schema.yaml`; every interface path keeps its `/<module>` first segment.
2. Reshape success responses carrying data into inline `allOf` responses using `OCPIResponse`, with
   list data modeled as `type: array` plus `$ref` items.
3. Keep request bodies as bare schema `$ref`s.
4. Rename operation IDs to unique `sender*` or `receiver*` names for the hosting interface.
5. Use `LimitParameter` and `OffsetParameter` for pagination, and `DateFromParameter` and
   `DateToParameter` for date filters.
6. Flatten every `anyOf` open enum to `type: string` plus `enum`.
7. Define every type exactly once, using `shared/schemas/*` as canonical and ignoring duplicate
   copies from `shared/common.yaml`; ensure every `$ref` resolves in the complete tree.
8. Inline timestamps as `type: string` plus `format: date-time`; do not emit a named `DateTime`
   schema.
9. Convert the commands result callback from a `webhooks` entry to a normal `paths` entry.
10. Normalize object-field identity lengths: `country_code` uses `minLength: 2` and `maxLength: 2`;
    `party_id` uses `minLength: 3` and `maxLength: 3`.

## Verification

Run:

```bash
python3 schemas/2.1.1/verify_spec.py [--structural] schemas/2.1.1
```

Use `--structural` while the tree is partial. Full mode is for the complete tree and also checks
global `$ref` resolution plus the operation inventory. `EXPECTED_OPS` lives in `verify_spec.py`.
