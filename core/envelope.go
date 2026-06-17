// Package core implements the version-independent OCPI transport semantics:
// the response envelope, pagination, token auth, message routing, request IDs,
// and the base HTTP client and server. Version-specific modules (v221/...) are
// generated on top of these primitives.
package core

import (
	"encoding/json"
	"fmt"
	"io"
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

// Decode reads an OCPI response body into Response[T]. It returns a *status.Error
// when the OCPI status_code is non-success, or when the body is absent and the
// HTTP status indicates an error. The response body is closed.
func Decode[T any](resp *http.Response) (Response[T], error) {
	var out Response[T]
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return out, fmt.Errorf("core: read response body: %w", err)
	}
	if len(body) > 0 {
		if err := json.Unmarshal(body, &out); err != nil {
			return out, fmt.Errorf("core: decode response envelope: %w", err)
		}
	}

	switch {
	case out.StatusCode != 0 && !status.Code(out.StatusCode).IsSuccess():
		return out, &status.Error{
			Code:       status.Code(out.StatusCode),
			Message:    out.StatusMessage,
			HTTPStatus: resp.StatusCode,
		}
	case out.StatusCode == 0 && resp.StatusCode >= http.StatusBadRequest:
		return out, &status.Error{
			Code:       status.GenericServerError,
			Message:    http.StatusText(resp.StatusCode),
			HTTPStatus: resp.StatusCode,
		}
	default:
		return out, nil
	}
}

// WriteResponse writes the OCPI envelope (data + status_code + status_message +
// timestamp) with the given HTTP status.
func WriteResponse[T any](w http.ResponseWriter, httpStatus int, data T, code status.Code, msg string) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)
	return json.NewEncoder(w).Encode(Response[T]{
		Data:          data,
		StatusCode:    int(code),
		StatusMessage: msg,
		Timestamp:     time.Now().UTC(),
	})
}

// WriteError writes an OCPI error envelope (no data field) derived from e. When
// e.HTTPStatus is 0, HTTP 200 is used (OCPI commonly returns 200 with an error
// status_code).
func WriteError(w http.ResponseWriter, e *status.Error) error {
	httpStatus := e.HTTPStatus
	if httpStatus == 0 {
		httpStatus = http.StatusOK
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)
	return json.NewEncoder(w).Encode(map[string]any{
		"status_code":    int(e.Code),
		"status_message": e.Message,
		"timestamp":      time.Now().UTC(),
	})
}
