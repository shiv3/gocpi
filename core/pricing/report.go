package pricing

import (
	"time"

	"github.com/shopspring/decimal"
)

// WarningKind classifies a non-fatal pricing note.
type WarningKind int

const (
	// KindWarning is a caveat that may affect the computed result.
	KindWarning WarningKind = iota
	// KindDiagnostic is an informational note that does not affect the result.
	KindDiagnostic
)

// Warning is a non-fatal note emitted while pricing or verifying.
type Warning struct {
	// Code identifies the kind of warning.
	Code WarningCode
	// Kind classifies the warning severity.
	Kind WarningKind
	// Msg describes the warning.
	Msg string
	// PeriodIndex is the zero-based input period index this warning applies to; nil means not period-scoped.
	PeriodIndex *int
	// TariffIndex is the zero-based input tariff index this warning applies to; nil means not tariff-scoped.
	TariffIndex *int
	// Dimension is the tariff dimension this warning applies to; the zero value means not dimension-scoped.
	Dimension DimensionType
}

// Dimension is a dimension's total priced volume and cost.
type Dimension struct {
	// Volume is the total consumed volume for the dimension.
	Volume decimal.Decimal
	// Cost is the computed cost for the dimension.
	Cost Money
}

// PeriodReport is a per-period cost breakdown by dimension.
type PeriodReport struct {
	// Start is the period start time.
	Start time.Time
	// Costs maps each priced dimension to the period's cost for that dimension.
	Costs map[DimensionType]Money
}

// Report is the result of pricing a session.
//
// Report dimension subtotals are not redistributed when a min/max-price clamp
// adjusts TotalCost, so the subtotals may not sum to TotalCost after a clamp.
type Report struct {
	// TotalCost is the session total cost.
	TotalCost Money
	// TotalEnergyCost is the ENERGY dimension subtotal.
	TotalEnergyCost Money
	// TotalTimeCost is the TIME dimension subtotal.
	TotalTimeCost Money
	// TotalParkingCost is the PARKING_TIME dimension subtotal.
	TotalParkingCost Money
	// TotalFixedCost is the FLAT dimension subtotal.
	TotalFixedCost Money
	// TotalReservationCost is nil when reservation cost is not computed.
	TotalReservationCost *Money
	// Dimensions maps each dimension to its priced volume and cost.
	Dimensions map[DimensionType]Dimension
	// Periods is the per-period pricing breakdown.
	Periods []PeriodReport
	// Warnings are non-fatal notes emitted while pricing.
	Warnings []Warning
}

// Status is the overall outcome of Verify.
//
// StatusMismatch outranks StatusNotVerifiable when both conditions occur.
type Status int

const (
	// StatusOK means all compared embedded values match the computed values.
	StatusOK Status = iota
	// StatusMismatch means at least one compared value differs.
	StatusMismatch
	// StatusNotVerifiable means a value cannot be checked, such as reservation cost or underivable after-tax totals.
	StatusNotVerifiable
	// StatusInvalidInput means the input could not be priced.
	StatusInvalidInput
)

// Mismatch describes a differing computed and embedded value.
type Mismatch struct {
	// Field is the name of the compared value.
	Field string
	// Computed is the value computed by the pricing engine.
	Computed decimal.Decimal
	// Embedded is the value reported by the CDR.
	Embedded decimal.Decimal
	// Delta is Computed minus Embedded.
	Delta decimal.Decimal
}

// Verdict is the result of Verify.
type Verdict struct {
	// Status is the overall verification outcome.
	Status Status
	// Mismatches lists embedded totals that differ from computed totals.
	Mismatches []Mismatch
	// Warnings are non-fatal verification notes.
	Warnings []Warning
}
