# v221 Golden Fixture Provenance

Source: https://codeberg.org/tandemdrive/ocpi-tariffs @ commit 698decb574461814bf76c61646dfd3264a16b034

License: MIT OR Apache-2.0 (ocpi-tariffs). Fixtures were copied verbatim from `ocpi-tariffs/test_data/v221/real_world/{multiple_flat_fees,grace_period_parking_time}/`.

Expected values: each fixture's `cdr.json` embedded `total_cost` is reference-authoritative and validated by ocpi-tariffs' own test suite. These values were not computed by this Go engine.

Note: these are the only two v221 `real_world` fixtures in the reference that ship a standalone `tariff.json`; others embed the tariff in the CDR. This is not a silent cap.
