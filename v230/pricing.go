package v230

import (
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	pricing "github.com/shiv3/gocpi/core/pricing"
)

func invalidInput(format string, a ...any) error {
	return &pricing.PricingError{Code: pricing.InvalidInput, Msg: fmt.Sprintf(format, a...)}
}

// CalculateCDR prices a v2.3.0 CDR using the tariffs embedded in the CDR,
// resolving each charging period to its tariff_id, and returns the cost
// breakdown. Periods with no applicable tariff are excluded from cost. This is
// the primary entry point; use CalculateWithTariff to price against an explicit
// tariff that overrides the CDR's embedded tariffs.
func CalculateCDR(cdr CDR, opts pricing.Options) (pricing.Report, error) {
	in, err := fromCDRMultiTariff(cdr, opts)
	if err != nil {
		return pricing.Report{}, err
	}
	return pricing.Calculate(in, opts)
}

// VerifyCDR recomputes a v2.3.0 CDR's cost using the CDR's embedded tariffs and
// per-period tariff_id, then compares it with the CDR's embedded totals.
func VerifyCDR(cdr CDR, opts pricing.Options) (pricing.Verdict, error) {
	in, err := fromCDRMultiTariff(cdr, opts)
	if err != nil {
		return pricing.Verdict{Status: pricing.StatusInvalidInput}, err
	}
	rep, err := pricing.Calculate(in, opts)
	if err != nil {
		return pricing.Verdict{Status: pricing.StatusInvalidInput}, err
	}
	return pricing.Verify(in, rep, opts), nil
}

// CalculateWithTariff prices a v2.3.0 CDR against an explicitly supplied Tariff
// and returns the cost breakdown. Per-period tariff_id values are ignored; the
// supplied tariff prices every period. Use CalculateCDR to honor the CDR's
// embedded tariffs.
func CalculateWithTariff(cdr CDR, tariff Tariff, opts pricing.Options) (pricing.Report, error) {
	in, err := FromCDR(cdr, tariff, opts)
	if err != nil {
		return pricing.Report{}, err
	}
	return pricing.Calculate(in, opts)
}

// VerifyWithTariff recomputes a v2.3.0 CDR's cost against an explicitly supplied
// Tariff and compares it with the CDR's embedded totals. Per-period tariff_id
// values are ignored; use VerifyCDR to honor the CDR's embedded tariffs.
func VerifyWithTariff(cdr CDR, tariff Tariff, opts pricing.Options) (pricing.Verdict, error) {
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

// FromCDR converts a v2.3.0 CDR + explicit Tariff into a version-neutral
// pricing.Input. Every period is priced against the supplied tariff; per-period
// tariff_id values are ignored.
func FromCDR(cdr CDR, tariff Tariff, opts pricing.Options) (pricing.Input, error) {
	neutralTariff, err := tariffToInput(tariff)
	if err != nil {
		return pricing.Input{}, err
	}

	in := newNeutralInput(cdr, []pricing.Tariff{neutralTariff})
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

// fromCDRMultiTariff converts a v2.3.0 CDR into a version-neutral pricing.Input
// using the CDR's embedded tariffs, resolving each charging period's tariff_id
// to a tariff index.
func fromCDRMultiTariff(cdr CDR, _ pricing.Options) (pricing.Input, error) {
	if len(cdr.Tariffs) == 0 {
		return pricing.Input{}, invalidInput("CDR has no embedded tariffs")
	}

	tariffs := make([]pricing.Tariff, 0, len(cdr.Tariffs))
	indexByID := make(map[string]int, len(cdr.Tariffs))
	for i := range cdr.Tariffs {
		neutralTariff, err := tariffToInput(cdr.Tariffs[i])
		if err != nil {
			return pricing.Input{}, err
		}
		if neutralTariff.ID != "" {
			if _, dup := indexByID[neutralTariff.ID]; dup {
				return pricing.Input{}, invalidInput("duplicate embedded tariff id %q", neutralTariff.ID)
			}
			indexByID[neutralTariff.ID] = i
		}
		tariffs = append(tariffs, neutralTariff)
	}
	singleTariff := len(cdr.Tariffs) == 1

	in := newNeutralInput(cdr, tariffs)
	for _, cp := range cdr.ChargingPeriods {
		period, warnings, err := periodToInput(cp)
		if err != nil {
			return pricing.Input{}, err
		}
		idx, err := resolveTariffIndex(cp.TariffID, singleTariff, indexByID)
		if err != nil {
			return pricing.Input{}, err
		}
		period.TariffIndex = idx
		in.Periods = append(in.Periods, period)
		in.Warnings = append(in.Warnings, warnings...)
	}

	if err := pricing.ValidateInput(in); err != nil {
		return pricing.Input{}, err
	}
	return in, nil
}

// resolveTariffIndex maps a charging period's tariff_id to a tariff index. With
// a single embedded tariff, a nil or matching tariff_id selects it and any other
// value is rejected. With multiple tariffs, a nil tariff_id leaves the period
// without a tariff (priced as zero with a warning) and a non-matching tariff_id
// is rejected.
func resolveTariffIndex(tariffID *string, singleTariff bool, indexByID map[string]int) (*int, error) {
	if singleTariff {
		if tariffID == nil {
			return pricing.IntPtr(0), nil
		}
		if idx, ok := indexByID[*tariffID]; ok {
			return pricing.IntPtr(idx), nil
		}
		return nil, invalidInput("charging period references unknown tariff_id %q", *tariffID)
	}
	if tariffID == nil {
		return nil, nil
	}
	if idx, ok := indexByID[*tariffID]; ok {
		return pricing.IntPtr(idx), nil
	}
	return nil, invalidInput("charging period references unknown tariff_id %q", *tariffID)
}

// newNeutralInput builds the version-neutral Input skeleton shared by the
// explicit-tariff and embedded-tariff adapters (everything except per-period
// TariffIndex).
func newNeutralInput(cdr CDR, tariffs []pricing.Tariff) pricing.Input {
	return pricing.Input{
		Version:     pricing.V230,
		Currency:    cdr.Currency,
		Start:       cdr.StartDateTime,
		End:         cdr.EndDateTime,
		CountryCode: cdr.CountryCode,
		Tariffs:     tariffs,
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
}

func tariffToInput(tariff Tariff) (pricing.Tariff, error) {
	out := pricing.Tariff{
		ID:            tariff.ID,
		Currency:      tariff.Currency,
		StartDateTime: tariff.StartDateTime,
		EndDateTime:   tariff.EndDateTime,
		MinPrice:      moneyFromPriceLimit(tariff.MinPrice),
		MaxPrice:      moneyFromPriceLimit(tariff.MaxPrice),
		Elements:      make([]pricing.Element, 0, len(tariff.Elements)),
	}

	for i := range tariff.Elements {
		element, err := elementToInput(tariff.Elements[i], tariff.TaxIncluded)
		if err != nil {
			return pricing.Tariff{}, err
		}
		out.Elements = append(out.Elements, element)
	}

	return out, nil
}

func elementToInput(element TariffElement, taxIncluded TaxIncluded) (pricing.Element, error) {
	out := pricing.Element{
		Components: make([]pricing.PriceComponent, 0, len(element.PriceComponents)),
	}

	for _, component := range element.PriceComponents {
		mapped, err := priceComponentToInput(component, taxIncluded)
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

func priceComponentToInput(component PriceComponent, taxIncluded TaxIncluded) (pricing.PriceComponent, error) {
	dim, ok := pricing.ParseDimensionType(string(component.Type))
	if !ok {
		return pricing.PriceComponent{}, invalidInput("unknown tariff dimension type %q", component.Type)
	}

	out := pricing.PriceComponent{
		Type:     dim,
		Price:    component.Price,
		StepSize: component.StepSize,
	}

	switch taxIncluded {
	case TaxIncludedNA:
		return out, nil
	case TaxIncludedYes:
		if component.VAT == nil {
			return out, nil
		}
		taxFactor := decimal.NewFromInt(1).Add(component.VAT.Div(decimal.NewFromInt(100)))
		if taxFactor.IsZero() {
			return pricing.PriceComponent{}, invalidInput("tax_included YES with VAT %s divides by zero", component.VAT)
		}
		out.Price = component.Price.Div(taxFactor)
		out.Taxes = []pricing.TaxAmount{{Percent: component.VAT}}
	default:
		if component.VAT != nil {
			out.Taxes = []pricing.TaxAmount{{Percent: component.VAT}}
		}
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
	if restrictions.Booking != nil {
		out.Unsupported = []string{"booking"}
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
			CdrDimensionTypeReservationExpires,
			CdrDimensionTypeReservationOvertime,
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

func moneyFromPriceLimit(price *PriceLimit) *pricing.Money {
	if price == nil {
		return nil
	}
	return &pricing.Money{
		BeforeTaxes: price.BeforeTaxes,
		AfterTaxes:  price.AfterTaxes,
	}
}

func moneyFromPrice(price *Price) *pricing.Money {
	if price == nil {
		return nil
	}
	return &pricing.Money{
		BeforeTaxes: price.BeforeTaxes,
		Taxes:       mapTaxes(price.Taxes),
	}
}

func mapTaxes(taxes []TaxAmount) []pricing.TaxAmount {
	if len(taxes) == 0 {
		return nil
	}

	out := make([]pricing.TaxAmount, 0, len(taxes))
	for _, tax := range taxes {
		amount := tax.Amount
		out = append(out, pricing.TaxAmount{
			Name:    tax.Name,
			Percent: tax.Percentage,
			Amount:  &amount,
		})
	}
	return out
}

func decimalPtr(value decimal.Decimal) *decimal.Decimal {
	copied := value
	return &copied
}

func durationSecondsPtr(seconds int) *time.Duration {
	duration := time.Duration(seconds) * time.Second
	return &duration
}
