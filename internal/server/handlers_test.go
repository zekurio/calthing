package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/event"
	"github.com/zekurio/arr-cal-proxy/internal/fetch"
)

func testServer(t *testing.T, token string) http.Handler {
	t.Helper()
	cfg := &config.Config{
		Listen: ":0",
		Cache:  config.Cache{TTL: config.Duration(time.Minute)},
		Calendar: config.Calendar{
			PastDays: 30, FutureDays: 90, Name: "Test Calendar",
		},
		Auth: config.Auth{Token: token},
		Instances: []config.Instance{
			{Name: "tv", Type: config.TypeSonarr, URL: "http://tv", APIKey: "k"},
		},
	}
	fetcher := fetch.NewWithFetchFunc(cfg.Instances, time.Minute,
		func(_ context.Context, inst config.Instance, start, _ time.Time) ([]event.Event, error) {
			return []event.Event{{
				UID:      "sonarr-tv-1@arr-cal-proxy",
				Instance: inst.Name,
				Source:   "sonarr",
				Kind:     event.KindEpisode,
				Title:    "Example Show",
				Subtitle: "Pilot",
				Season:   1, Episode: 1,
				Start: start.Add(24 * time.Hour),
				End:   start.Add(24*time.Hour + 45*time.Minute),
			}}, nil
		})

	static := fstest.MapFS{
		"index.html":       {Data: []byte("<html>SPA</html>")},
		"assets/app.js":    {Data: []byte("//js")},
		"assets/style.css": {Data: []byte("/*css*/")},
	}
	return New(cfg, fetcher, static)
}

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestICSEndpoint(t *testing.T) {
	h := testServer(t, "")
	rec := get(t, h, "/calendar.ics")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/calendar") {
		t.Errorf("Content-Type = %q", ct)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "BEGIN:VCALENDAR") || !strings.Contains(body, "sonarr-tv-1@arr-cal-proxy") {
		t.Errorf("unexpected body: %s", body)
	}
}

func TestICSToken(t *testing.T) {
	h := testServer(t, "sekrit")
	if rec := get(t, h, "/calendar.ics"); rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: status = %d, want 401", rec.Code)
	}
	if rec := get(t, h, "/calendar.ics?token=wrong"); rec.Code != http.StatusUnauthorized {
		t.Errorf("wrong token: status = %d, want 401", rec.Code)
	}
	if rec := get(t, h, "/calendar.ics?token=sekrit"); rec.Code != http.StatusOK {
		t.Errorf("valid token: status = %d, want 200", rec.Code)
	}
}

func TestEventsEndpoint(t *testing.T) {
	h := testServer(t, "sekrit") // token must NOT guard /api/events
	rec := get(t, h, "/api/events?start=2026-07-01&end=2026-08-01")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	var resp struct {
		Events    []event.Event          `json:"events"`
		Instances []fetch.InstanceStatus `json:"instances"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Events) != 1 || resp.Events[0].Title != "Example Show" {
		t.Errorf("events = %+v", resp.Events)
	}
	if len(resp.Instances) != 1 || !resp.Instances[0].OK {
		t.Errorf("instances = %+v", resp.Instances)
	}
}

func TestWindowValidation(t *testing.T) {
	h := testServer(t, "")
	if rec := get(t, h, "/api/events?start=banana"); rec.Code != http.StatusBadRequest {
		t.Errorf("bad start: status = %d, want 400", rec.Code)
	}
	if rec := get(t, h, "/api/events?start=2026-08-01&end=2026-07-01"); rec.Code != http.StatusBadRequest {
		t.Errorf("end before start: status = %d, want 400", rec.Code)
	}
}

func TestSPAFallback(t *testing.T) {
	h := testServer(t, "")
	for _, path := range []string{"/", "/some/client/route"} {
		rec := get(t, h, path)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "SPA") {
			t.Errorf("%s: status = %d, body = %q", path, rec.Code, rec.Body)
		}
	}
	rec := get(t, h, "/assets/app.js")
	if rec.Code != http.StatusOK || rec.Body.String() != "//js" {
		t.Errorf("real file: status = %d, body = %q", rec.Code, rec.Body)
	}
}

func TestHealth(t *testing.T) {
	h := testServer(t, "")
	rec := get(t, h, "/api/health")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "ok") {
		t.Errorf("status = %d, body = %q", rec.Code, rec.Body)
	}
}
