//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"
	"time"

	_ "time/tzdata" // embed IANA zone DB: js/wasm has no filesystem

	"github.com/shopspring/decimal"

	pricing "github.com/shiv3/gocpi/core/pricing"
	"github.com/shiv3/gocpi/v221"
	"github.com/shiv3/gocpi/v230"
)

type optsJSON struct {
	CurrencyPrecision *int   `json:"currencyPrecision"`
	TimeZone          string `json:"timeZone"`
	Tolerance         string `json:"tolerance"`
}

func parseOptions(s string) (pricing.Options, string, error) {
	var o optsJSON
	if s != "" {
		if err := json.Unmarshal([]byte(s), &o); err != nil {
			return pricing.Options{}, "", fmt.Errorf("invalid options json: %w", err)
		}
	}
	opts := pricing.Options{CurrencyPrecision: o.CurrencyPrecision}
	if o.TimeZone != "" {
		loc, err := time.LoadLocation(o.TimeZone)
		if err != nil {
			return pricing.Options{}, "", fmt.Errorf("invalid timeZone %q: %w", o.TimeZone, err)
		}
		opts.TimeZone = loc
	}
	if o.Tolerance != "" {
		tol, err := decimal.NewFromString(o.Tolerance)
		if err != nil {
			return pricing.Options{}, "", fmt.Errorf("invalid tolerance %q: %w", o.Tolerance, err)
		}
		opts.Tolerance = tol
	}
	// currency is read back from the CDR by the caller for the DTO
	return opts, "", nil
}

func calculate(version, cdrJSON, optsJSON string) response {
	opts, _, err := parseOptions(optsJSON)
	if err != nil {
		return errorResponse(err)
	}
	switch version {
	case "2.2.1":
		var cdr v221.CDR
		if err := json.Unmarshal([]byte(cdrJSON), &cdr); err != nil {
			return errorResponse(fmt.Errorf("invalid CDR json: %w", err))
		}
		rep, err := v221.CalculateCDR(cdr, opts)
		if err != nil {
			return errorResponse(err)
		}
		return toCalculateResponse(rep, cdr.Currency)
	case "2.3.0":
		var cdr v230.CDR
		if err := json.Unmarshal([]byte(cdrJSON), &cdr); err != nil {
			return errorResponse(fmt.Errorf("invalid CDR json: %w", err))
		}
		rep, err := v230.CalculateCDR(cdr, opts)
		if err != nil {
			return errorResponse(err)
		}
		return toCalculateResponse(rep, cdr.Currency)
	default:
		return errorResponse(fmt.Errorf("unknown version %q", version))
	}
}

func verify(version, cdrJSON, optsJSON string) response {
	opts, _, err := parseOptions(optsJSON)
	if err != nil {
		return errorResponse(err)
	}
	switch version {
	case "2.2.1":
		var cdr v221.CDR
		if err := json.Unmarshal([]byte(cdrJSON), &cdr); err != nil {
			return errorResponse(fmt.Errorf("invalid CDR json: %w", err))
		}
		v, err := v221.VerifyCDR(cdr, opts)
		if err != nil {
			return errorResponse(err) // invalid input -> ok:false, no verdict
		}
		return toVerifyResponse(v)
	case "2.3.0":
		var cdr v230.CDR
		if err := json.Unmarshal([]byte(cdrJSON), &cdr); err != nil {
			return errorResponse(fmt.Errorf("invalid CDR json: %w", err))
		}
		v, err := v230.VerifyCDR(cdr, opts)
		if err != nil {
			return errorResponse(err)
		}
		return toVerifyResponse(v)
	default:
		return errorResponse(fmt.Errorf("unknown version %q", version))
	}
}

func toJSON(r response) string {
	b, err := json.Marshal(r)
	if err != nil {
		return `{"ok":false,"error":"failed to marshal response"}`
	}
	return string(b)
}

func wrap(fn func(version, cdrJSON, optsJSON string) response) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) (result any) {
		defer func() {
			if r := recover(); r != nil {
				result = toJSON(errorResponse(fmt.Errorf("engine panic: %v", r)))
			}
		}()
		if len(args) < 3 {
			return toJSON(errorResponse(fmt.Errorf("expected (version, cdrJSON, optsJSON)")))
		}
		return toJSON(fn(args[0].String(), args[1].String(), args[2].String()))
	})
}

func main() {
	js.Global().Set("gocpiCalculate", wrap(calculate))
	js.Global().Set("gocpiVerify", wrap(verify))
	select {} // keep the wasm instance alive
}
