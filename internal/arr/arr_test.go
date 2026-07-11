package arr

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/event"
)

// fixtureServer serves the given testdata file for /api/v3/calendar and
// records the received query and headers.
func fixtureServer(t *testing.T, fixture string, gotQuery *map[string][]string, gotAPIKey *string) *httptest.Server {
	t.Helper()
	data, err := os.ReadFile("testdata/" + fixture)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/calendar" {
			http.NotFound(w, r)
			return
		}
		if gotQuery != nil {
			*gotQuery = r.URL.Query()
		}
		if gotAPIKey != nil {
			*gotAPIKey = r.Header.Get("X-Api-Key")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestFetchSonarr(t *testing.T) {
	var query map[string][]string
	var apiKey string
	srv := fixtureServer(t, "sonarr_calendar.json", &query, &apiKey)

	inst := config.Instance{Name: "tv", Type: config.TypeSonarr, URL: srv.URL, APIKey: "sekrit"}
	start := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)

	events, err := FetchCalendar(context.Background(), inst, start, end)
	if err != nil {
		t.Fatalf("FetchCalendar: %v", err)
	}

	if apiKey != "sekrit" {
		t.Errorf("X-Api-Key = %q", apiKey)
	}
	if got := query["includeSeries"]; len(got) != 1 || got[0] != "true" {
		t.Errorf("includeSeries = %v, want true", got)
	}
	if got := query["unmonitored"]; len(got) != 1 || got[0] != "false" {
		t.Errorf("unmonitored = %v, want false", got)
	}

	// Episode 103 has no airDateUtc and must be skipped.
	if len(events) != 2 {
		t.Fatalf("len(events) = %d, want 2", len(events))
	}

	e := events[0]
	if e.UID != "sonarr-tv-101@arr-cal-proxy" {
		t.Errorf("UID = %q", e.UID)
	}
	if e.Kind != event.KindEpisode || e.Source != "sonarr" || e.Instance != "tv" {
		t.Errorf("kind/source/instance = %v/%v/%v", e.Kind, e.Source, e.Instance)
	}
	if e.Title != "Example Show" || e.Subtitle != "The Beginning" {
		t.Errorf("title/subtitle = %q/%q", e.Title, e.Subtitle)
	}
	if e.SxxEyy() != "S02E05" {
		t.Errorf("SxxEyy = %q", e.SxxEyy())
	}
	wantStart := time.Date(2026, 7, 15, 20, 0, 0, 0, time.UTC)
	if !e.Start.Equal(wantStart) || !e.End.Equal(wantStart.Add(45*time.Minute)) {
		t.Errorf("start/end = %v/%v", e.Start, e.End)
	}
	if e.AllDay || e.Downloaded {
		t.Errorf("allDay/downloaded = %v/%v, want false/false", e.AllDay, e.Downloaded)
	}
	if e.PosterURL != "https://images.example/poster.jpg" {
		t.Errorf("PosterURL = %q, want the remoteUrl of the poster coverType", e.PosterURL)
	}

	// Zero runtime falls back to 30 minutes; hasFile maps to Downloaded.
	e2 := events[1]
	if !e2.End.Equal(e2.Start.Add(30 * time.Minute)) {
		t.Errorf("default runtime: end = %v, start = %v", e2.End, e2.Start)
	}
	if !e2.Downloaded {
		t.Error("episode 102 should be Downloaded")
	}
}

func TestFetchRadarr(t *testing.T) {
	var query map[string][]string
	srv := fixtureServer(t, "radarr_calendar.json", &query, nil)

	inst := config.Instance{Name: "movies", Type: config.TypeRadarr, URL: srv.URL, APIKey: "k", IncludeUnmonitored: true}
	start := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)

	events, err := FetchCalendar(context.Background(), inst, start, end)
	if err != nil {
		t.Fatalf("FetchCalendar: %v", err)
	}
	if got := query["unmonitored"]; len(got) != 1 || got[0] != "true" {
		t.Errorf("unmonitored = %v, want true", got)
	}

	// Movie 42: cinema (Jul 10) and digital (Jul 20) are inside the window,
	// physical (Sep 1) is outside and must be dropped. Movie 43: digital only.
	if len(events) != 3 {
		t.Fatalf("len(events) = %d, want 3: %+v", len(events), events)
	}

	byUID := map[string]event.Event{}
	for _, e := range events {
		byUID[e.UID] = e
	}
	if _, ok := byUID["radarr-movies-42-physical@arr-cal-proxy"]; ok {
		t.Error("physical release outside window should be filtered out")
	}

	cinema, ok := byUID["radarr-movies-42-cinema@arr-cal-proxy"]
	if !ok {
		t.Fatalf("missing cinema event, have %v", byUID)
	}
	if cinema.Kind != event.KindMovieCinema || !cinema.AllDay {
		t.Errorf("cinema kind/allDay = %v/%v", cinema.Kind, cinema.AllDay)
	}
	wantDay := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
	if !cinema.Start.Equal(wantDay) || !cinema.End.Equal(wantDay.AddDate(0, 0, 1)) {
		t.Errorf("cinema start/end = %v/%v", cinema.Start, cinema.End)
	}
	if cinema.PosterURL != "https://images.example/movie-poster.jpg" {
		t.Errorf("PosterURL = %q", cinema.PosterURL)
	}

	digital43, ok := byUID["radarr-movies-43-digital@arr-cal-proxy"]
	if !ok {
		t.Fatal("missing digital event for movie 43")
	}
	if digital43.Kind != event.KindMovieDigital || !digital43.Downloaded {
		t.Errorf("movie 43 kind/downloaded = %v/%v", digital43.Kind, digital43.Downloaded)
	}
}

func TestFetchErrorIncludesInstanceName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	t.Cleanup(srv.Close)

	inst := config.Instance{Name: "broken", Type: config.TypeSonarr, URL: srv.URL, APIKey: "bad"}
	_, err := FetchCalendar(context.Background(), inst, time.Now(), time.Now().Add(time.Hour))
	if err == nil {
		t.Fatal("want error on 401")
	}
	if !strings.Contains(err.Error(), "broken") {
		t.Errorf("error %q should name the instance", err)
	}
}
