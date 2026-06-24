package pricing

import (
	"time"

	"github.com/shopspring/decimal"
)

type WarningKind int

const (
	KindWarning WarningKind = iota
	KindDiagnostic
)

type Warning struct {
	Code WarningCode
	Kind WarningKind
	Msg  string
}

type Dimension struct {
	Volume decimal.Decimal
	Cost   Money
}

type PeriodReport struct {
	Start time.Time
	Costs map[DimensionType]Money
}

type Report struct {
	TotalCost            Money
	TotalEnergyCost      Money
	TotalTimeCost        Money
	TotalParkingCost     Money
	TotalFixedCost       Money
	TotalReservationCost *Money
	Dimensions           map[DimensionType]Dimension
	Periods              []PeriodReport
	Warnings             []Warning
}

type Status int

const (
	StatusOK Status = iota
	StatusMismatch
	StatusNotVerifiable
	StatusInvalidInput
)

type Mismatch struct {
	Field    string
	Computed decimal.Decimal
	Embedded decimal.Decimal
	Delta    decimal.Decimal
}

type Verdict struct {
	Status     Status
	Mismatches []Mismatch
	Warnings   []Warning
}
