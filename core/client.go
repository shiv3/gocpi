package core

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/shiv3/gocpi/core/transport"
)

// Client is the base OCPI HTTP client. Generated module clients call into it;
// it injects auth, routing and request-ID headers, applies retries, and exposes
// the raw response for the generic Decode helper.
type Client struct {
	http   transport.Doer
	token  string
	logger *slog.Logger
}

// ClientOption configures a Client.
type ClientOption func(*Client)

// NewClient returns a new Client configured by opts. Unset options fall back to
// sensible defaults (http.DefaultClient, slog.Default()).
//
// TODO(core, M1-A): implement.
func NewClient(opts ...ClientOption) *Client {
	panic("not implemented: core.NewClient")
}

// Do performs an OCPI HTTP request to rawURL, injecting auth and tracing headers.
// The caller decodes the response via Decode[T].
//
// TODO(core, M1-A): implement.
func (c *Client) Do(ctx context.Context, method, rawURL string, body any) (*http.Response, error) {
	panic("not implemented: core.Client.Do")
}

// WithHTTPClient sets the underlying HTTP transport.
func WithHTTPClient(d transport.Doer) ClientOption { return func(c *Client) { c.http = d } }

// WithToken sets the outbound credentials token (already decoded; the client
// encodes it for the Authorization header).
func WithToken(token string) ClientOption { return func(c *Client) { c.token = token } }

// WithClientLogger sets the client logger.
func WithClientLogger(l *slog.Logger) ClientOption { return func(c *Client) { c.logger = l } }
