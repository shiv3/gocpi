package core

import "context"

// requestIDKey is the context key under which the request ID is stored.
type requestIDKey struct{}

// NewRequestID returns a new unique message ID (ULID) for the X-Request-ID /
// X-Correlation-ID headers (OCPI 2.2.1 §4.2).
//
// TODO(core, M1-A): implement.
func NewRequestID() string {
	panic("not implemented: core.NewRequestID")
}

// ContextWithRequestID returns a copy of ctx carrying the given request ID.
//
// TODO(core, M1-A): implement.
func ContextWithRequestID(ctx context.Context, id string) context.Context {
	panic("not implemented: core.ContextWithRequestID")
}

// RequestIDFromContext returns the request ID carried by ctx, or "" if none.
//
// TODO(core, M1-A): implement.
func RequestIDFromContext(ctx context.Context) string {
	panic("not implemented: core.RequestIDFromContext")
}
