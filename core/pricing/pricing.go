// Package pricing provides a version-neutral OCPI tariff pricing and
// verification engine for OCPI 2.2.1 (v221) and OCPI 2.3.0 (v230), following
// the ocpi-tariffs reference semantics.
//
// Callers price per OCPI version through the version packages: v221.Calculate
// and v230.Calculate for forward pricing from a CDR and tariff into a Report,
// and v221.Verify and v230.Verify for recomputing and comparing a CDR's embedded
// totals into a Verdict (each version also exposes FromCDR to build a neutral
// Input). This package exposes the version-neutral Calculate and Verify for
// callers that already have a neutral Input.
//
// Version 1 is intentionally limited to a single tariff per CDR: CDRs requiring
// multiple tariffs through per-period tariff_id values return InvalidInput.
// Reservation cost is not computed, though its sub-total is checked and returns
// NotVerifiable when present. OCPI 2.3.0 booking-restricted tariff elements are
// unsupported and never match. The local-time boundary-crossing diagnostic is
// deferred.
package pricing
