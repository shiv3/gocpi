// Package core implements the version-independent OCPI transport semantics:
// the response envelope, pagination, token auth, message routing, request IDs,
// and the base HTTP client and server. Version-specific modules (v221/...) are
// generated on top of these primitives.
package core

import (
	"net/http"
	"time"

	"github.com/shiv3/gocpi/core/status"
)

// Response is the standard OCPI response envelope (OCPI 2.2.1 §4.1.7). Every OCPI
// HTTP response wraps its payload in this structure.
type Response[T any] struct {
	Data          T         `json:"data,omitempty"`
	StatusCode    int       `json:"status_code"`
	StatusMessage string    `json:"status_message,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

// Decode reads an OCPI response body into Response[T], mapping a non-success
// OCPI status_code (and non-2xx HTTP status) to a *status.Error.
//
// TODO(core, M1-A): implement.
func Decode[T any](resp *http.Response) (Response[T], error) {
	panic("not implemented: core.Decode")
}

// WriteResponse writes the OCPI envelope (data + status_code + status_message +
// timestamp) with the given HTTP status.
//
// TODO(core, M1-A): implement.
func WriteResponse[T any](w http.ResponseWriter, httpStatus int, data T, code status.Code, msg string) error {
	panic("not implemented: core.WriteResponse")
}

// WriteError writes an OCPI error envelope derived from e.
//
// TODO(core, M1-A): implement.
func WriteError(w http.ResponseWriter, e *status.Error) error {
	panic("not implemented: core.WriteError")
}
