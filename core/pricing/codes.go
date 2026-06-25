package pricing

// WarningCode identifies a non-fatal pricing or verification warning.
type WarningCode int

const (
	// WarnUnsupportedRestriction means an element was skipped because it contains restriction fields the engine cannot evaluate.
	WarnUnsupportedRestriction WarningCode = iota
	// WarnTZInferred means the timezone was inferred from the CDR country code.
	WarnTZInferred
	// WarnTZUTC means no timezone was available and pricing was computed in UTC.
	WarnTZUTC
	// WarnNoElement means a period or dimension volume matched no applicable tariff component.
	WarnNoElement
	// WarnReservationNotComputed means embedded reservation cost was present but reservation cost was not computed.
	WarnReservationNotComputed
	// WarnBoundaryCross means a local-time restriction boundary was crossed within a pricing period.
	WarnBoundaryCross
	// WarnTariffWindow means the session falls outside the tariff validity window.
	WarnTariffWindow
	// WarnPeriodOutsideBounds means a charging period start falls outside the CDR session bounds.
	WarnPeriodOutsideBounds
	// WarnUnknownDimension means an adapter encountered an unrecognized CDR dimension type and skipped it.
	WarnUnknownDimension
	// WarnPeriodNoTariff means a period had no applicable tariff and was excluded from pricing.
	WarnPeriodNoTariff
	// WarnMinMaxUndefinedMultiTariff means min_price or max_price was not applied because multiple tariffs priced the session.
	WarnMinMaxUndefinedMultiTariff
	// WarnMixedStepSize means multiple active price components for the same dimension used different step_size values.
	WarnMixedStepSize
	// WarnUnusedTariff means an embedded tariff was not referenced by any priced charging period.
	WarnUnusedTariff
	// WarnAfterTaxNotDerivable means an embedded after-tax total could not be derived from the embedded data, so the comparison was skipped.
	WarnAfterTaxNotDerivable
)

// ErrCode identifies a pricing error category.
type ErrCode int

const (
	// InvalidInput means the input cannot be priced.
	InvalidInput ErrCode = iota
	// Internal means the engine failed for an internal reason.
	Internal
)

// PricingError is an error with a machine-readable Code and human-readable Msg.
type PricingError struct {
	// Code identifies the error category.
	Code ErrCode
	// Msg describes the error.
	Msg string
}

// Error returns the human-readable pricing error message.
func (e *PricingError) Error() string {
	return e.Msg
}
