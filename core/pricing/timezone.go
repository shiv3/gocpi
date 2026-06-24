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
	// Multi-timezone countries such as US, CA, RU, and AU are deliberately not
	// inferred; callers should provide an exact zone or fall back to UTC.
	zones := map[string]string{
		"AD": "Europe/Andorra",
		"AL": "Europe/Tirane",
		"AT": "Europe/Vienna",
		"BA": "Europe/Sarajevo",
		"BE": "Europe/Brussels",
		"BG": "Europe/Sofia",
		"CH": "Europe/Zurich",
		"CY": "Asia/Nicosia",
		"CZ": "Europe/Prague",
		"DE": "Europe/Berlin",
		"DK": "Europe/Copenhagen",
		"EE": "Europe/Tallinn",
		"ES": "Europe/Madrid",
		"FI": "Europe/Helsinki",
		"FR": "Europe/Paris",
		"GB": "Europe/London",
		"GR": "Europe/Athens",
		"HR": "Europe/Zagreb",
		"HU": "Europe/Budapest",
		"IE": "Europe/Dublin",
		"IS": "Atlantic/Reykjavik",
		"IT": "Europe/Rome",
		"JP": "Asia/Tokyo",
		"LI": "Europe/Vaduz",
		"LT": "Europe/Vilnius",
		"LU": "Europe/Luxembourg",
		"LV": "Europe/Riga",
		"MC": "Europe/Monaco",
		"ME": "Europe/Podgorica",
		"MK": "Europe/Skopje",
		"MT": "Europe/Malta",
		"NL": "Europe/Amsterdam",
		"NO": "Europe/Oslo",
		"PL": "Europe/Warsaw",
		"PT": "Europe/Lisbon",
		"RO": "Europe/Bucharest",
		"RS": "Europe/Belgrade",
		"SE": "Europe/Stockholm",
		"SI": "Europe/Ljubljana",
		"SK": "Europe/Bratislava",
		"SM": "Europe/San_Marino",
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
