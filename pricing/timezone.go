package pricing

import (
	"strings"
	"time"
)

func resolveZone(in Input, opts Options, tariffHasLocalRestrictions bool) (*time.Location, []Warning, error) {
	if opts.TimeZone != nil {
		return opts.TimeZone, nil, nil
	}
	if opts.StrictTimeZone && tariffHasLocalRestrictions {
		return nil, nil, &PricingError{Code: InvalidInput, Msg: "no timezone for local-time restrictions in strict mode"}
	}
	if loc, ok := countryZone(in.CountryCode); ok {
		return loc, []Warning{{
			Code: WarnTZInferred,
			Kind: KindWarning,
			Msg:  "timezone inferred from country code " + in.CountryCode,
		}}, nil
	}
	return time.UTC, []Warning{{
		Code: WarnTZUTC,
		Kind: KindWarning,
		Msg:  "no timezone available; computed in UTC",
	}}, nil
}

func countryZone(alpha2 string) (*time.Location, bool) {
	// Multi-timezone countries such as US, CA, RU, and AU use a representative
	// zone as a best-effort fallback when callers do not provide an exact zone.
	zones := map[string]string{
		"AT": "Europe/Vienna",
		"AU": "Australia/Sydney",
		"BE": "Europe/Brussels",
		"CH": "Europe/Zurich",
		"DE": "Europe/Berlin",
		"DK": "Europe/Copenhagen",
		"ES": "Europe/Madrid",
		"FI": "Europe/Helsinki",
		"FR": "Europe/Paris",
		"GB": "Europe/London",
		"IE": "Europe/Dublin",
		"IT": "Europe/Rome",
		"JP": "Asia/Tokyo",
		"NL": "Europe/Amsterdam",
		"NO": "Europe/Oslo",
		"PL": "Europe/Warsaw",
		"PT": "Europe/Lisbon",
		"SE": "Europe/Stockholm",
		"US": "America/New_York",
	}

	name, ok := zones[strings.ToUpper(alpha2)]
	if !ok {
		return nil, false
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, false
	}
	return loc, true
}

func currencyScale(code string) int {
	scales := map[string]int{
		"HUF": 2,
		"ISK": 0,
		"JPY": 0,
		"KRW": 0,
	}
	if scale, ok := scales[strings.ToUpper(code)]; ok {
		return scale
	}
	return 2
}
