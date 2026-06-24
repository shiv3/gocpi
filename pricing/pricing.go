// Package pricing provides a version-neutral OCPI tariff pricing and
// verification engine for OCPI 2.2.1 (v221) and OCPI 2.3.0 (v230), following
// the ocpi-tariffs reference semantics.
//
// The main entry points are CalculateV221 and CalculateV230 for forward pricing
// from a CDR and tariff into a Report, and VerifyV221 and VerifyV230 for
// recomputing and comparing a CDR's embedded totals into a Verdict. The neutral
// adapters FromV221 and FromV230 are also exported, along with Calculate and
// Verify for callers that already have neutral pricing input.
//
// Version 1 is intentionally limited to a single tariff per CDR: CDRs requiring
// multiple tariffs through per-period tariff_id values return InvalidInput.
// Reservation cost is not computed, though its sub-total is checked and returns
// NotVerifiable when present. OCPI 2.3.0 booking-restricted tariff elements are
// unsupported and never match. The local-time boundary-crossing diagnostic is
// deferred.
package pricing
