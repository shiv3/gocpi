// Package types defines OCPI primitive types shared across protocol versions.
package types

import "github.com/shopspring/decimal"

// CiString is an OCPI case-insensitive string. Its maximum length is enforced
// via validate tags on the fields that use it (e.g. `validate:"max=36"`).
type CiString = string

// Number is an OCPI decimal number.
type Number = decimal.Decimal
