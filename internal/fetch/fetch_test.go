package fetch

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/event"
)

var testInstances = []config.Instance{
	{Name: "tv", Type: config.TypeSonarr, URL: "http://tv", APIKey: "k"},
	{Name: "movies", Type: config.TypeRadarr, URL: "http://movies", APIKey: "k"},
}

func testEvent(instance string, start time.Time) event.Event {
	return event.Event{UID: instance + "-e@test", Instance: instance, Start: start}
}

func TestOneInstanceFailingDoesNotKillFeed(t *testing.T) {
	f := New(testInstances, time.Minute)
	f.fetch = func(_ context.Context, inst config.Instance, start, _ time.Time) ([]event.Event, error) {
		if inst.Name == "movies" {
			return nil, errors.New("connection refused")
		}
		return []event.Event{testEvent(inst.Name, start)}, nil
	}

	events, statuses := f.Events(context.Background(), time.Now(), time.Now().AddDate(0, 0, 7))
	if len(events) != 1 || events[0].Instance != "tv" {
		t.Fatalf("events = %+v, want just the tv event", events)
	}
	byName := map[string]InstanceStatus{}
	for _, s := range statuses {
		byName[s.Name] = s
	}
	if !byName["tv"].OK {
		t.Error("tv should be OK")
	}
	if byName["movies"].OK || byName["movies"].Error == "" {
		t.Errorf("movies should report its error, got %+v", byName["movies"])
	}
}

func TestEventsAreMergedAndSorted(t *testing.T) {
	base := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
	f := New(testInstances, time.Minute)
	f.fetch = func(_ context.Context, inst config.Instance, _, _ time.Time) ([]event.Event, error) {
		if inst.Name == "tv" {
			return []event.Event{testEvent("tv", base.Add(48 * time.Hour))}, nil
		}
		return []event.Event{testEvent("movies", base)}, nil
	}
	events, _ := f.Events(context.Background(), base, base.AddDate(0, 0, 7))
	if len(events) != 2 || events[0].Instance != "movies" || events[1].Instance != "tv" {
		t.Fatalf("events not merged+sorted: %+v", events)
	}
}

func TestCacheTTL(t *testing.T) {
	var calls atomic.Int64
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)

	f := New(testInstances[:1], 10*time.Minute)
	f.now = func() time.Time { return now }
	f.fetch = func(_ context.Context, inst config.Instance, start, _ time.Time) ([]event.Event, error) {
		calls.Add(1)
		return []event.Event{testEvent(inst.Name, start)}, nil
	}

	start := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 0, 30)

	f.Events(context.Background(), start, end)
	f.Events(context.Background(), start, end)
	// Sub-day differences must hit the same (day-truncated) cache entry.
	f.Events(context.Background(), start.Add(3*time.Hour), end.Add(5*time.Hour))
	if got := calls.Load(); got != 1 {
		t.Fatalf("upstream calls = %d, want 1 (cache + truncation)", got)
	}

	now = now.Add(11 * time.Minute)
	f.Events(context.Background(), start, end)
	if got := calls.Load(); got != 2 {
		t.Fatalf("upstream calls after TTL expiry = %d, want 2", got)
	}
}

func TestFailuresAreCached(t *testing.T) {
	var calls atomic.Int64
	f := New(testInstances[:1], time.Minute)
	f.fetch = func(_ context.Context, _ config.Instance, _, _ time.Time) ([]event.Event, error) {
		calls.Add(1)
		return nil, errors.New("boom")
	}
	start := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	f.Events(context.Background(), start, start.AddDate(0, 0, 7))
	f.Events(context.Background(), start, start.AddDate(0, 0, 7))
	if got := calls.Load(); got != 1 {
		t.Fatalf("upstream calls = %d, want 1 (failures cached)", got)
	}
}

func TestSingleflightCoalescesConcurrentMisses(t *testing.T) {
	var calls atomic.Int64
	release := make(chan struct{})

	f := New(testInstances[:1], time.Minute)
	f.fetch = func(_ context.Context, inst config.Instance, start, _ time.Time) ([]event.Event, error) {
		calls.Add(1)
		<-release
		return []event.Event{testEvent(inst.Name, start)}, nil
	}

	start := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 0, 7)

	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f.Events(context.Background(), start, end)
		}()
	}
	// Give the goroutines a moment to pile up on the singleflight key.
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()

	if got := calls.Load(); got != 1 {
		t.Fatalf("upstream calls = %d, want 1 (singleflight)", got)
	}
}
