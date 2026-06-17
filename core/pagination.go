package core

import (
	"net/url"
	"time"
)

// Page is a single page of a paginated OCPI list response, together with the
// pagination metadata parsed from the response headers (OCPI 2.2.1 §4.1.4).
type Page[T any] struct {
	Items      []T
	TotalCount int    // X-Total-Count
	Limit      int    // X-Limit
	NextURL    string // Link rel="next"
}

// PageOpts are client-side pagination request parameters (OCPI 2.2.1 §4.1.4).
type PageOpts struct {
	DateFrom *time.Time
	DateTo   *time.Time
	Offset   *int
	Limit    *int
}

// Query renders the options as URL query parameters (date_from, date_to, offset,
// limit), omitting unset fields.
//
// TODO(core, M1-A): implement.
func (o PageOpts) Query() url.Values {
	panic("not implemented: core.PageOpts.Query")
}

// PageReq is the server-side parsed pagination request.
type PageReq struct {
	DateFrom *time.Time
	DateTo   *time.Time
	Offset   int
	Limit    int
}

// ParsePageReq parses pagination parameters from q.
//
// TODO(core, M1-A): implement.
func ParsePageReq(q url.Values) (PageReq, error) {
	panic("not implemented: core.ParsePageReq")
}
