// Package pricing provides a version-neutral OCPI tariff pricing and
// verification engine for OCPI 2.2.1 (v221) and OCPI 2.3.0 (v230), following
// the ocpi-tariffs reference semantics.
//
// Callers price per OCPI version through the version packages: v221.CalculateCDR
// and v230.CalculateCDR for forward pricing from a CDR's embedded tariffs into a
// Report, and v221.VerifyCDR and v230.VerifyCDR for recomputing and comparing a
// CDR's embedded totals into a Verdict. CalculateWithTariff and VerifyWithTariff
// price against an explicit tariff that overrides the CDR's embedded tariffs
// (each version also exposes FromCDR to build a neutral Input). This package
// exposes the version-neutral Calculate and Verify for callers that already have
// a neutral Input.
//
// Multi-tariff CDRs are priced per charging period via tariff_id, with the
// step_size ledger kept session-wide across tariff switches. Reservation cost is
// not computed, though its sub-total is checked and returns NotVerifiable when
// present. OCPI 2.3.0 booking-restricted tariff elements are unsupported and
// never match. The local-time boundary-crossing diagnostic is deferred.
package pricing
