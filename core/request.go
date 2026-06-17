package core

import (
	"context"

	"github.com/oklog/ulid/v2"
)

// requestIDKey is the context key under which the request ID is stored.
type requestIDKey struct{}

// NewRequestID returns a new unique message ID (ULID) for the X-Request-ID /
// X-Correlation-ID headers (OCPI 2.2.1 §4.2).
func NewRequestID() string {
	return ulid.Make().String()
}

// ContextWithRequestID returns a copy of ctx carrying the given request ID.
func ContextWithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestIDFromContext returns the request ID carried by ctx, or "" if none.
func RequestIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}
