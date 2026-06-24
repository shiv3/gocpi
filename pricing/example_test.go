package pricing_test

import (
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	"github.com/shiv3/gocpi/pricing"
	"github.com/shiv3/gocpi/v221"
)

func Example_calculateV221() {
	d := decimal.RequireFromString
	start := time.Date(2026, 6, 24, 9, 0, 0, 0, time.UTC)
	currencyPrecision := 2

	tariff := v221.Tariff{
		Currency: "EUR",
		Elements: []v221.TariffElement{{
			PriceComponents: []v221.PriceComponent{{
				Type:     v221.TariffDimensionTypeEnergy,
				Price:    d("0.30"),
				StepSize: 1,
			}},
		}},
		LastUpdated: start,
	}

	cdr := v221.CDR{
		CountryCode:   "NL",
		Currency:      "EUR",
		StartDateTime: start,
		EndDateTime:   start.Add(time.Hour),
		ChargingPeriods: []v221.ChargingPeriod{{
			StartDateTime: start,
			Dimensions: []v221.CdrDimension{{
				Type:   v221.CdrDimensionTypeEnergy,
				Volume: d("10"),
			}},
		}},
		TotalEnergy: d("10"),
		TotalTime:   d("1"),
		TotalCost:   v221.Price{ExclVAT: d("3.00")},
		LastUpdated: start,
	}

	rep, err := pricing.CalculateV221(cdr, tariff, pricing.Options{CurrencyPrecision: &currencyPrecision})
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(rep.TotalCost.BeforeTaxes.StringFixed(2))
	// Output: 3.00
}
