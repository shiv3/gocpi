// Package otel provides an OpenTelemetry-backed observability.Metrics
// implementation.
package otel

import (
	"context"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/shiv3/gocpi/core/observability"
)

// Metrics implements observability.Metrics using OpenTelemetry instruments.
type Metrics struct {
	clientReqs metric.Int64Counter
	clientDur  metric.Float64Histogram
	serverReqs metric.Int64Counter
	serverDur  metric.Float64Histogram
}

var _ observability.Metrics = (*Metrics)(nil)

// New builds a Metrics backed by the given OpenTelemetry meter.
func New(meter metric.Meter) (*Metrics, error) {
	clientReqs, err := meter.Int64Counter("gocpi.client.requests")
	if err != nil {
		return nil, err
	}
	clientDur, err := meter.Float64Histogram("gocpi.client.request.duration", metric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	serverReqs, err := meter.Int64Counter("gocpi.server.requests")
	if err != nil {
		return nil, err
	}
	serverDur, err := meter.Float64Histogram("gocpi.server.request.duration", metric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	return &Metrics{clientReqs: clientReqs, clientDur: clientDur, serverReqs: serverReqs, serverDur: serverDur}, nil
}

// ObserveClient implements observability.Metrics.
func (m *Metrics) ObserveClient(method string, statusCode int, dur time.Duration) {
	ctx := context.Background()
	attrs := metric.WithAttributes(attribute.String("method", method), attribute.Int("status", statusCode))
	m.clientReqs.Add(ctx, 1, attrs)
	m.clientDur.Record(ctx, dur.Seconds(), metric.WithAttributes(attribute.String("method", method)))
}

// ObserveServer implements observability.Metrics.
func (m *Metrics) ObserveServer(method, route string, statusCode int, dur time.Duration) {
	ctx := context.Background()
	attrs := metric.WithAttributes(attribute.String("method", method), attribute.String("route", route), attribute.Int("status", statusCode))
	m.serverReqs.Add(ctx, 1, attrs)
	m.serverDur.Record(ctx, dur.Seconds(), metric.WithAttributes(attribute.String("method", method), attribute.String("route", route)))
}
