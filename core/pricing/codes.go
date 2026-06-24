package pricing

type WarningCode int

const (
	WarnUnsupportedRestriction WarningCode = iota
	WarnTZInferred
	WarnTZUTC
	WarnNoElement
	WarnReservationNotComputed
	WarnBoundaryCross
	WarnTariffWindow
	WarnPeriodOutsideBounds
)

type ErrCode int

const (
	InvalidInput ErrCode = iota
	Internal
)

type PricingError struct {
	Code ErrCode
	Msg  string
}

func (e *PricingError) Error() string {
	return e.Msg
}
