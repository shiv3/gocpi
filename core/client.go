package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/rand/v2"
	"net/http"
	"time"

	"github.com/shiv3/gocpi/core/observability"
	"github.com/shiv3/gocpi/core/transport"
)

// Client is the base OCPI HTTP client. Generated module clients call into it; it
// injects auth, request-ID and tracing headers, optionally retries transient
// failures, records metrics, and exposes the raw response for the generic Decode
// helper.
type Client struct {
	doer       transport.Doer
	token      string
	logger     *slog.Logger
	metrics    observability.Metrics
	maxRetries int
	retryBase  time.Duration
}

// ClientOption configures a Client.
type ClientOption func(*Client)

// NewClient returns a new Client configured by opts. Unset options fall back to
// http.DefaultClient, slog.Default(), no-op metrics and no retries.
func NewClient(opts ...ClientOption) *Client {
	c := &Client{retryBase: 200 * time.Millisecond}
	for _, opt := range opts {
		opt(c)
	}
	if c.doer == nil {
		c.doer = http.DefaultClient
	}
	if c.logger == nil {
		c.logger = slog.Default()
	}
	if c.metrics == nil {
		c.metrics = observability.NoopMetrics{}
	}
	return c
}

// Do performs an OCPI HTTP request to rawURL, injecting the Authorization (Token)
// header and X-Request-ID/X-Correlation-ID. body, when non-nil, is JSON-encoded.
// Transient transport errors and 429/5xx responses are retried up to the
// configured number of attempts with exponential backoff. The caller decodes the
// response via Decode[T].
func (c *Client) Do(ctx context.Context, method, rawURL string, body any) (*http.Response, error) {
	var bodyBytes []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("core: marshal request body: %w", err)
		}
		bodyBytes = b
	}

	attempts := c.maxRetries + 1
	var lastErr error
	for i := 0; i < attempts; i++ {
		if i > 0 {
			if err := sleep(ctx, backoff(i, c.retryBase)); err != nil {
				return nil, err
			}
		}

		var reader io.Reader
		if bodyBytes != nil {
			reader = bytes.NewReader(bodyBytes)
		}
		req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
		if err != nil {
			return nil, fmt.Errorf("core: build request: %w", err)
		}
		if bodyBytes != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if c.token != "" {
			req.Header.Set("Authorization", "Token "+EncodeToken(c.token))
		}
		reqID := RequestIDFromContext(ctx)
		if reqID == "" {
			reqID = NewRequestID()
		}
		req.Header.Set("X-Request-ID", reqID)
		req.Header.Set("X-Correlation-ID", reqID)

		start := time.Now()
		resp, err := c.doer.Do(req)
		if err != nil {
			lastErr = err
			continue // retry transport errors
		}
		c.metrics.ObserveClient(method, resp.StatusCode, time.Since(start))
		if i < attempts-1 && retryableStatus(resp.StatusCode) {
			_ = resp.Body.Close()
			lastErr = fmt.Errorf("core: retryable status %d", resp.StatusCode)
			continue
		}
		return resp, nil
	}
	return nil, lastErr
}

func retryableStatus(code int) bool {
	switch code {
	case http.StatusTooManyRequests, http.StatusInternalServerError,
		http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	}
	return false
}

func backoff(attempt int, base time.Duration) time.Duration {
	d := float64(base) * math.Pow(2, float64(attempt-1))
	return time.Duration(d * (0.5 + rand.Float64())) // 0.5x..1.5x jitter
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// WithHTTPClient sets the underlying HTTP transport.
func WithHTTPClient(d transport.Doer) ClientOption { return func(c *Client) { c.doer = d } }

// WithToken sets the outbound credentials token (already decoded; the client
// Base64-encodes it for the Authorization header).
func WithToken(token string) ClientOption { return func(c *Client) { c.token = token } }

// WithClientLogger sets the client logger.
func WithClientLogger(l *slog.Logger) ClientOption { return func(c *Client) { c.logger = l } }

// WithClientMetrics sets the client metrics sink.
func WithClientMetrics(m observability.Metrics) ClientOption {
	return func(c *Client) { c.metrics = m }
}

// WithRetry sets how many times a transient failure is retried (0 = no retry).
func WithRetry(maxRetries int) ClientOption { return func(c *Client) { c.maxRetries = maxRetries } }

// WithRetryBackoff sets the base delay for exponential backoff between retries.
func WithRetryBackoff(base time.Duration) ClientOption {
	return func(c *Client) { c.retryBase = base }
}
