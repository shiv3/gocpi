package pricing

import (
	"fmt"

	"github.com/shopspring/decimal"
)

func ValidateInput(in Input) error {
	if len(in.Tariff.Elements) == 0 {
		return invalidInput("tariff must contain at least one element")
	}
	if in.Currency != in.Tariff.Currency {
		return invalidInput("currency mismatch: input %q, tariff %q", in.Currency, in.Tariff.Currency)
	}

	for i := range in.Tariff.Elements {
		el := &in.Tariff.Elements[i]
		for j := range el.Components {
			if el.Components[j].StepSize <= 0 {
				return invalidInput("tariff element %d price component %d has non-positive step_size %d", i, j, el.Components[j].StepSize)
			}
		}
		if err := validateRestrictionStrings(el.Restrictions); err != nil {
			return err
		}
	}

	for i := range in.Periods {
		if i > 0 && in.Periods[i].Start.Before(in.Periods[i-1].Start) {
			return invalidInput("charging periods are not sorted by start time")
		}
		if in.Periods[i].Energy != nil && in.Periods[i].Energy.LessThan(decimal.Zero) {
			return invalidInput("charging period %d has negative energy", i)
		}
	}

	return nil
}

func invalidInput(format string, args ...any) *PricingError {
	return &PricingError{Code: InvalidInput, Msg: fmt.Sprintf(format, args...)}
}
