package main

import (
	"github.com/shopspring/decimal"

	pricing "github.com/shiv3/gocpi/core/pricing"
)

type response struct {
	OK      bool        `json:"ok"`
	Error   *string     `json:"error"`
	Report  *reportDTO  `json:"report,omitempty"`
	Verdict *verdictDTO `json:"verdict,omitempty"`
}

type moneyDTO struct {
	BeforeTaxes string   `json:"beforeTaxes"`
	AfterTaxes  *string  `json:"afterTaxes"`
	Taxes       []taxDTO `json:"taxes"`
}
type taxDTO struct {
	Name    *string `json:"name"`
	Percent *string `json:"percent"`
	Amount  *string `json:"amount"`
}
type dimensionDTO struct {
	Volume string   `json:"volume"`
	Cost   moneyDTO `json:"cost"`
}
type warningDTO struct {
	Code        string  `json:"code"`
	Kind        string  `json:"kind"`
	Message     string  `json:"message"`
	PeriodIndex *int    `json:"periodIndex"`
	TariffIndex *int    `json:"tariffIndex"`
	Dimension   *string `json:"dimension"`
}
type reportDTO struct {
	Currency             string                  `json:"currency"`
	TotalCost            moneyDTO                `json:"totalCost"`
	TotalEnergyCost      moneyDTO                `json:"totalEnergyCost"`
	TotalTimeCost        moneyDTO                `json:"totalTimeCost"`
	TotalParkingCost     moneyDTO                `json:"totalParkingCost"`
	TotalFixedCost       moneyDTO                `json:"totalFixedCost"`
	TotalReservationCost *moneyDTO               `json:"totalReservationCost"`
	Dimensions           map[string]dimensionDTO `json:"dimensions"`
	Warnings             []warningDTO            `json:"warnings"`
}
type mismatchDTO struct {
	Field    string `json:"field"`
	Computed string `json:"computed"`
	Embedded string `json:"embedded"`
	Delta    string `json:"delta"`
}
type verdictDTO struct {
	Status     string        `json:"status"`
	Mismatches []mismatchDTO `json:"mismatches"`
	Warnings   []warningDTO  `json:"warnings"`
}

func strptr(s string) *string { return &s }

func decimalString(d decimal.Decimal) string {
	if d.Exponent() < 0 {
		return d.StringFixed(-d.Exponent())
	}
	return d.String()
}

// afterTaxString replicates pricing.Money.afterTax()/sumTaxes (core/pricing/money.go).
func afterTaxString(m pricing.Money) *string {
	if m.AfterTaxes != nil {
		return strptr(decimalString(*m.AfterTaxes))
	}
	if len(m.Taxes) == 0 {
		return nil
	}
	total := decimal.Zero
	for _, t := range m.Taxes {
		switch {
		case t.Amount != nil:
			total = total.Add(*t.Amount)
		case t.Percent != nil:
			total = total.Add(m.BeforeTaxes.Mul(*t.Percent).Div(decimal.NewFromInt(100)))
		default:
			return nil
		}
	}
	return strptr(m.BeforeTaxes.Add(total).String())
}

func money(m pricing.Money) moneyDTO {
	out := moneyDTO{BeforeTaxes: decimalString(m.BeforeTaxes), AfterTaxes: afterTaxString(m), Taxes: []taxDTO{}}
	for _, t := range m.Taxes {
		td := taxDTO{}
		if t.Name != "" {
			td.Name = strptr(t.Name)
		}
		if t.Percent != nil {
			td.Percent = strptr(decimalString(*t.Percent))
		}
		if t.Amount != nil {
			td.Amount = strptr(decimalString(*t.Amount))
		}
		out.Taxes = append(out.Taxes, td)
	}
	return out
}

func statusString(s pricing.Status) string {
	switch s {
	case pricing.StatusOK:
		return "OK"
	case pricing.StatusMismatch:
		return "Mismatch"
	case pricing.StatusNotVerifiable:
		return "NotVerifiable"
	case pricing.StatusInvalidInput:
		return "InvalidInput"
	default:
		return "Unknown"
	}
}

func warningKindString(k pricing.WarningKind) string {
	switch k {
	case pricing.KindWarning:
		return "warning"
	case pricing.KindDiagnostic:
		return "diagnostic"
	default:
		return "warning"
	}
}

func warningCodeString(c pricing.WarningCode) string {
	switch c {
	case pricing.WarnUnsupportedRestriction:
		return "WarnUnsupportedRestriction"
	case pricing.WarnTZInferred:
		return "WarnTZInferred"
	case pricing.WarnTZUTC:
		return "WarnTZUTC"
	case pricing.WarnNoElement:
		return "WarnNoElement"
	case pricing.WarnReservationNotComputed:
		return "WarnReservationNotComputed"
	case pricing.WarnBoundaryCross:
		return "WarnBoundaryCross"
	case pricing.WarnTariffWindow:
		return "WarnTariffWindow"
	case pricing.WarnPeriodOutsideBounds:
		return "WarnPeriodOutsideBounds"
	case pricing.WarnUnknownDimension:
		return "WarnUnknownDimension"
	case pricing.WarnPeriodNoTariff:
		return "WarnPeriodNoTariff"
	case pricing.WarnMinMaxUndefinedMultiTariff:
		return "WarnMinMaxUndefinedMultiTariff"
	case pricing.WarnMixedStepSize:
		return "WarnMixedStepSize"
	case pricing.WarnUnusedTariff:
		return "WarnUnusedTariff"
	case pricing.WarnAfterTaxNotDerivable:
		return "WarnAfterTaxNotDerivable"
	default:
		return "Warn(" + decimal.NewFromInt(int64(c)).String() + ")"
	}
}

func warnings(ws []pricing.Warning) []warningDTO {
	out := []warningDTO{}
	for _, w := range ws {
		wd := warningDTO{Code: warningCodeString(w.Code), Kind: warningKindString(w.Kind), Message: w.Msg, PeriodIndex: w.PeriodIndex, TariffIndex: w.TariffIndex}
		if w.Dimension != pricing.DimensionUnspecified {
			wd.Dimension = strptr(w.Dimension.String())
		}
		out = append(out, wd)
	}
	return out
}

func toCalculateResponse(rep pricing.Report, currency string) response {
	r := &reportDTO{
		Currency:         currency,
		TotalCost:        money(rep.TotalCost),
		TotalEnergyCost:  money(rep.TotalEnergyCost),
		TotalTimeCost:    money(rep.TotalTimeCost),
		TotalParkingCost: money(rep.TotalParkingCost),
		TotalFixedCost:   money(rep.TotalFixedCost),
		Dimensions:       map[string]dimensionDTO{},
		Warnings:         warnings(rep.Warnings),
	}
	if rep.TotalReservationCost != nil {
		m := money(*rep.TotalReservationCost)
		r.TotalReservationCost = &m
	}
	for dim, d := range rep.Dimensions {
		r.Dimensions[dim.String()] = dimensionDTO{Volume: decimalString(d.Volume), Cost: money(d.Cost)}
	}
	return response{OK: true, Report: r}
}

func toVerifyResponse(v pricing.Verdict) response {
	vd := &verdictDTO{Status: statusString(v.Status), Mismatches: []mismatchDTO{}, Warnings: warnings(v.Warnings)}
	for _, m := range v.Mismatches {
		vd.Mismatches = append(vd.Mismatches, mismatchDTO{Field: m.Field, Computed: decimalString(m.Computed), Embedded: decimalString(m.Embedded), Delta: decimalString(m.Delta)})
	}
	return response{OK: true, Verdict: vd}
}

func errorResponse(err error) response {
	return response{OK: false, Error: strptr(err.Error())}
}
