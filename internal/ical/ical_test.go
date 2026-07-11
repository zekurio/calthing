package ical

import (
	"flag"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/event"
)

var update = flag.Bool("update", false, "rewrite golden files")

func fixtureEvents() []event.Event {
	return []event.Event{
		{
			UID:      "sonarr-tv-101@arr-cal-proxy",
			Instance: "tv",
			Source:   "sonarr",
			Kind:     event.KindEpisode,
			Title:    "Example Show",
			Subtitle: "The Beginning",
			Season:   2,
			Episode:  5,
			Start:    time.Date(2026, 7, 15, 20, 0, 0, 0, time.UTC),
			End:      time.Date(2026, 7, 15, 20, 45, 0, 0, time.UTC),
			Overview: "Things begin, dramatically.\nWith a newline, a comma, and a; semicolon.",
		},
		{
			UID:        "radarr-movies-42-digital@arr-cal-proxy",
			Instance:   "movies",
			Source:     "radarr",
			Kind:       event.KindMovieDigital,
			Title:      "Example Movie",
			Start:      time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC),
			End:        time.Date(2026, 7, 21, 0, 0, 0, 0, time.UTC),
			AllDay:     true,
			Downloaded: true,
			Overview:   "A movie about examples.",
		},
	}
}

func TestGenerateGolden(t *testing.T) {
	now := time.Date(2026, 7, 11, 12, 0, 0, 0, time.UTC)
	got := Generate(fixtureEvents(), "Test Calendar", now)
	// Normalize CRLF for a diff-friendly golden file.
	gotLF := strings.ReplaceAll(got, "\r\n", "\n")

	const golden = "testdata/expected.ics"
	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(golden, []byte(gotLF), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("read golden (run with -update to create): %v", err)
	}
	if gotLF != string(want) {
		t.Errorf("output differs from golden file:\n--- got ---\n%s\n--- want ---\n%s", gotLF, want)
	}
}

func TestGenerateProperties(t *testing.T) {
	now := time.Date(2026, 7, 11, 12, 0, 0, 0, time.UTC)
	out := Generate(fixtureEvents(), "Test Calendar", now)

	for _, want := range []string{
		"BEGIN:VCALENDAR",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:Test Calendar",
		"UID:sonarr-tv-101@arr-cal-proxy",
		"UID:radarr-movies-42-digital@arr-cal-proxy",
		"SUMMARY:Example Show S02E05 - The Beginning",
		"SUMMARY:✔ Example Movie (Digital Release)",
		// All-day movie events use VALUE=DATE.
		"DTSTART;VALUE=DATE:20260720",
		"DTEND;VALUE=DATE:20260721",
		// Timed episode events use UTC timestamps.
		"DTSTART:20260715T200000Z",
		"CATEGORIES:tv",
		"CATEGORIES:movies",
		"END:VCALENDAR",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q", want)
		}
	}

	// The output is CRLF-delimited and the overview newline is escaped.
	if !strings.Contains(out, "\r\n") {
		t.Error("output should use CRLF line endings")
	}
	if strings.Contains(out, "dramatically.\nWith") {
		t.Error("raw newline in DESCRIPTION not escaped")
	}
}

func TestGenerateStableAcrossCalls(t *testing.T) {
	now := time.Date(2026, 7, 11, 12, 0, 0, 0, time.UTC)
	a := Generate(fixtureEvents(), "Test Calendar", now)
	b := Generate(fixtureEvents(), "Test Calendar", now)
	if a != b {
		t.Error("Generate is not deterministic for identical input")
	}
}
