package pricing

import (
	"fmt"

	"github.com/shopspring/decimal"
)

// ValidateInput checks whether a version-neutral Input can be priced.
func ValidateInput(in Input) error {
	if len(in.Tariffs) == 0 {
		return invalidInput("input must contain at least one tariff")
	}
	for tariffIndex := range in.Tariffs {
		tariff := &in.Tariffs[tariffIndex]
		if len(tariff.Elements) == 0 {
			return invalidInput("tariff %d must contain at least one element", tariffIndex)
		}
		if in.Currency != tariff.Currency {
			return invalidInput("currency mismatch: input %q, tariff %d %q", in.Currency, tariffIndex, tariff.Currency)
		}

		for i := range tariff.Elements {
			el := &tariff.Elements[i]
			for j := range el.Components {
				if el.Components[j].Type == Energy && el.Components[j].StepSize < 0 {
					return invalidInput("tariff %d element %d price component %d has negative step_size %d", tariffIndex, i, j, el.Components[j].StepSize)
				}
				if (el.Components[j].Type == Time || el.Components[j].Type == ParkingTime) && el.Components[j].StepSize <= 0 {
					return invalidInput("tariff %d element %d price component %d has non-positive step_size %d", tariffIndex, i, j, el.Components[j].StepSize)
				}
			}
			if err := validateRestrictionStrings(el.Restrictions); err != nil {
				return err
			}
		}
	}

	for i := range in.Periods {
		if in.Periods[i].TariffIndex != nil {
			idx := *in.Periods[i].TariffIndex
			if idx < 0 || idx >= len(in.Tariffs) {
				return invalidInput("charging period %d has tariff index %d out of range", i, idx)
			}
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
