package pricing

import (
	"sort"
	"time"

	"github.com/shopspring/decimal"
)

const (
	energyBaseUnitsPerKwh = 1000
	timeBaseUnitsPerHour  = 3600
)

type componentSet struct {
	energy, time, parking, flat *pricedComponent
}

type pricedComponent struct {
	comp         *PriceComponent
	tariffIndex  int
	elementIndex int
}

type pricedPeriod struct {
	volume       decimal.Decimal
	comp         *PriceComponent
	tariffIndex  int
	elementIndex int
}

type pricedFlat struct {
	comp         *PriceComponent
	tariffIndex  int
	elementIndex int
}

type componentKey struct {
	tariffIndex  int
	elementIndex int
}

func (c componentSet) complete() bool {
	return c.energy != nil && c.time != nil && c.parking != nil && c.flat != nil
}

func activeComponents(tariffs []Tariff, tariffIndex int, start snapshot, p Period) (componentSet, []Warning) {
	var cs componentSet
	var warns []Warning
	tariff := tariffs[tariffIndex]

	for i := range tariff.Elements {
		el := &tariff.Elements[i]
		ok, unsupported := matches(el.Restrictions, start, p)
		if unsupported {
			warns = append(warns, Warning{
				Code:        WarnUnsupportedRestriction,
				Kind:        KindWarning,
				Msg:         "element skipped: unsupported restriction",
				TariffIndex: intPtr(tariffIndex),
			})
		}
		if !ok {
			continue
		}

		for j := range el.Components {
			comp := &el.Components[j]
			resolved := pricedComponent{comp: comp, tariffIndex: tariffIndex, elementIndex: i}
			switch comp.Type {
			case Energy:
				if cs.energy == nil {
					cs.energy = &resolved
				}
			case Time:
				if cs.time == nil {
					cs.time = &resolved
				}
			case ParkingTime:
				if cs.parking == nil {
					cs.parking = &resolved
				}
			case Flat:
				if cs.flat == nil {
					cs.flat = &resolved
				}
			}
		}
		if cs.complete() {
			break
		}
	}

	return cs, warns
}

// Calculate prices a version-neutral Input and returns the cost breakdown.
func Calculate(in Input, opts Options) (Report, error) {
	periods := sortedPeriods(in.Periods)
	validated := in
	validated.Periods = periods
	if err := ValidateInput(validated); err != nil {
		return Report{}, err
	}

	hasLocalRestrictions := tariffsHaveLocalRestrictions(in.Tariffs)
	loc, zoneWarns, err := resolveZone(in, opts, hasLocalRestrictions)
	if err != nil {
		return Report{}, err
	}

	rep := Report{
		Dimensions: make(map[DimensionType]Dimension),
	}
	rep.Warnings = append(rep.Warnings, in.Warnings...)
	rep.Warnings = append(rep.Warnings, zoneWarns...)
	if hasPeriodOutsideBounds(periods, in.Start, in.End) {
		rep.Warnings = append(rep.Warnings, Warning{
			Code: WarnPeriodOutsideBounds,
			Kind: KindWarning,
			Msg:  "charging period start is outside CDR bounds",
		})
	}
	usedTariffs := usedTariffIndexes(periods)
	rep.Warnings = append(rep.Warnings, tariffWindowWarnings(in, usedTariffs)...)

	var energyPeriods []pricedPeriod
	var timePeriods []pricedPeriod
	var parkingPeriods []pricedPeriod
	var flatComps []pricedFlat
	seenFlat := make(map[componentKey]struct{})
	hasIdleStep := false

	cur := newSnapshot(in.Start, loc)
	for i, period := range periods {
		end := in.End
		if i+1 < len(periods) {
			end = periods[i+1].Start
		}

		startSnap := cur
		idx := period.TariffIndex
		if idx == nil {
			rep.Warnings = append(rep.Warnings, Warning{
				Code:        WarnPeriodNoTariff,
				Kind:        KindWarning,
				PeriodIndex: intPtr(i),
			})
			cur = cur.next(period, end)
			continue
		}
		usedTariffs[*idx] = struct{}{}
		cs, warns := activeComponents(in.Tariffs, *idx, startSnap, period)
		rep.Warnings = append(rep.Warnings, warns...)

		if cs.flat != nil {
			key := componentKey{tariffIndex: cs.flat.tariffIndex, elementIndex: cs.flat.elementIndex}
			if _, ok := seenFlat[key]; !ok {
				seenFlat[key] = struct{}{}
				flatComps = append(flatComps, pricedFlat{
					comp:         cs.flat.comp,
					tariffIndex:  cs.flat.tariffIndex,
					elementIndex: cs.flat.elementIndex,
				})
			}
		}
		if period.ParkingTime != nil && cs.parking != nil && cs.parking.comp.StepSize > 0 {
			hasIdleStep = true
		}

		matchedAny := componentSetHasAny(cs)
		periodHasVolume := false
		if period.Energy != nil {
			periodHasVolume = true
			if cs.energy != nil {
				energyPeriods = append(energyPeriods, pricedPeriod{
					volume:       *period.Energy,
					comp:         cs.energy.comp,
					tariffIndex:  cs.energy.tariffIndex,
					elementIndex: cs.energy.elementIndex,
				})
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no ENERGY component for period volume"))
			}
		}
		if period.Time != nil {
			periodHasVolume = true
			if cs.time != nil {
				timePeriods = append(timePeriods, pricedPeriod{
					volume:       *period.Time,
					comp:         cs.time.comp,
					tariffIndex:  cs.time.tariffIndex,
					elementIndex: cs.time.elementIndex,
				})
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no TIME component for period volume"))
			}
		}
		if period.ParkingTime != nil {
			periodHasVolume = true
			if cs.parking != nil {
				parkingPeriods = append(parkingPeriods, pricedPeriod{
					volume:       *period.ParkingTime,
					comp:         cs.parking.comp,
					tariffIndex:  cs.parking.tariffIndex,
					elementIndex: cs.parking.elementIndex,
				})
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no PARKING_TIME component for period volume"))
			}
		}

		if periodHasVolume && !matchedAny {
			rep.Warnings = append(rep.Warnings, noElementWarning("period matched no tariff element"))
		}

		cur = cur.next(period, end)
	}

	for _, mw := range []struct {
		dim     DimensionType
		periods []pricedPeriod
	}{
		{Energy, energyPeriods},
		{Time, timePeriods},
		{ParkingTime, parkingPeriods},
	} {
		if w, ok := mixedStepWarning(mw.dim, mw.periods); ok {
			rep.Warnings = append(rep.Warnings, w)
		}
	}

	for idx := range in.Tariffs {
		if _, used := usedTariffs[idx]; !used {
			rep.Warnings = append(rep.Warnings, Warning{
				Code:        WarnUnusedTariff,
				Kind:        KindWarning,
				TariffIndex: intPtr(idx),
				Msg:         "embedded tariff was not used by any priced charging period",
			})
		}
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
	rep.TotalFixedCost, rep.Dimensions[Flat] = priceFlatDimension(flatComps)

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
	// Min/max price clamps intentionally adjust only the total Money. Dimension
	// subtotals keep their actual computed costs and are not redistributed, so
	// after a clamp fires they may not sum to TotalCost. This matches the
	// ocpi-tariffs reference, where min_price/max_price clamp the total.
	usedTariffIndex, hasSingleUsedTariff := singleUsedTariffIndex(usedTariffs)
	if hasSingleUsedTariff {
		tariff := in.Tariffs[usedTariffIndex]
		switch {
		case tariff.MinPrice != nil && preClampBefore.LessThan(tariff.MinPrice.BeforeTaxes):
			rep.TotalCost = *tariff.MinPrice
		case tariff.MaxPrice != nil && preClampBefore.GreaterThan(tariff.MaxPrice.BeforeTaxes):
			rep.TotalCost = *tariff.MaxPrice
		default:
			rep.TotalCost.BeforeTaxes = preClampBefore
			if allDerivable {
				rep.TotalCost.AfterTaxes = &candidateAfter
			}
		}
	} else {
		rep.TotalCost.BeforeTaxes = preClampBefore
		if allDerivable {
			rep.TotalCost.AfterTaxes = &candidateAfter
		}
		if len(usedTariffs) > 1 && usedTariffsHaveMinMax(in.Tariffs, usedTariffs) {
			rep.Warnings = append(rep.Warnings, Warning{
				Code: WarnMinMaxUndefinedMultiTariff,
				Kind: KindWarning,
				Msg:  "min_price/max_price not applied because multiple tariffs priced the session",
			})
		}
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

func sortedPeriods(periods []Period) []Period {
	sorted := append([]Period(nil), periods...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Start.Before(sorted[j].Start)
	})
	return sorted
}

func hasPeriodOutsideBounds(periods []Period, start, end time.Time) bool {
	for i := range periods {
		if periods[i].Start.Before(start) || periods[i].Start.After(end) {
			return true
		}
	}
	return false
}

func componentSetHasAny(cs componentSet) bool {
	return cs.energy != nil || cs.time != nil || cs.parking != nil || cs.flat != nil
}

func usedTariffIndexes(periods []Period) map[int]struct{} {
	used := make(map[int]struct{})
	for i := range periods {
		if periods[i].TariffIndex != nil {
			used[*periods[i].TariffIndex] = struct{}{}
		}
	}
	return used
}

func tariffsHaveLocalRestrictions(tariffs []Tariff) bool {
	for i := range tariffs {
		for j := range tariffs[i].Elements {
			r := tariffs[i].Elements[j].Restrictions
			if r == nil {
				continue
			}
			if r.StartTime != nil || r.EndTime != nil || r.StartDate != nil || r.EndDate != nil || len(r.DayOfWeek) > 0 {
				return true
			}
		}
	}
	return false
}

func tariffWindowWarnings(in Input, usedTariffs map[int]struct{}) []Warning {
	var warns []Warning
	for i := range in.Tariffs {
		if _, used := usedTariffs[i]; !used {
			continue
		}
		tariff := in.Tariffs[i]
		if tariff.StartDateTime != nil && in.Start.Before(*tariff.StartDateTime) {
			warns = append(warns, Warning{
				Code:        WarnTariffWindow,
				Kind:        KindWarning,
				Msg:         "session starts before tariff validity window",
				TariffIndex: intPtr(i),
			})
		}
		if tariff.EndDateTime != nil && in.End.After(*tariff.EndDateTime) {
			warns = append(warns, Warning{
				Code:        WarnTariffWindow,
				Kind:        KindWarning,
				Msg:         "session ends after tariff validity window",
				TariffIndex: intPtr(i),
			})
		}
	}
	return warns
}

func singleUsedTariffIndex(used map[int]struct{}) (int, bool) {
	if len(used) != 1 {
		return 0, false
	}
	for idx := range used {
		return idx, true
	}
	return 0, false
}

// usedTariffsHaveMinMax reports whether any of the used tariffs defines a
// min_price or max_price clamp.
func usedTariffsHaveMinMax(tariffs []Tariff, used map[int]struct{}) bool {
	for idx := range used {
		if tariffs[idx].MinPrice != nil || tariffs[idx].MaxPrice != nil {
			return true
		}
	}
	return false
}

// mixedStepWarning returns a WarnMixedStepSize warning when the contributing
// periods for a dimension reference price components with differing step_size
// values. The step is still applied once per session at the last priced period.
func mixedStepWarning(dim DimensionType, periods []pricedPeriod) (Warning, bool) {
	seen := false
	var firstStep int
	for i := range periods {
		if periods[i].comp == nil {
			continue
		}
		step := periods[i].comp.StepSize
		if !seen {
			seen = true
			firstStep = step
			continue
		}
		if step != firstStep {
			return Warning{
				Code:      WarnMixedStepSize,
				Kind:      KindWarning,
				Dimension: dim,
				Msg:       "price components for this dimension used different step_size values; step is applied once per session at the last priced period",
			}, true
		}
	}
	return Warning{}, false
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

func priceFlatDimension(comps []pricedFlat) (Money, Dimension) {
	if len(comps) == 0 {
		money := Money{BeforeTaxes: decimal.Zero}
		return money, Dimension{Cost: money}
	}

	totalBeforeRaw := decimal.Zero
	totalTax := decimal.Zero
	allTaxesKnown := true
	anyTaxesKnown := false
	var firstComp *PriceComponent
	taxesUniform := true

	for _, flat := range comps {
		comp := flat.comp
		if firstComp == nil {
			firstComp = comp
		} else if !sameTaxes(firstComp.Taxes, comp.Taxes) {
			taxesUniform = false
		}

		totalBeforeRaw = totalBeforeRaw.Add(comp.Price)
		subtotalBefore := roundOCPI(comp.Price)
		after, ok := (Money{BeforeTaxes: subtotalBefore, Taxes: comp.Taxes}).afterTax()
		if ok {
			anyTaxesKnown = true
			totalTax = totalTax.Add(after.Sub(subtotalBefore))
		} else {
			allTaxesKnown = false
		}
	}

	money := Money{
		BeforeTaxes: roundOCPI(totalBeforeRaw),
	}
	if firstComp != nil && taxesUniform {
		money.Taxes = firstComp.Taxes
	}
	if !taxesUniform && anyTaxesKnown && allTaxesKnown {
		money.Taxes = []TaxAmount{{Amount: &totalTax}}
	}

	return money, Dimension{Volume: decimal.NewFromInt(int64(len(comps))), Cost: money}
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
