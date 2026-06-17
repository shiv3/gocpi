package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/shiv3/gocpi/core/transport"
)

// Client is the base OCPI HTTP client. Generated module clients call into it; it
// injects auth, request-ID and tracing headers and exposes the raw response for
// the generic Decode helper.
type Client struct {
	doer   transport.Doer
	token  string
	logger *slog.Logger
}

// ClientOption configures a Client.
type ClientOption func(*Client)

// NewClient returns a new Client configured by opts. Unset options fall back to
// http.DefaultClient and slog.Default().
func NewClient(opts ...ClientOption) *Client {
	c := &Client{}
	for _, opt := range opts {
		opt(c)
	}
	if c.doer == nil {
		c.doer = http.DefaultClient
	}
	if c.logger == nil {
		c.logger = slog.Default()
	}
	return c
}

// Do performs an OCPI HTTP request to rawURL, injecting the Authorization (Token)
// header and X-Request-ID/X-Correlation-ID. body, when non-nil, is JSON-encoded.
// The caller decodes the response via Decode[T].
func (c *Client) Do(ctx context.Context, method, rawURL string, body any) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("core: marshal request body: %w", err)
		}
		reader = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return nil, fmt.Errorf("core: build request: %w", err)
	}
	if body != nil {
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

	// TODO(core): retry/backoff once a backoff dependency is vendored.
	return c.doer.Do(req)
}

// WithHTTPClient sets the underlying HTTP transport.
func WithHTTPClient(d transport.Doer) ClientOption { return func(c *Client) { c.doer = d } }

// WithToken sets the outbound credentials token (already decoded; the client
// Base64-encodes it for the Authorization header).
func WithToken(token string) ClientOption { return func(c *Client) { c.token = token } }

// WithClientLogger sets the client logger.
func WithClientLogger(l *slog.Logger) ClientOption { return func(c *Client) { c.logger = l } }
