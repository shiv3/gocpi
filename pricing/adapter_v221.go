package pricing

import (
	"time"

	"github.com/shopspring/decimal"

	"github.com/shiv3/gocpi/v221"
)

func FromV221(cdr v221.CDR, tariff v221.Tariff, opts Options) (Input, error) {
	if opts.UseEmbeddedTariff {
		if len(cdr.Tariffs) != 1 {
			return Input{}, invalidInput("expected exactly one embedded tariff, got %d", len(cdr.Tariffs))
		}
		tariff = cdr.Tariffs[0]
	}

	if err := rejectMultiTariff(cdr.ChargingPeriods); err != nil {
		return Input{}, err
	}

	neutralTariff, err := tariffFromV221(tariff)
	if err != nil {
		return Input{}, err
	}

	in := Input{
		Version:     V221,
		Currency:    cdr.Currency,
		Start:       cdr.StartDateTime,
		End:         cdr.EndDateTime,
		CountryCode: cdr.CountryCode,
		Tariff:      neutralTariff,
		Periods:     make([]Period, 0, len(cdr.ChargingPeriods)),
		Embedded: EmbeddedTotals{
			TotalCost:            moneyFromV221Price(&cdr.TotalCost),
			TotalEnergyCost:      moneyFromV221Price(cdr.TotalEnergyCost),
			TotalTimeCost:        moneyFromV221Price(cdr.TotalTimeCost),
			TotalParkingCost:     moneyFromV221Price(cdr.TotalParkingCost),
			TotalFixedCost:       moneyFromV221Price(cdr.TotalFixedCost),
			TotalReservationCost: moneyFromV221Price(cdr.TotalReservationCost),
			TotalEnergy:          decimalPtr(cdr.TotalEnergy),
			TotalTime:            decimalPtr(cdr.TotalTime),
		},
	}

	for _, cp := range cdr.ChargingPeriods {
		period, err := periodFromV221(cp)
		if err != nil {
			return Input{}, err
		}
		in.Periods = append(in.Periods, period)
	}

	if err := ValidateInput(in); err != nil {
		return Input{}, err
	}
	return in, nil
}

func CalculateV221(cdr v221.CDR, tariff v221.Tariff, opts Options) (Report, error) {
	in, err := FromV221(cdr, tariff, opts)
	if err != nil {
		return Report{}, err
	}
	return Calculate(in, opts)
}

func VerifyV221(cdr v221.CDR, tariff v221.Tariff, opts Options) (Verdict, error) {
	in, err := FromV221(cdr, tariff, opts)
	if err != nil {
		return Verdict{Status: StatusInvalidInput}, err
	}
	rep, err := Calculate(in, opts)
	if err != nil {
		return Verdict{Status: StatusInvalidInput}, err
	}
	return Verify(in, rep, opts), nil
}

func rejectMultiTariff(periods []v221.ChargingPeriod) error {
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

func tariffFromV221(tariff v221.Tariff) (Tariff, error) {
	out := Tariff{
		Currency:      tariff.Currency,
		StartDateTime: tariff.StartDateTime,
		EndDateTime:   tariff.EndDateTime,
		MinPrice:      moneyFromV221Price(tariff.MinPrice),
		MaxPrice:      moneyFromV221Price(tariff.MaxPrice),
		Elements:      make([]Element, 0, len(tariff.Elements)),
	}

	for i := range tariff.Elements {
		element, err := elementFromV221(tariff.Elements[i])
		if err != nil {
			return Tariff{}, err
		}
		out.Elements = append(out.Elements, element)
	}

	return out, nil
}

func elementFromV221(element v221.TariffElement) (Element, error) {
	out := Element{
		Components: make([]PriceComponent, 0, len(element.PriceComponents)),
	}

	for _, component := range element.PriceComponents {
		mapped, err := priceComponentFromV221(component)
		if err != nil {
			return Element{}, err
		}
		out.Components = append(out.Components, mapped)
	}

	restrictions, err := restrictionsFromV221(element.Restrictions)
	if err != nil {
		return Element{}, err
	}
	out.Restrictions = restrictions

	return out, nil
}

func priceComponentFromV221(component v221.PriceComponent) (PriceComponent, error) {
	dim, ok := ParseDimensionType(string(component.Type))
	if !ok {
		return PriceComponent{}, invalidInput("unknown tariff dimension type %q", component.Type)
	}

	out := PriceComponent{
		Type:     dim,
		Price:    component.Price,
		StepSize: component.StepSize,
	}
	if component.VAT != nil {
		out.Taxes = []TaxAmount{{Percent: component.VAT}}
	}

	return out, nil
}

func restrictionsFromV221(restrictions *v221.TariffRestrictions) (*Restrictions, error) {
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
	if restrictions.Reservation != nil {
		reservation := ReservationType(string(*restrictions.Reservation))
		out.Reservation = &reservation
	}
	for _, day := range restrictions.DayOfWeek {
		weekday, err := weekdayFromV221(day)
		if err != nil {
			return nil, err
		}
		out.DayOfWeek = append(out.DayOfWeek, weekday)
	}

	return out, nil
}

func weekdayFromV221(day v221.DayOfWeek) (time.Weekday, error) {
	switch day {
	case v221.DayOfWeekMonday:
		return time.Monday, nil
	case v221.DayOfWeekTuesday:
		return time.Tuesday, nil
	case v221.DayOfWeekWednesday:
		return time.Wednesday, nil
	case v221.DayOfWeekThursday:
		return time.Thursday, nil
	case v221.DayOfWeekFriday:
		return time.Friday, nil
	case v221.DayOfWeekSaturday:
		return time.Saturday, nil
	case v221.DayOfWeekSunday:
		return time.Sunday, nil
	default:
		return time.Sunday, invalidInput("unknown day_of_week %q", day)
	}
}

func periodFromV221(period v221.ChargingPeriod) (Period, error) {
	out := Period{Start: period.StartDateTime}
	seen := make(map[v221.CdrDimensionType]struct{}, len(period.Dimensions))
	for _, dim := range period.Dimensions {
		if _, ok := seen[dim.Type]; ok {
			return Period{}, invalidInput("duplicate dimension %s in charging period", dim.Type)
		}
		seen[dim.Type] = struct{}{}

		volume := decimalPtr(dim.Volume)
		switch dim.Type {
		case v221.CdrDimensionTypeEnergy:
			out.Energy = volume
		case v221.CdrDimensionTypeTime:
			out.Time = volume
		case v221.CdrDimensionTypeParkingTime:
			out.ParkingTime = volume
		case v221.CdrDimensionTypeMaxPower:
			out.MaxPower = volume
		case v221.CdrDimensionTypeMinPower:
			out.MinPower = volume
		case v221.CdrDimensionTypeMaxCurrent:
			out.MaxCurrent = volume
		case v221.CdrDimensionTypeMinCurrent:
			out.MinCurrent = volume
		case v221.CdrDimensionTypePower:
			out.MinPower = volume
			out.MaxPower = decimalPtr(dim.Volume)
		case v221.CdrDimensionTypeCurrent:
			out.MinCurrent = volume
			out.MaxCurrent = decimalPtr(dim.Volume)
		}
	}
	return out, nil
}

func moneyFromV221Price(price *v221.Price) *Money {
	if price == nil {
		return nil
	}
	return &Money{
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
