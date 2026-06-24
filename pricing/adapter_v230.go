package pricing

import (
	"time"

	"github.com/shopspring/decimal"

	"github.com/shiv3/gocpi/v230"
)

func FromV230(cdr v230.CDR, tariff v230.Tariff, opts Options) (Input, error) {
	if opts.UseEmbeddedTariff {
		if len(cdr.Tariffs) != 1 {
			return Input{}, invalidInput("expected exactly one embedded tariff, got %d", len(cdr.Tariffs))
		}
		tariff = cdr.Tariffs[0]
	}

	if err := rejectMultiTariffV230(cdr.ChargingPeriods); err != nil {
		return Input{}, err
	}

	neutralTariff, err := tariffFromV230(tariff)
	if err != nil {
		return Input{}, err
	}

	in := Input{
		Version:     V230,
		Currency:    cdr.Currency,
		Start:       cdr.StartDateTime,
		End:         cdr.EndDateTime,
		CountryCode: cdr.CountryCode,
		Tariff:      neutralTariff,
		Periods:     make([]Period, 0, len(cdr.ChargingPeriods)),
		Embedded: EmbeddedTotals{
			TotalCost:            moneyFromV230Price(&cdr.TotalCost),
			TotalEnergyCost:      moneyFromV230Price(cdr.TotalEnergyCost),
			TotalTimeCost:        moneyFromV230Price(cdr.TotalTimeCost),
			TotalParkingCost:     moneyFromV230Price(cdr.TotalParkingCost),
			TotalFixedCost:       moneyFromV230Price(cdr.TotalFixedCost),
			TotalReservationCost: moneyFromV230Price(cdr.TotalReservationCost),
			TotalEnergy:          decimalPtr(cdr.TotalEnergy),
			TotalTime:            decimalPtr(cdr.TotalTime),
		},
	}

	for _, cp := range cdr.ChargingPeriods {
		in.Periods = append(in.Periods, periodFromV230(cp))
	}

	if err := ValidateInput(in); err != nil {
		return Input{}, err
	}
	return in, nil
}

func CalculateV230(cdr v230.CDR, tariff v230.Tariff, opts Options) (Report, error) {
	in, err := FromV230(cdr, tariff, opts)
	if err != nil {
		return Report{}, err
	}
	return Calculate(in, opts)
}

func VerifyV230(cdr v230.CDR, tariff v230.Tariff, opts Options) (Verdict, error) {
	in, err := FromV230(cdr, tariff, opts)
	if err != nil {
		return Verdict{Status: StatusInvalidInput}, err
	}
	rep, err := Calculate(in, opts)
	if err != nil {
		return Verdict{Status: StatusInvalidInput}, err
	}
	return Verify(in, rep, opts), nil
}

func rejectMultiTariffV230(periods []v230.ChargingPeriod) error {
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

func tariffFromV230(tariff v230.Tariff) (Tariff, error) {
	out := Tariff{
		Currency:      tariff.Currency,
		StartDateTime: tariff.StartDateTime,
		EndDateTime:   tariff.EndDateTime,
		MinPrice:      moneyFromV230PriceLimit(tariff.MinPrice),
		MaxPrice:      moneyFromV230PriceLimit(tariff.MaxPrice),
		Elements:      make([]Element, 0, len(tariff.Elements)),
	}

	for i := range tariff.Elements {
		element, err := elementFromV230(tariff.Elements[i], tariff.TaxIncluded)
		if err != nil {
			return Tariff{}, err
		}
		out.Elements = append(out.Elements, element)
	}

	return out, nil
}

func elementFromV230(element v230.TariffElement, taxIncluded v230.TaxIncluded) (Element, error) {
	out := Element{
		Components: make([]PriceComponent, 0, len(element.PriceComponents)),
	}

	for _, component := range element.PriceComponents {
		mapped, err := priceComponentFromV230(component, taxIncluded)
		if err != nil {
			return Element{}, err
		}
		out.Components = append(out.Components, mapped)
	}

	restrictions, err := restrictionsFromV230(element.Restrictions)
	if err != nil {
		return Element{}, err
	}
	out.Restrictions = restrictions

	return out, nil
}

func priceComponentFromV230(component v230.PriceComponent, taxIncluded v230.TaxIncluded) (PriceComponent, error) {
	dim, ok := ParseDimensionType(string(component.Type))
	if !ok {
		return PriceComponent{}, invalidInput("unknown tariff dimension type %q", component.Type)
	}

	out := PriceComponent{
		Type:     dim,
		Price:    component.Price,
		StepSize: component.StepSize,
	}

	switch taxIncluded {
	case v230.TaxIncludedNA:
		return out, nil
	case v230.TaxIncludedYes:
		if component.VAT == nil {
			return out, nil
		}
		taxFactor := decimal.NewFromInt(1).Add(component.VAT.Div(decimal.NewFromInt(100)))
		if taxFactor.IsZero() {
			return PriceComponent{}, invalidInput("tax_included YES with VAT %s divides by zero", component.VAT)
		}
		out.Price = component.Price.Div(taxFactor)
		out.Taxes = []TaxAmount{{Percent: component.VAT}}
	default:
		if component.VAT != nil {
			out.Taxes = []TaxAmount{{Percent: component.VAT}}
		}
	}

	return out, nil
}

func restrictionsFromV230(restrictions *v230.TariffRestrictions) (*Restrictions, error) {
	if restrictions == nil {
		return nil, nil
	}

	out := &Restrictions{
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
	for _, day := range restrictions.DayOfWeek {
		weekday, err := weekdayFromV230(day)
		if err != nil {
			return nil, err
		}
		out.DayOfWeek = append(out.DayOfWeek, weekday)
	}
	if restrictions.Booking != nil {
		out.Unsupported = []string{"booking"}
	}

	return out, nil
}

func weekdayFromV230(day v230.DayOfWeek) (time.Weekday, error) {
	switch day {
	case v230.DayOfWeekMonday:
		return time.Monday, nil
	case v230.DayOfWeekTuesday:
		return time.Tuesday, nil
	case v230.DayOfWeekWednesday:
		return time.Wednesday, nil
	case v230.DayOfWeekThursday:
		return time.Thursday, nil
	case v230.DayOfWeekFriday:
		return time.Friday, nil
	case v230.DayOfWeekSaturday:
		return time.Saturday, nil
	case v230.DayOfWeekSunday:
		return time.Sunday, nil
	default:
		return time.Sunday, invalidInput("unknown day_of_week %q", day)
	}
}

func periodFromV230(period v230.ChargingPeriod) Period {
	out := Period{Start: period.StartDateTime}
	for _, dim := range period.Dimensions {
		volume := decimalPtr(dim.Volume)
		switch dim.Type {
		case v230.CdrDimensionTypeEnergy:
			out.Energy = volume
		case v230.CdrDimensionTypeTime:
			out.Time = volume
		case v230.CdrDimensionTypeParkingTime:
			out.ParkingTime = volume
		case v230.CdrDimensionTypeMaxPower:
			out.MaxPower = volume
		case v230.CdrDimensionTypeMinPower:
			out.MinPower = volume
		case v230.CdrDimensionTypeMaxCurrent:
			out.MaxCurrent = volume
		case v230.CdrDimensionTypeMinCurrent:
			out.MinCurrent = volume
		case v230.CdrDimensionTypePower:
			out.MinPower = volume
			out.MaxPower = decimalPtr(dim.Volume)
		case v230.CdrDimensionTypeCurrent:
			out.MinCurrent = volume
			out.MaxCurrent = decimalPtr(dim.Volume)
		}
	}
	return out
}

func moneyFromV230PriceLimit(price *v230.PriceLimit) *Money {
	if price == nil {
		return nil
	}
	return &Money{
		BeforeTaxes: price.BeforeTaxes,
		AfterTaxes:  price.AfterTaxes,
	}
}

func moneyFromV230Price(price *v230.Price) *Money {
	if price == nil {
		return nil
	}
	return &Money{
		BeforeTaxes: price.BeforeTaxes,
		Taxes:       mapV230Taxes(price.Taxes),
	}
}

func mapV230Taxes(taxes []v230.TaxAmount) []TaxAmount {
	if len(taxes) == 0 {
		return nil
	}

	out := make([]TaxAmount, 0, len(taxes))
	for _, tax := range taxes {
		amount := tax.Amount
		out = append(out, TaxAmount{
			Name:    tax.Name,
			Percent: tax.Percentage,
			Amount:  &amount,
		})
	}
	return out
}
