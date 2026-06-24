package pricing

import (
	"github.com/shopspring/decimal"
)

const (
	energyBaseUnitsPerKwh = 1000
	timeBaseUnitsPerHour  = 3600
)

type componentSet struct {
	energy, time, parking, flat *PriceComponent
}

type pricedPeriod struct {
	volume decimal.Decimal
	comp   *PriceComponent
}

func (c componentSet) complete() bool {
	return c.energy != nil && c.time != nil && c.parking != nil && c.flat != nil
}

func activeComponents(tariff Tariff, start snapshot, p Period) (componentSet, []Warning) {
	var cs componentSet
	var warns []Warning

	for i := range tariff.Elements {
		el := &tariff.Elements[i]
		ok, unsupported := matches(el.Restrictions, start, p)
		if unsupported {
			warns = append(warns, Warning{
				Code: WarnUnsupportedRestriction,
				Kind: KindWarning,
				Msg:  "element skipped: unsupported restriction",
			})
		}
		if !ok {
			continue
		}

		for j := range el.Components {
			comp := &el.Components[j]
			switch comp.Type {
			case Energy:
				if cs.energy == nil {
					cs.energy = comp
				}
			case Time:
				if cs.time == nil {
					cs.time = comp
				}
			case ParkingTime:
				if cs.parking == nil {
					cs.parking = comp
				}
			case Flat:
				if cs.flat == nil {
					cs.flat = comp
				}
			}
		}
		if cs.complete() {
			break
		}
	}

	return cs, warns
}

func Calculate(in Input, opts Options) (Report, error) {
	if err := ValidateInput(in); err != nil {
		return Report{}, err
	}

	hasLocalRestrictions := tariffHasLocalRestrictions(in.Tariff)
	loc, zoneWarns, err := resolveZone(in, opts, hasLocalRestrictions)
	if err != nil {
		return Report{}, err
	}

	rep := Report{
		Dimensions: make(map[DimensionType]Dimension),
	}
	rep.Warnings = append(rep.Warnings, zoneWarns...)
	rep.Warnings = append(rep.Warnings, tariffWindowWarnings(in)...)

	var energyPeriods []pricedPeriod
	var timePeriods []pricedPeriod
	var parkingPeriods []pricedPeriod
	var flatComp *PriceComponent
	hasIdleStep := false

	cur := newSnapshot(in.Start, loc)
	for i, period := range in.Periods {
		end := in.End
		if i+1 < len(in.Periods) {
			end = in.Periods[i+1].Start
		}

		startSnap := cur
		cs, warns := activeComponents(in.Tariff, startSnap, period)
		rep.Warnings = append(rep.Warnings, warns...)

		if cs.flat != nil && flatComp == nil {
			flatComp = cs.flat
		}
		if cs.parking != nil && cs.parking.StepSize > 0 {
			hasIdleStep = true
		}

		matchedAny := componentSetHasAny(cs)
		periodHasVolume := false
		if period.Energy != nil {
			periodHasVolume = true
			if cs.energy != nil {
				energyPeriods = append(energyPeriods, pricedPeriod{volume: *period.Energy, comp: cs.energy})
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no ENERGY component for period volume"))
			}
		}
		if period.Time != nil {
			periodHasVolume = true
			if cs.time != nil {
				timePeriods = append(timePeriods, pricedPeriod{volume: *period.Time, comp: cs.time})
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no TIME component for period volume"))
			}
		}
		if period.ParkingTime != nil {
			periodHasVolume = true
			if cs.parking != nil {
				parkingPeriods = append(parkingPeriods, pricedPeriod{volume: *period.ParkingTime, comp: cs.parking})
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no PARKING_TIME component for period volume"))
			}
		}

		if periodHasVolume && !matchedAny {
			rep.Warnings = append(rep.Warnings, noElementWarning("period matched no tariff element"))
		}

		cur = cur.next(period, end)
	}

	rep.TotalEnergyCost, rep.Dimensions[Energy], err = priceSessionDimension(Energy, energyPeriods, decimal.NewFromInt(energyBaseUnitsPerKwh), hasIdleStep)
	if err != nil {
		return Report{}, err
	}
	rep.TotalTimeCost, rep.Dimensions[Time], err = priceSessionDimension(Time, timePeriods, decimal.NewFromInt(timeBaseUnitsPerHour), hasIdleStep)
	if err != nil {
		return Report{}, err
	}
	rep.TotalParkingCost, rep.Dimensions[ParkingTime], err = priceSessionDimension(ParkingTime, parkingPeriods, decimal.NewFromInt(timeBaseUnitsPerHour), hasIdleStep)
	if err != nil {
		return Report{}, err
	}
	rep.TotalFixedCost, rep.Dimensions[Flat] = priceFlatDimension(flatComp)

	preClampBefore := rep.TotalEnergyCost.BeforeTaxes.
		Add(rep.TotalTimeCost.BeforeTaxes).
		Add(rep.TotalParkingCost.BeforeTaxes).
		Add(rep.TotalFixedCost.BeforeTaxes)
	candidateAfter := decimal.Zero
	allDerivable := true
	for _, dim := range []Money{rep.TotalEnergyCost, rep.TotalTimeCost, rep.TotalParkingCost, rep.TotalFixedCost} {
		if dim.BeforeTaxes.IsZero() && dim.AfterTaxes == nil && len(dim.Taxes) == 0 {
			continue
		}
		after, ok := dim.afterTax()
		if !ok {
			allDerivable = false
			continue
		}
		candidateAfter = candidateAfter.Add(after)
	}
	rep.TotalCost.BeforeTaxes = preClampBefore
	// Min/max price clamps intentionally adjust only the total before taxes.
	// Dimension subtotals keep their actual computed costs and are not
	// redistributed, so after a clamp fires they may not sum to TotalCost. This
	// matches the ocpi-tariffs reference, where min_price/max_price clamp the
	// total.
	rep.TotalCost.BeforeTaxes = clampTotalBeforeTaxes(rep.TotalCost.BeforeTaxes, in.Tariff)
	if allDerivable && rep.TotalCost.BeforeTaxes.Equal(preClampBefore) {
		rep.TotalCost.AfterTaxes = &candidateAfter
	}

	if opts.CurrencyPrecision != nil {
		precision := *opts.CurrencyPrecision
		rep.TotalEnergyCost = roundMoney(rep.TotalEnergyCost, precision)
		rep.TotalTimeCost = roundMoney(rep.TotalTimeCost, precision)
		rep.TotalParkingCost = roundMoney(rep.TotalParkingCost, precision)
		rep.TotalFixedCost = roundMoney(rep.TotalFixedCost, precision)
		rep.TotalCost = roundMoney(rep.TotalCost, precision)
		rep.Dimensions[Energy] = Dimension{Volume: rep.Dimensions[Energy].Volume, Cost: rep.TotalEnergyCost}
		rep.Dimensions[Time] = Dimension{Volume: rep.Dimensions[Time].Volume, Cost: rep.TotalTimeCost}
		rep.Dimensions[ParkingTime] = Dimension{Volume: rep.Dimensions[ParkingTime].Volume, Cost: rep.TotalParkingCost}
		rep.Dimensions[Flat] = Dimension{Volume: rep.Dimensions[Flat].Volume, Cost: rep.TotalFixedCost}
	}

	return rep, nil
}

func componentSetHasAny(cs componentSet) bool {
	return cs.energy != nil || cs.time != nil || cs.parking != nil || cs.flat != nil
}

func tariffHasLocalRestrictions(tariff Tariff) bool {
	for i := range tariff.Elements {
		r := tariff.Elements[i].Restrictions
		if r == nil {
			continue
		}
		if r.StartTime != nil || r.EndTime != nil || r.StartDate != nil || r.EndDate != nil || len(r.DayOfWeek) > 0 {
			return true
		}
	}
	return false
}

func tariffWindowWarnings(in Input) []Warning {
	var warns []Warning
	if in.Tariff.StartDateTime != nil && in.Start.Before(*in.Tariff.StartDateTime) {
		warns = append(warns, Warning{
			Code: WarnTariffWindow,
			Kind: KindWarning,
			Msg:  "session starts before tariff validity window",
		})
	}
	if in.Tariff.EndDateTime != nil && in.End.After(*in.Tariff.EndDateTime) {
		warns = append(warns, Warning{
			Code: WarnTariffWindow,
			Kind: KindWarning,
			Msg:  "session ends after tariff validity window",
		})
	}
	return warns
}

func noElementWarning(msg string) Warning {
	return Warning{
		Code: WarnNoElement,
		Kind: KindWarning,
		Msg:  msg,
	}
}

func priceSessionDimension(dim DimensionType, periods []pricedPeriod, baseUnitsPerUnit decimal.Decimal, hasIdleStep bool) (Money, Dimension, error) {
	periods = append([]pricedPeriod(nil), periods...)

	totalBeforeRaw := decimal.Zero
	totalVolume := decimal.Zero
	totalTax := decimal.Zero
	allTaxesKnown := true
	anyTaxesKnown := false
	var firstComp *PriceComponent
	taxesUniform := true

	lastStepIdx := -1
	step := decimal.Zero
	for i := range periods {
		totalVolume = totalVolume.Add(periods[i].volume)
	}
	for i := len(periods) - 1; i >= 0; i-- {
		if periods[i].comp == nil {
			continue
		}
		lastStepIdx = i
		step = decimal.NewFromInt(int64(periods[i].comp.StepSize))
		break
	}

	rawTotalBase := totalVolume.Mul(baseUnitsPerUnit)
	billedTotalBase := rawTotalBase
	var err error
	switch dim {
	case Energy:
		if lastStepIdx >= 0 && !step.IsZero() {
			billedTotalBase, err = stepBill(rawTotalBase, step)
		}
	case Time:
		if !hasIdleStep && lastStepIdx >= 0 {
			billedTotalBase, err = stepBill(rawTotalBase, step)
		}
	case ParkingTime:
		if lastStepIdx >= 0 {
			billedTotalBase, err = stepBill(rawTotalBase, step)
		}
	}
	if err != nil {
		return Money{}, Dimension{}, err
	}

	deltaBase := billedTotalBase.Sub(rawTotalBase)
	if deltaBase.GreaterThan(decimal.Zero) && lastStepIdx >= 0 {
		periods[lastStepIdx].volume = periods[lastStepIdx].volume.Add(deltaBase.Div(baseUnitsPerUnit))
	}

	for _, period := range periods {
		comp := period.comp
		volume := period.volume
		if firstComp == nil {
			firstComp = comp
		} else if !sameTaxes(firstComp.Taxes, comp.Taxes) {
			taxesUniform = false
		}

		subtotalRaw := volume.Mul(comp.Price)
		totalBeforeRaw = totalBeforeRaw.Add(subtotalRaw)
		subtotalBefore := roundOCPI(subtotalRaw)

		after, ok := (Money{BeforeTaxes: subtotalBefore, Taxes: comp.Taxes}).afterTax()
		if ok {
			anyTaxesKnown = true
			totalTax = totalTax.Add(after.Sub(subtotalBefore))
		} else {
			allTaxesKnown = false
		}
	}

	totalBefore := roundOCPI(totalBeforeRaw)
	money := Money{BeforeTaxes: totalBefore}
	if firstComp != nil && taxesUniform {
		money.Taxes = firstComp.Taxes
	}
	if !taxesUniform && anyTaxesKnown && allTaxesKnown {
		money.Taxes = []TaxAmount{{Amount: &totalTax}}
	}

	return money, Dimension{Volume: totalVolume, Cost: money}, nil
}

func sameTaxes(a, b []TaxAmount) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Name != b[i].Name {
			return false
		}
		if !sameDecimalPtr(a[i].Percent, b[i].Percent) {
			return false
		}
		if !sameDecimalPtr(a[i].Amount, b[i].Amount) {
			return false
		}
	}
	return true
}

func sameDecimalPtr(a, b *decimal.Decimal) bool {
	switch {
	case a == nil && b == nil:
		return true
	case a == nil || b == nil:
		return false
	default:
		return a.Equal(*b)
	}
}

func priceFlatDimension(comp *PriceComponent) (Money, Dimension) {
	if comp == nil {
		money := Money{BeforeTaxes: decimal.Zero}
		return money, Dimension{Cost: money}
	}

	money := Money{
		BeforeTaxes: roundOCPI(comp.Price),
		Taxes:       comp.Taxes,
	}

	return money, Dimension{Volume: decimal.NewFromInt(1), Cost: money}
}

func clampTotalBeforeTaxes(total decimal.Decimal, tariff Tariff) decimal.Decimal {
	if tariff.MinPrice != nil && total.LessThan(tariff.MinPrice.BeforeTaxes) {
		return tariff.MinPrice.BeforeTaxes
	}
	if tariff.MaxPrice != nil && total.GreaterThan(tariff.MaxPrice.BeforeTaxes) {
		return tariff.MaxPrice.BeforeTaxes
	}
	return total
}

func roundMoney(m Money, precision int) Money {
	m.BeforeTaxes = roundCurrency(m.BeforeTaxes, precision)
	if m.AfterTaxes != nil {
		after := roundCurrency(*m.AfterTaxes, precision)
		m.AfterTaxes = &after
	}
	taxesCopied := false
	for i := range m.Taxes {
		if m.Taxes[i].Amount == nil {
			continue
		}
		if !taxesCopied {
			m.Taxes = append([]TaxAmount(nil), m.Taxes...)
			taxesCopied = true
		}
		amount := roundCurrency(*m.Taxes[i].Amount, precision)
		m.Taxes[i].Amount = &amount
	}
	return m
}
