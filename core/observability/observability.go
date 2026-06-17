// Package observability defines pluggable metrics for the gocpi client and server.
package observability

import "time"

// Metrics receives operational events from the gocpi client and server.
// Implementations are provided for OpenTelemetry and Prometheus.
type Metrics interface {
	RequestStarted(module, op string)
	RequestCompleted(module, op string, statusCode int, dur time.Duration)
	ValidationFailed(module, op string)
}

// NoopMetrics is a Metrics implementation that does nothing.
type NoopMetrics struct{}

// RequestStarted implements Metrics.
func (NoopMetrics) RequestStarted(module, op string) {}

// RequestCompleted implements Metrics.
func (NoopMetrics) RequestCompleted(module, op string, statusCode int, dur time.Duration) {}

// ValidationFailed implements Metrics.
func (NoopMetrics) ValidationFailed(module, op string) {}
