package core

import "github.com/go-playground/validator/v10"

var defaultValidator = validator.New(validator.WithRequiredStructEnabled())

// Validate checks v against the `validate` struct tags that gocpi generates on
// OCPI types (required, len, max, min, ...). v must be a struct or a pointer to
// a struct; it returns a non-nil error describing any constraint failures.
//
// This is the struct-tag layer of validation. Callers typically validate
// inbound request bodies in their handlers and outbound objects before sending.
func Validate(v any) error {
	return defaultValidator.Struct(v)
}
