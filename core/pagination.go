package core

import (
	"fmt"
	"iter"
	"net/http"
	"net/url"
	"strconv"
	"strings"
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
func (o PageOpts) Query() url.Values {
	q := url.Values{}
	if o.DateFrom != nil {
		q.Set("date_from", o.DateFrom.UTC().Format(time.RFC3339))
	}
	if o.DateTo != nil {
		q.Set("date_to", o.DateTo.UTC().Format(time.RFC3339))
	}
	if o.Offset != nil {
		q.Set("offset", strconv.Itoa(*o.Offset))
	}
	if o.Limit != nil {
		q.Set("limit", strconv.Itoa(*o.Limit))
	}
	return q
}

// PageReq is the server-side parsed pagination request.
type PageReq struct {
	DateFrom *time.Time
	DateTo   *time.Time
	Offset   int
	Limit    int
}

// ParsePageReq parses pagination parameters from q.
func ParsePageReq(q url.Values) (PageReq, error) {
	var pr PageReq
	if v := q.Get("date_from"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return PageReq{}, fmt.Errorf("core: invalid date_from: %w", err)
		}
		pr.DateFrom = &t
	}
	if v := q.Get("date_to"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return PageReq{}, fmt.Errorf("core: invalid date_to: %w", err)
		}
		pr.DateTo = &t
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return PageReq{}, fmt.Errorf("core: invalid offset: %w", err)
		}
		pr.Offset = n
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return PageReq{}, fmt.Errorf("core: invalid limit: %w", err)
		}
		pr.Limit = n
	}
	return pr, nil
}

// ParsePageHeaders extracts OCPI pagination metadata (X-Total-Count, X-Limit and
// the Link rel="next" URL) from a list response's headers.
func ParsePageHeaders(h http.Header) (total, limit int, nextURL string) {
	if v := h.Get("X-Total-Count"); v != "" {
		total, _ = strconv.Atoi(v)
	}
	if v := h.Get("X-Limit"); v != "" {
		limit, _ = strconv.Atoi(v)
	}
	return total, limit, parseNextLink(h.Get("Link"))
}

// parseNextLink extracts the URL of the rel="next" link from an RFC 5988 Link
// header value, e.g. `<https://host/path?offset=50&limit=50>; rel="next"`.
func parseNextLink(link string) string {
	if link == "" {
		return ""
	}
	for _, part := range strings.Split(link, ",") {
		segs := strings.Split(part, ";")
		if len(segs) < 2 {
			continue
		}
		urlPart := strings.TrimSpace(segs[0])
		if !strings.HasPrefix(urlPart, "<") || !strings.HasSuffix(urlPart, ">") {
			continue
		}
		var rel string
		for _, p := range segs[1:] {
			p = strings.TrimSpace(p)
			if after, ok := strings.CutPrefix(p, "rel="); ok {
				rel = strings.Trim(after, `"`)
			}
		}
		if strings.EqualFold(rel, "next") {
			return urlPart[1 : len(urlPart)-1]
		}
	}
	return ""
}

// Paginate returns an iterator over every item across all pages. fetch loads one
// page; it is first called with "" (meaning the initial request URL) and then
// with each page's NextURL until NextURL is empty. On error the iterator yields a
// zero value together with the error and stops.
func Paginate[T any](fetch func(nextURL string) (Page[T], error)) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		next := ""
		for {
			page, err := fetch(next)
			if err != nil {
				var zero T
				yield(zero, err)
				return
			}
			for _, item := range page.Items {
				if !yield(item, nil) {
					return
				}
			}
			if page.NextURL == "" {
				return
			}
			next = page.NextURL
		}
	}
}
