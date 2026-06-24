package pricing

import (
	"time"

	"github.com/shopspring/decimal"
)

const (
	energyBaseUnitsPerKwh = 1000
	timeBaseUnitsPerHour  = 3600
)

type componentSet struct {
	energy, time, parking, flat *PriceComponent
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

func ValidateInput(in Input) error {
	return nil
}

func currencyScale(code string) int {
	return 2
}

func Calculate(in Input, opts Options) (Report, error) {
	if err := ValidateInput(in); err != nil {
		return Report{}, err
	}

	loc := opts.TimeZone
	if loc == nil {
		loc = time.UTC
	}

	precision := currencyScale(in.Currency)
	if opts.CurrencyPrecision != nil {
		precision = *opts.CurrencyPrecision
	}

	rep := Report{
		Dimensions: make(map[DimensionType]Dimension),
	}
	rep.Warnings = append(rep.Warnings, tariffWindowWarnings(in)...)

	// Pools are keyed by PriceComponent pointer identity into in.Tariff.Elements'
	// backing array. Calculate never mutates in, so that identity is stable for
	// the call; reconstructing or copying tariff components per period would
	// silently break session-wide step pooling.
	energyPools := make(map[*PriceComponent]decimal.Decimal)
	timePools := make(map[*PriceComponent]decimal.Decimal)
	parkingPools := make(map[*PriceComponent]decimal.Decimal)
	var flatComp *PriceComponent

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

		matchedAny := componentSetHasAny(cs)
		periodHasVolume := false
		if period.Energy != nil {
			periodHasVolume = true
			if cs.energy != nil {
				addPool(energyPools, cs.energy, *period.Energy)
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no ENERGY component for period volume"))
			}
		}
		if period.Time != nil {
			periodHasVolume = true
			if cs.time != nil {
				addPool(timePools, cs.time, *period.Time)
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no TIME component for period volume"))
			}
		}
		if period.ParkingTime != nil {
			periodHasVolume = true
			if cs.parking != nil {
				addPool(parkingPools, cs.parking, *period.ParkingTime)
			} else if matchedAny {
				rep.Warnings = append(rep.Warnings, noElementWarning("no PARKING_TIME component for period volume"))
			}
		}

		if periodHasVolume && !matchedAny {
			rep.Warnings = append(rep.Warnings, noElementWarning("period matched no tariff element"))
		}

		cur = cur.next(period, end)
	}

	var err error
	rep.TotalEnergyCost, rep.Dimensions[Energy], err = pricePooledDimension(energyPools, decimal.NewFromInt(energyBaseUnitsPerKwh))
	if err != nil {
		return Report{}, err
	}
	rep.TotalTimeCost, rep.Dimensions[Time], err = pricePooledDimension(timePools, decimal.NewFromInt(timeBaseUnitsPerHour))
	if err != nil {
		return Report{}, err
	}
	rep.TotalParkingCost, rep.Dimensions[ParkingTime], err = pricePooledDimension(parkingPools, decimal.NewFromInt(timeBaseUnitsPerHour))
	if err != nil {
		return Report{}, err
	}
	rep.TotalFixedCost, rep.Dimensions[Flat] = priceFlatDimension(flatComp)

	rep.TotalCost.BeforeTaxes = rep.TotalEnergyCost.BeforeTaxes.
		Add(rep.TotalTimeCost.BeforeTaxes).
		Add(rep.TotalParkingCost.BeforeTaxes).
		Add(rep.TotalFixedCost.BeforeTaxes)
	// Min/max price clamps intentionally adjust only the total before taxes.
	// Dimension subtotals keep their actual computed costs and are not
	// redistributed, so after a clamp fires they may not sum to TotalCost. This
	// matches the ocpi-tariffs reference, where min_price/max_price clamp the
	// total.
	rep.TotalCost.BeforeTaxes = clampTotalBeforeTaxes(rep.TotalCost.BeforeTaxes, in.Tariff)

	rep.TotalEnergyCost = roundMoney(rep.TotalEnergyCost, precision)
	rep.TotalTimeCost = roundMoney(rep.TotalTimeCost, precision)
	rep.TotalParkingCost = roundMoney(rep.TotalParkingCost, precision)
	rep.TotalFixedCost = roundMoney(rep.TotalFixedCost, precision)
	rep.TotalCost = roundMoney(rep.TotalCost, precision)
	rep.Dimensions[Energy] = Dimension{Volume: rep.Dimensions[Energy].Volume, Cost: rep.TotalEnergyCost}
	rep.Dimensions[Time] = Dimension{Volume: rep.Dimensions[Time].Volume, Cost: rep.TotalTimeCost}
	rep.Dimensions[ParkingTime] = Dimension{Volume: rep.Dimensions[ParkingTime].Volume, Cost: rep.TotalParkingCost}
	rep.Dimensions[Flat] = Dimension{Volume: rep.Dimensions[Flat].Volume, Cost: rep.TotalFixedCost}

	return rep, nil
}

func addPool(pools map[*PriceComponent]decimal.Decimal, comp *PriceComponent, volume decimal.Decimal) {
	pools[comp] = pools[comp].Add(volume)
}

func componentSetHasAny(cs componentSet) bool {
	return cs.energy != nil || cs.time != nil || cs.parking != nil || cs.flat != nil
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

func pricePooledDimension(pools map[*PriceComponent]decimal.Decimal, baseUnitsPerUnit decimal.Decimal) (Money, Dimension, error) {
	totalBefore := decimal.Zero
	totalVolume := decimal.Zero
	totalTax := decimal.Zero
	allTaxesKnown := true
	anyTaxesKnown := false
	var firstComp *PriceComponent
	componentCount := 0

	for comp, volume := range pools {
		if firstComp == nil {
			firstComp = comp
		}
		componentCount++
		totalVolume = totalVolume.Add(volume)

		baseVol := volume.Mul(baseUnitsPerUnit)
		billed, err := stepBill(baseVol, decimal.NewFromInt(int64(comp.StepSize)))
		if err != nil {
			return Money{}, Dimension{}, err
		}
		costVol := billed.Div(baseUnitsPerUnit)
		subtotalBefore := roundOCPI(costVol.Mul(comp.Price))
		totalBefore = totalBefore.Add(subtotalBefore)

		after, ok := (Money{BeforeTaxes: subtotalBefore, Taxes: comp.Taxes}).afterTax()
		if ok {
			anyTaxesKnown = true
			totalTax = totalTax.Add(after.Sub(subtotalBefore))
		} else {
			allTaxesKnown = false
		}
	}

	money := Money{BeforeTaxes: totalBefore}
	if componentCount == 1 {
		money.Taxes = firstComp.Taxes
	}
	if componentCount != 1 && anyTaxesKnown && allTaxesKnown {
		money.Taxes = []TaxAmount{{Amount: &totalTax}}
	}

	return money, Dimension{Volume: totalVolume, Cost: money}, nil
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
