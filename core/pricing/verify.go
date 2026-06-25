package pricing

import "github.com/shopspring/decimal"

// Verify compares a pricing Report with the embedded totals from its Input.
func Verify(in Input, rep Report, opts Options) Verdict {
	v := Verdict{
		Status:     StatusOK,
		Mismatches: []Mismatch{},
		Warnings:   append([]Warning(nil), rep.Warnings...),
	}
	tolerance := opts.Tolerance
	notVerifiable := false

	addMismatch := func(field string, computed, embedded decimal.Decimal) {
		delta := computed.Sub(embedded)
		if !delta.Abs().GreaterThan(tolerance) {
			return
		}
		v.Mismatches = append(v.Mismatches, Mismatch{
			Field:    field,
			Computed: computed,
			Embedded: embedded,
			Delta:    delta,
		})
	}

	addNotVerifiable := func(w Warning) {
		v.Warnings = append(v.Warnings, w)
		notVerifiable = true
	}

	compareMoney := func(field string, computed Money, embedded *Money) {
		if embedded == nil {
			return
		}

		addMismatch(field, computed.BeforeTaxes, embedded.BeforeTaxes)

		computedAfter, computedOK := computed.afterTax()
		if !computedOK {
			return
		}
		embeddedAfter, embeddedOK := embedded.afterTax()
		if !embeddedOK {
			addNotVerifiable(Warning{
				Code: WarnAfterTaxNotDerivable,
				Kind: KindWarning,
				Msg:  field + " after-tax total is not derivable from embedded data",
			})
			return
		}

		addMismatch(field+".after_taxes", computedAfter, embeddedAfter)
	}

	// A multi-tariff session leaves min_price/max_price undefined, so the engine
	// reports the unclamped total. The embedded total_cost may legitimately
	// differ (the CSO may have clamped), so it cannot be verified.
	multiTariffMinMax := false
	for i := range rep.Warnings {
		if rep.Warnings[i].Code == WarnMinMaxUndefinedMultiTariff {
			multiTariffMinMax = true
			break
		}
	}
	if multiTariffMinMax && in.Embedded.TotalCost != nil {
		notVerifiable = true
	} else {
		compareMoney("total_cost", rep.TotalCost, in.Embedded.TotalCost)
	}
	compareMoney("total_energy_cost", rep.TotalEnergyCost, in.Embedded.TotalEnergyCost)
	compareMoney("total_time_cost", rep.TotalTimeCost, in.Embedded.TotalTimeCost)
	compareMoney("total_parking_cost", rep.TotalParkingCost, in.Embedded.TotalParkingCost)
	compareMoney("total_fixed_cost", rep.TotalFixedCost, in.Embedded.TotalFixedCost)

	if in.Embedded.TotalReservationCost != nil && !in.Embedded.TotalReservationCost.BeforeTaxes.IsZero() {
		if rep.TotalReservationCost == nil {
			addNotVerifiable(Warning{
				Code: WarnReservationNotComputed,
				Kind: KindWarning,
				Msg:  "embedded total_reservation_cost is present but reservation cost was not computed",
			})
		} else {
			compareMoney("total_reservation_cost", *rep.TotalReservationCost, in.Embedded.TotalReservationCost)
		}
	}

	totalEnergy := decimal.Zero
	totalTime := decimal.Zero
	for _, period := range in.Periods {
		if period.Energy != nil {
			totalEnergy = totalEnergy.Add(*period.Energy)
		}
		if period.Time != nil {
			totalTime = totalTime.Add(*period.Time)
		}
	}

	if in.Embedded.TotalEnergy != nil {
		addMismatch("total_energy", totalEnergy, *in.Embedded.TotalEnergy)
	}
	if in.Embedded.TotalTime != nil {
		addMismatch("total_time", totalTime, *in.Embedded.TotalTime)
	}

	switch {
	case len(v.Mismatches) > 0:
		v.Status = StatusMismatch
	case notVerifiable:
		v.Status = StatusNotVerifiable
	default:
		v.Status = StatusOK
	}

	return v
}
