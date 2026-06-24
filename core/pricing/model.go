package pricing

import (
	"time"

	"github.com/shopspring/decimal"
)

// Version identifies the OCPI version a neutral Input was adapted from.
type Version int

const (
	// V221 identifies inputs adapted from OCPI 2.2.1.
	V221 Version = iota
	// V230 identifies inputs adapted from OCPI 2.3.0.
	V230
)

// DimensionType identifies a priced OCPI tariff dimension.
type DimensionType int

const (
	// Energy is the ENERGY tariff dimension, measured in kWh.
	Energy DimensionType = iota
	// Time is the TIME tariff dimension, measured as charging time.
	Time
	// ParkingTime is the PARKING_TIME tariff dimension, measured as idle time.
	ParkingTime
	// Flat is the FLAT tariff dimension, billed as a one-off fee.
	Flat
)

// ParseDimensionType parses an OCPI tariff dimension string.
//
// ParseDimensionType returns ok=false for unknown strings.
func ParseDimensionType(s string) (DimensionType, bool) {
	switch s {
	case "ENERGY":
		return Energy, true
	case "TIME":
		return Time, true
	case "PARKING_TIME":
		return ParkingTime, true
	case "FLAT":
		return Flat, true
	default:
		return 0, false
	}
}

// String returns the OCPI tariff dimension string for d.
func (d DimensionType) String() string {
	switch d {
	case Energy:
		return "ENERGY"
	case Time:
		return "TIME"
	case ParkingTime:
		return "PARKING_TIME"
	case Flat:
		return "FLAT"
	default:
		return ""
	}
}

// Input is a version-neutral pricing input adapted from a CDR and tariff.
type Input struct {
	// Version is the OCPI version the input was adapted from.
	Version Version
	// Currency is the CDR currency and must match the tariff currency.
	Currency string
	// Start is the session start bound in UTC.
	Start time.Time
	// End is the session end bound in UTC.
	End time.Time
	// CountryCode is the CDR ISO 3166-1 alpha-2 country code used only for timezone inference fallback.
	CountryCode string
	// Periods are the CDR charging_periods used as supplied by the CDR.
	Periods []Period
	// Tariff is the version-neutral tariff used to price the CDR.
	Tariff Tariff
	// Embedded contains the CDR's own reported totals used by Verify.
	Embedded EmbeddedTotals
	// Warnings carries diagnostics produced while adapting a CDR (e.g. unknown dimension types); Calculate merges them into the Report.
	Warnings []Warning
}

// Period represents one CDR charging period.
//
// Period volumes come from the CDR's dimensions and are not derived by the
// pricing engine. Pointer fields are nil when the corresponding dimension or
// reading is absent.
type Period struct {
	// Start is the charging period start time.
	Start time.Time
	// Energy is the CDR-provided ENERGY volume in kWh.
	Energy *decimal.Decimal
	// Time is the CDR-provided TIME volume in decimal hours.
	Time *decimal.Decimal
	// ParkingTime is the CDR-provided PARKING_TIME volume in decimal hours.
	ParkingTime *decimal.Decimal
	// MinPower is the period's minimum power reading.
	MinPower *decimal.Decimal
	// MaxPower is the period's maximum power reading.
	MaxPower *decimal.Decimal
	// MinCurrent is the period's minimum current reading.
	MinCurrent *decimal.Decimal
	// MaxCurrent is the period's maximum current reading.
	MaxCurrent *decimal.Decimal
}

// Tariff is the version-neutral tariff used by the pricing engine.
type Tariff struct {
	// Currency is the tariff currency.
	Currency string
	// StartDateTime is the optional tariff validity window start.
	StartDateTime *time.Time
	// EndDateTime is the optional tariff validity window end.
	EndDateTime *time.Time
	// MinPrice is an optional minimum total price clamp.
	MinPrice *Money
	// MaxPrice is an optional maximum total price clamp.
	MaxPrice *Money
	// Elements are evaluated in order, with the first matching component per dimension used for pricing.
	Elements []Element
}

// Element is a tariff element containing price components and optional restrictions.
type Element struct {
	// Components are the element's price components by tariff dimension.
	Components []PriceComponent
	// Restrictions limits when the element applies; nil means unrestricted.
	Restrictions *Restrictions
}

// PriceComponent prices one tariff dimension.
type PriceComponent struct {
	// Type is the tariff dimension this component prices.
	Type DimensionType
	// Price is the per-unit price before taxes.
	Price decimal.Decimal
	// Taxes are the applicable taxes, empty when none.
	Taxes []TaxAmount
	// StepSize is in base units and rounds consumed volume up to the next step.
	//
	// StepSize is Wh for ENERGY and seconds for TIME/PARKING_TIME. It is ignored
	// for FLAT.
	StepSize int
}

// Restrictions limits an element to periods where all set restrictions hold.
type Restrictions struct {
	// StartTime is the inclusive local "HH:MM" start of a time restriction.
	StartTime *string
	// EndTime is the exclusive local "HH:MM" end of a time restriction; end<start wraps across midnight.
	EndTime *string
	// StartDate is the inclusive local date start of a date restriction.
	StartDate *string
	// EndDate is the exclusive local date end of a date restriction.
	EndDate *string
	// MinKwh is the inclusive lower bound for cumulative session energy.
	MinKwh *decimal.Decimal
	// MaxKwh is the exclusive upper bound for cumulative session energy.
	MaxKwh *decimal.Decimal
	// MinCurrent is the inclusive lower bound tested against the period's maximum current reading.
	MinCurrent *decimal.Decimal
	// MaxCurrent is the exclusive upper bound tested against the period's minimum current reading.
	MaxCurrent *decimal.Decimal
	// MinPower is the inclusive lower bound tested against the period's maximum power reading.
	MinPower *decimal.Decimal
	// MaxPower is the exclusive upper bound tested against the period's minimum power reading.
	MaxPower *decimal.Decimal
	// MinDuration is the inclusive lower bound for elapsed session duration.
	MinDuration *time.Duration
	// MaxDuration is the exclusive upper bound for elapsed session duration.
	MaxDuration *time.Duration
	// DayOfWeek is the set of local weekdays when the element applies.
	DayOfWeek []time.Weekday
	// Reservation marks the element as reservation-only; in v1 it never matches a normal charging session.
	Reservation *ReservationType
	// Unsupported lists restriction fields the engine cannot evaluate and makes the element never match.
	Unsupported []string
}

// Money represents a monetary amount.
type Money struct {
	// BeforeTaxes is the pre-tax amount.
	BeforeTaxes decimal.Decimal
	// AfterTaxes is the tax-inclusive amount when known; nil means it was not supplied or derivable.
	AfterTaxes *decimal.Decimal
	// Taxes is the optional tax breakdown.
	Taxes []TaxAmount
}

// TaxAmount is one tax line for a monetary amount.
type TaxAmount struct {
	// Name is an optional tax label.
	Name string
	// Percent is an optional percentage tax rate.
	Percent *decimal.Decimal
	// Amount is an optional absolute tax amount.
	Amount *decimal.Decimal
}

// Options controls pricing and verification behavior.
type Options struct {
	// TimeZone is the location IANA zone, usually sourced from Location.time_zone.
	//
	// TimeZone nil makes the engine infer from CountryCode or compute in UTC with
	// a warning when inference is unavailable.
	TimeZone *time.Location
	// StrictTimeZone makes a missing zone an error when the tariff has local-time restrictions.
	StrictTimeZone bool
	// Tolerance is the allowed absolute difference in Verify comparisons; the default is zero.
	Tolerance decimal.Decimal
	// CurrencyPrecision rounds totals to the given decimal places when set; nil keeps OCPI scale-4 totals.
	CurrencyPrecision *int
	// UseEmbeddedTariff prices against the CDR's embedded tariff when present.
	UseEmbeddedTariff bool
}

// EmbeddedTotals contains the CDR's own reported totals used by Verify.
type EmbeddedTotals struct {
	// TotalCost is the optional CDR-reported session total cost.
	TotalCost *Money
	// TotalEnergyCost is the optional CDR-reported energy cost subtotal.
	TotalEnergyCost *Money
	// TotalTimeCost is the optional CDR-reported charging time cost subtotal.
	TotalTimeCost *Money
	// TotalParkingCost is the optional CDR-reported parking time cost subtotal.
	TotalParkingCost *Money
	// TotalFixedCost is the optional CDR-reported fixed cost subtotal.
	TotalFixedCost *Money
	// TotalReservationCost is the optional CDR-reported reservation cost subtotal.
	TotalReservationCost *Money
	// TotalEnergy is the optional CDR-reported total energy volume.
	TotalEnergy *decimal.Decimal
	// TotalTime is the optional CDR-reported total charging time volume.
	TotalTime *decimal.Decimal
}

// ReservationType is an OCPI reservation restriction value.
type ReservationType string

const (
	// ReservationTypeReservation is the OCPI RESERVATION restriction value.
	ReservationTypeReservation ReservationType = "RESERVATION"
	// ReservationTypeReservationExpires is the OCPI RESERVATION_EXPIRES restriction value.
	ReservationTypeReservationExpires ReservationType = "RESERVATION_EXPIRES"
)
