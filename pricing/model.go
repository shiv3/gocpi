package pricing

import (
	"time"

	"github.com/shopspring/decimal"
)

type Version int

const (
	V221 Version = iota
	V230
)

type DimensionType int

const (
	Energy DimensionType = iota
	Time
	ParkingTime
	Flat
)

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

type Input struct {
	Version     Version
	Currency    string
	Start       time.Time
	End         time.Time
	CountryCode string
	Periods     []Period
	Tariff      Tariff
	Embedded    EmbeddedTotals
}

type Period struct {
	Start       time.Time
	Energy      *decimal.Decimal
	Time        *decimal.Decimal
	ParkingTime *decimal.Decimal
	MinPower    *decimal.Decimal
	MaxPower    *decimal.Decimal
	MinCurrent  *decimal.Decimal
	MaxCurrent  *decimal.Decimal
}

type Tariff struct {
	Currency      string
	StartDateTime *time.Time
	EndDateTime   *time.Time
	MinPrice      *Money
	MaxPrice      *Money
	Elements      []Element
}

type Element struct {
	Components   []PriceComponent
	Restrictions *Restrictions
}

type PriceComponent struct {
	Type     DimensionType
	Price    decimal.Decimal
	Taxes    []TaxAmount
	StepSize int
}

type Restrictions struct {
	StartTime   *string
	EndTime     *string
	StartDate   *string
	EndDate     *string
	MinKwh      *decimal.Decimal
	MaxKwh      *decimal.Decimal
	MinCurrent  *decimal.Decimal
	MaxCurrent  *decimal.Decimal
	MinPower    *decimal.Decimal
	MaxPower    *decimal.Decimal
	MinDuration *time.Duration
	MaxDuration *time.Duration
	DayOfWeek   []time.Weekday
	Reservation *ReservationType
	Unsupported []string
}

type Money struct {
	BeforeTaxes decimal.Decimal
	AfterTaxes  *decimal.Decimal
	Taxes       []TaxAmount
}

type TaxAmount struct {
	Name    string
	Percent *decimal.Decimal
	Amount  *decimal.Decimal
}

type Options struct {
	TimeZone          *time.Location
	StrictTimeZone    bool
	Tolerance         decimal.Decimal
	CurrencyPrecision *int
	UseEmbeddedTariff bool
}

type EmbeddedTotals struct {
	TotalCost            *Money
	TotalEnergyCost      *Money
	TotalTimeCost        *Money
	TotalParkingCost     *Money
	TotalFixedCost       *Money
	TotalReservationCost *Money
	TotalEnergy          *decimal.Decimal
	TotalTime            *decimal.Decimal
}

type ReservationType string

const (
	ReservationTypeReservation        ReservationType = "RESERVATION"
	ReservationTypeReservationExpires ReservationType = "RESERVATION_EXPIRES"
)
