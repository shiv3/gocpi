// Package status defines OCPI status codes and the typed error used across gocpi.
//
// OCPI status codes (OCPI 2.2.1 §5) are four-digit codes distinct from HTTP
// status codes and are carried in the response envelope's status_code field.
package status

import (
	"fmt"
	"net/http"
)

// Code is an OCPI status code (OCPI 2.2.1 §5).
type Code int

// OCPI status codes.
const (
	// 1xxx: success.
	Success Code = 1000

	// 2xxx: client errors.
	GenericClientError   Code = 2000
	InvalidParameters    Code = 2001
	NotEnoughInformation Code = 2002
	UnknownLocation      Code = 2003
	UnknownToken         Code = 2004

	// 3xxx: server errors.
	GenericServerError   Code = 3000
	UnableToUseClientAPI Code = 3001
	UnsupportedVersion   Code = 3002
	NoMatchingEndpoints  Code = 3003

	// 4xxx: hub errors.
	GenericHubError     Code = 4000
	UnknownReceiver     Code = 4001
	TimeoutForwardedReq Code = 4002
	ConnectionProblem   Code = 4003
)

// IsSuccess reports whether c is in the 1xxx success range.
func (c Code) IsSuccess() bool { return c >= 1000 && c < 2000 }

// IsClientError reports whether c is in the 2xxx client-error range.
func (c Code) IsClientError() bool { return c >= 2000 && c < 3000 }

// IsServerError reports whether c is in the 3xxx server-error range.
func (c Code) IsServerError() bool { return c >= 3000 && c < 4000 }

// IsHubError reports whether c is in the 4xxx hub-error range.
func (c Code) IsHubError() bool { return c >= 4000 && c < 5000 }

// Error is an OCPI error carrying an OCPI status Code and a suggested HTTP status.
type Error struct {
	Code       Code
	Message    string
	HTTPStatus int // suggested HTTP status; 0 means default per Code class
}

// Error implements the error interface.
func (e *Error) Error() string {
	return fmt.Sprintf("ocpi status %d: %s", e.Code, e.Message)
}

// New returns a new *Error with the given code and message.
func New(code Code, msg string) *Error {
	return &Error{Code: code, Message: msg, HTTPStatus: http.StatusOK}
}

// GenericClient returns a generic 2000 client error.
func GenericClient(msg string) *Error {
	return &Error{Code: GenericClientError, Message: msg, HTTPStatus: http.StatusBadRequest}
}

// GenericServer returns a generic 3000 server error.
func GenericServer(msg string) *Error {
	return &Error{Code: GenericServerError, Message: msg, HTTPStatus: http.StatusInternalServerError}
}
