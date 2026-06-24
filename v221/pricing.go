package v221

import (
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	pricing "github.com/shiv3/gocpi/core/pricing"
)

func invalidInput(format string, a ...any) error {
	return &pricing.PricingError{Code: pricing.InvalidInput, Msg: fmt.Sprintf(format, a...)}
}

// Calculate prices a v2.2.1 CDR against a Tariff and returns the cost breakdown.
func Calculate(cdr CDR, tariff Tariff, opts pricing.Options) (pricing.Report, error) {
	in, err := FromCDR(cdr, tariff, opts)
	if err != nil {
		return pricing.Report{}, err
	}
	return pricing.Calculate(in, opts)
}

// Verify recomputes a v2.2.1 CDR's cost and compares it against the CDR's embedded totals.
func Verify(cdr CDR, tariff Tariff, opts pricing.Options) (pricing.Verdict, error) {
	in, err := FromCDR(cdr, tariff, opts)
	if err != nil {
		return pricing.Verdict{Status: pricing.StatusInvalidInput}, err
	}
	rep, err := pricing.Calculate(in, opts)
	if err != nil {
		return pricing.Verdict{Status: pricing.StatusInvalidInput}, err
	}
	return pricing.Verify(in, rep, opts), nil
}

// FromCDR converts a v2.2.1 CDR + Tariff into a version-neutral pricing.Input.
func FromCDR(cdr CDR, tariff Tariff, opts pricing.Options) (pricing.Input, error) {
	if err := rejectMultiTariff(cdr.ChargingPeriods); err != nil {
		return pricing.Input{}, err
	}

	neutralTariff, err := tariffToInput(tariff)
	if err != nil {
		return pricing.Input{}, err
	}

	in := pricing.Input{
		Version:     pricing.V221,
		Currency:    cdr.Currency,
		Start:       cdr.StartDateTime,
		End:         cdr.EndDateTime,
		CountryCode: cdr.CountryCode,
		Tariffs:     []pricing.Tariff{neutralTariff},
		Periods:     make([]pricing.Period, 0, len(cdr.ChargingPeriods)),
		Embedded: pricing.EmbeddedTotals{
			TotalCost:            moneyFromPrice(&cdr.TotalCost),
			TotalEnergyCost:      moneyFromPrice(cdr.TotalEnergyCost),
			TotalTimeCost:        moneyFromPrice(cdr.TotalTimeCost),
			TotalParkingCost:     moneyFromPrice(cdr.TotalParkingCost),
			TotalFixedCost:       moneyFromPrice(cdr.TotalFixedCost),
			TotalReservationCost: moneyFromPrice(cdr.TotalReservationCost),
			TotalEnergy:          decimalPtr(cdr.TotalEnergy),
			TotalTime:            decimalPtr(cdr.TotalTime),
		},
	}

	for _, cp := range cdr.ChargingPeriods {
		period, warnings, err := periodToInput(cp)
		if err != nil {
			return pricing.Input{}, err
		}
		period.TariffIndex = pricing.IntPtr(0)
		in.Periods = append(in.Periods, period)
		in.Warnings = append(in.Warnings, warnings...)
	}

	if err := pricing.ValidateInput(in); err != nil {
		return pricing.Input{}, err
	}
	return in, nil
}

func rejectMultiTariff(periods []ChargingPeriod) error {
	seen := make(map[string]struct{})
	for _, period := range periods {
		if period.TariffID == nil {
			continue
		}
		seen[*period.TariffID] = struct{}{}
		if len(seen) > 1 {
			return invalidInput("charging periods reference more than one tariff")
		}
	}
	return nil
}

func tariffToInput(tariff Tariff) (pricing.Tariff, error) {
	out := pricing.Tariff{
		ID:            tariff.ID,
		Currency:      tariff.Currency,
		StartDateTime: tariff.StartDateTime,
		EndDateTime:   tariff.EndDateTime,
		MinPrice:      moneyFromPrice(tariff.MinPrice),
		MaxPrice:      moneyFromPrice(tariff.MaxPrice),
		Elements:      make([]pricing.Element, 0, len(tariff.Elements)),
	}

	for i := range tariff.Elements {
		element, err := elementToInput(tariff.Elements[i])
		if err != nil {
			return pricing.Tariff{}, err
		}
		out.Elements = append(out.Elements, element)
	}

	return out, nil
}

func elementToInput(element TariffElement) (pricing.Element, error) {
	out := pricing.Element{
		Components: make([]pricing.PriceComponent, 0, len(element.PriceComponents)),
	}

	for _, component := range element.PriceComponents {
		mapped, err := priceComponentToInput(component)
		if err != nil {
			return pricing.Element{}, err
		}
		out.Components = append(out.Components, mapped)
	}

	restrictions, err := restrictionsToInput(element.Restrictions)
	if err != nil {
		return pricing.Element{}, err
	}
	out.Restrictions = restrictions

	return out, nil
}

func priceComponentToInput(component PriceComponent) (pricing.PriceComponent, error) {
	dim, ok := pricing.ParseDimensionType(string(component.Type))
	if !ok {
		return pricing.PriceComponent{}, invalidInput("unknown tariff dimension type %q", component.Type)
	}

	out := pricing.PriceComponent{
		Type:     dim,
		Price:    component.Price,
		StepSize: component.StepSize,
	}
	if component.VAT != nil {
		out.Taxes = []pricing.TaxAmount{{Percent: component.VAT}}
	}

	return out, nil
}

func restrictionsToInput(restrictions *TariffRestrictions) (*pricing.Restrictions, error) {
	if restrictions == nil {
		return nil, nil
	}

	out := &pricing.Restrictions{
		StartTime:  restrictions.StartTime,
		EndTime:    restrictions.EndTime,
		StartDate:  restrictions.StartDate,
		EndDate:    restrictions.EndDate,
		MinKwh:     restrictions.MinKwh,
		MaxKwh:     restrictions.MaxKwh,
		MinCurrent: restrictions.MinCurrent,
		MaxCurrent: restrictions.MaxCurrent,
		MinPower:   restrictions.MinPower,
		MaxPower:   restrictions.MaxPower,
		DayOfWeek:  make([]time.Weekday, 0, len(restrictions.DayOfWeek)),
	}
	if restrictions.MinDuration != nil {
		out.MinDuration = durationSecondsPtr(*restrictions.MinDuration)
	}
	if restrictions.MaxDuration != nil {
		out.MaxDuration = durationSecondsPtr(*restrictions.MaxDuration)
	}
	if restrictions.Reservation != nil {
		reservation := pricing.ReservationType(string(*restrictions.Reservation))
		out.Reservation = &reservation
	}
	for _, day := range restrictions.DayOfWeek {
		weekday, err := weekdayToTime(day)
		if err != nil {
			return nil, err
		}
		out.DayOfWeek = append(out.DayOfWeek, weekday)
	}

	return out, nil
}

func weekdayToTime(day DayOfWeek) (time.Weekday, error) {
	switch day {
	case DayOfWeekMonday:
		return time.Monday, nil
	case DayOfWeekTuesday:
		return time.Tuesday, nil
	case DayOfWeekWednesday:
		return time.Wednesday, nil
	case DayOfWeekThursday:
		return time.Thursday, nil
	case DayOfWeekFriday:
		return time.Friday, nil
	case DayOfWeekSaturday:
		return time.Saturday, nil
	case DayOfWeekSunday:
		return time.Sunday, nil
	default:
		return time.Sunday, invalidInput("unknown day_of_week %q", day)
	}
}

func periodToInput(period ChargingPeriod) (pricing.Period, []pricing.Warning, error) {
	out := pricing.Period{Start: period.StartDateTime}
	var warnings []pricing.Warning
	seen := make(map[CdrDimensionType]struct{}, len(period.Dimensions))
	for _, dim := range period.Dimensions {
		if _, ok := seen[dim.Type]; ok {
			return pricing.Period{}, nil, invalidInput("duplicate dimension %s in charging period", dim.Type)
		}
		seen[dim.Type] = struct{}{}

		volume := decimalPtr(dim.Volume)
		switch dim.Type {
		case CdrDimensionTypeEnergy:
			out.Energy = volume
		case CdrDimensionTypeTime:
			out.Time = volume
		case CdrDimensionTypeParkingTime:
			out.ParkingTime = volume
		case CdrDimensionTypeMaxPower:
			out.MaxPower = volume
		case CdrDimensionTypeMinPower:
			out.MinPower = volume
		case CdrDimensionTypeMaxCurrent:
			out.MaxCurrent = volume
		case CdrDimensionTypeMinCurrent:
			out.MinCurrent = volume
		case CdrDimensionTypePower:
			out.MinPower = volume
			out.MaxPower = decimalPtr(dim.Volume)
		case CdrDimensionTypeCurrent:
			out.MinCurrent = volume
			out.MaxCurrent = decimalPtr(dim.Volume)
		case CdrDimensionTypeEnergyImport,
			CdrDimensionTypeEnergyExport,
			CdrDimensionTypeReservationTime,
			CdrDimensionTypeStateOfCharge:
			continue
		default:
			warnings = append(warnings, pricing.Warning{
				Code: pricing.WarnUnknownDimension,
				Kind: pricing.KindWarning,
				Msg:  fmt.Sprintf("unknown CDR dimension type %q", dim.Type),
			})
		}
	}
	return out, warnings, nil
}

func moneyFromPrice(price *Price) *pricing.Money {
	if price == nil {
		return nil
	}
	return &pricing.Money{
		BeforeTaxes: price.ExclVAT,
		AfterTaxes:  price.InclVAT,
	}
}

func decimalPtr(value decimal.Decimal) *decimal.Decimal {
	copied := value
	return &copied
}

func durationSecondsPtr(seconds int) *time.Duration {
	duration := time.Duration(seconds) * time.Second
	return &duration
}
