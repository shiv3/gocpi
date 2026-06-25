package main

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pricing "github.com/shiv3/gocpi/core/pricing"
)

func d(s string) decimal.Decimal { return decimal.RequireFromString(s) }
func dp(s string) *decimal.Decimal {
	v := d(s)
	return &v
}

func TestMoney_AfterTax_Set(t *testing.T) {
	m := money(pricing.Money{BeforeTaxes: d("3.00"), AfterTaxes: dp("3.63")})
	require.NotNil(t, m.AfterTaxes)
	assert.Equal(t, "3.63", *m.AfterTaxes)
	assert.Equal(t, "3.00", m.BeforeTaxes)
}

func TestMoney_AfterTax_DerivedFromPercent(t *testing.T) {
	m := money(pricing.Money{BeforeTaxes: d("3.00"), Taxes: []pricing.TaxAmount{{Percent: dp("21")}}})
	require.NotNil(t, m.AfterTaxes)
	assert.Equal(t, "3.63", *m.AfterTaxes) // 3.00 + 3.00*21/100
}

func TestMoney_AfterTax_DerivedFromAmount(t *testing.T) {
	m := money(pricing.Money{BeforeTaxes: d("3.00"), Taxes: []pricing.TaxAmount{{Amount: dp("0.63")}}})
	require.NotNil(t, m.AfterTaxes)
	assert.Equal(t, "3.63", *m.AfterTaxes)
}

func TestMoney_AfterTax_Underivable(t *testing.T) {
	// no taxes => null
	assert.Nil(t, money(pricing.Money{BeforeTaxes: d("3.00")}).AfterTaxes)
	// a tax with neither amount nor percent => null
	assert.Nil(t, money(pricing.Money{BeforeTaxes: d("3.00"), Taxes: []pricing.TaxAmount{{Name: "x"}}}).AfterTaxes)
}

func TestEnumStrings(t *testing.T) {
	assert.Equal(t, "OK", statusString(pricing.StatusOK))
	assert.Equal(t, "Mismatch", statusString(pricing.StatusMismatch))
	assert.Equal(t, "NotVerifiable", statusString(pricing.StatusNotVerifiable))
	assert.Equal(t, "warning", warningKindString(pricing.KindWarning))
	assert.Equal(t, "diagnostic", warningKindString(pricing.KindDiagnostic))
}

func TestWarningCodeString_AllCodes(t *testing.T) {
	cases := []struct {
		code pricing.WarningCode
		want string
	}{
		{pricing.WarnUnsupportedRestriction, "WarnUnsupportedRestriction"},
		{pricing.WarnTZInferred, "WarnTZInferred"},
		{pricing.WarnTZUTC, "WarnTZUTC"},
		{pricing.WarnNoElement, "WarnNoElement"},
		{pricing.WarnReservationNotComputed, "WarnReservationNotComputed"},
		{pricing.WarnBoundaryCross, "WarnBoundaryCross"},
		{pricing.WarnTariffWindow, "WarnTariffWindow"},
		{pricing.WarnPeriodOutsideBounds, "WarnPeriodOutsideBounds"},
		{pricing.WarnUnknownDimension, "WarnUnknownDimension"},
		{pricing.WarnPeriodNoTariff, "WarnPeriodNoTariff"},
		{pricing.WarnMinMaxUndefinedMultiTariff, "WarnMinMaxUndefinedMultiTariff"},
		{pricing.WarnMixedStepSize, "WarnMixedStepSize"},
		{pricing.WarnUnusedTariff, "WarnUnusedTariff"},
		{pricing.WarnAfterTaxNotDerivable, "WarnAfterTaxNotDerivable"},
	}

	require.Len(t, cases, int(pricing.WarnAfterTaxNotDerivable)+1)
	for i, tc := range cases {
		assert.Equal(t, pricing.WarningCode(i), tc.code)
		assert.Equal(t, tc.want, warningCodeString(tc.code))
	}
}

func TestVerifyDTO_AfterTaxNotDerivableWarningCode(t *testing.T) {
	v := pricing.Verdict{
		Status: pricing.StatusNotVerifiable,
		Warnings: []pricing.Warning{{
			Code: pricing.WarnAfterTaxNotDerivable,
			Kind: pricing.KindWarning,
			Msg:  "total_cost after-tax total is not derivable from embedded data",
		}},
	}

	resp := toVerifyResponse(v)
	require.True(t, resp.OK)
	require.NotNil(t, resp.Verdict)
	require.Len(t, resp.Verdict.Warnings, 1)
	assert.Equal(t, "WarnAfterTaxNotDerivable", resp.Verdict.Warnings[0].Code)
	assert.NotEqual(t, "WarnUnsupportedRestriction", resp.Verdict.Warnings[0].Code)
}

func TestReportDTO_AllFourDimensionsAndReservationNil(t *testing.T) {
	rep := pricing.Report{
		TotalCost:       pricing.Money{BeforeTaxes: d("3.00")},
		TotalEnergyCost: pricing.Money{BeforeTaxes: d("3.00")},
		Dimensions: map[pricing.DimensionType]pricing.Dimension{
			pricing.Energy: {Volume: d("10"), Cost: pricing.Money{BeforeTaxes: d("3.00")}},
		},
	}
	resp := toCalculateResponse(rep, "EUR")
	require.True(t, resp.OK)
	require.NotNil(t, resp.Report)
	assert.Equal(t, "EUR", resp.Report.Currency)
	assert.Nil(t, resp.Report.TotalReservationCost) // nil when not computed
	assert.Equal(t, "10", resp.Report.Dimensions["ENERGY"].Volume)
}

func TestVerifyDTO_StatusAndMismatch(t *testing.T) {
	v := pricing.Verdict{Status: pricing.StatusMismatch, Mismatches: []pricing.Mismatch{{Field: "total_cost", Computed: d("0.80"), Embedded: d("5.00"), Delta: d("-4.20")}}}
	resp := toVerifyResponse(v)
	require.True(t, resp.OK)
	require.NotNil(t, resp.Verdict)
	assert.Equal(t, "Mismatch", resp.Verdict.Status)
	require.Len(t, resp.Verdict.Mismatches, 1)
	assert.Equal(t, "-4.20", resp.Verdict.Mismatches[0].Delta)
}

func TestErrorResponse(t *testing.T) {
	resp := errorResponse(assertErr("duplicate embedded tariff id"))
	assert.False(t, resp.OK)
	require.NotNil(t, resp.Error)
	assert.Contains(t, *resp.Error, "duplicate embedded tariff id")
}

type strErr string

func (e strErr) Error() string { return string(e) }
func assertErr(s string) error { return strErr(s) }
