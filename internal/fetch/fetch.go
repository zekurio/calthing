// Package fetch fans calendar requests out to all configured instances,
// caches per-instance results with a TTL, and coalesces concurrent refreshes.
package fetch

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/zekurio/arr-cal-proxy/internal/arr"
	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/event"
)

// FetchFunc fetches the calendar of one instance; swappable in tests.
type FetchFunc func(ctx context.Context, inst config.Instance, start, end time.Time) ([]event.Event, error)

// InstanceStatus reports the outcome of the most recent fetch per instance.
type InstanceStatus struct {
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	OK        bool      `json:"ok"`
	Error     string    `json:"error,omitempty"`
	FetchedAt time.Time `json:"fetchedAt"`
}

type cacheEntry struct {
	events  []event.Event
	status  InstanceStatus
	expires time.Time
}

type Fetcher struct {
	instances []config.Instance
	ttl       time.Duration
	fetch     FetchFunc
	now       func() time.Time

	mu    sync.Mutex
	cache map[string]cacheEntry
	group singleflight.Group
}

func New(instances []config.Instance, ttl time.Duration) *Fetcher {
	return NewWithFetchFunc(instances, ttl, arr.FetchCalendar)
}

// NewWithFetchFunc is New with a custom per-instance fetch function, for tests.
func NewWithFetchFunc(instances []config.Instance, ttl time.Duration, fn FetchFunc) *Fetcher {
	return &Fetcher{
		instances: instances,
		ttl:       ttl,
		fetch:     fn,
		now:       time.Now,
		cache:     make(map[string]cacheEntry),
	}
}

// Events fetches all instances concurrently for the given window and returns
// the merged, sorted events plus per-instance statuses. A failing instance
// contributes an error status but never fails the whole call.
func (f *Fetcher) Events(ctx context.Context, start, end time.Time) ([]event.Event, []InstanceStatus) {
	// Truncate to whole days so calendar-client polls and SPA month
	// navigation share cache entries.
	start = start.UTC().Truncate(24 * time.Hour)
	end = end.UTC().Truncate(24 * time.Hour)

	type result struct {
		events []event.Event
		status InstanceStatus
	}
	results := make([]result, len(f.instances))

	var wg sync.WaitGroup
	for i, inst := range f.instances {
		wg.Add(1)
		go func() {
			defer wg.Done()
			events, status := f.instanceEvents(ctx, inst, start, end)
			results[i] = result{events, status}
		}()
	}
	wg.Wait()

	var merged []event.Event
	statuses := make([]InstanceStatus, 0, len(f.instances))
	for _, r := range results {
		merged = append(merged, r.events...)
		statuses = append(statuses, r.status)
	}
	event.Sort(merged)
	return merged, statuses
}

func (f *Fetcher) instanceEvents(ctx context.Context, inst config.Instance, start, end time.Time) ([]event.Event, InstanceStatus) {
	key := fmt.Sprintf("%s|%d|%d", inst.Name, start.Unix(), end.Unix())

	f.mu.Lock()
	entry, ok := f.cache[key]
	f.mu.Unlock()
	if ok && f.now().Before(entry.expires) {
		return entry.events, entry.status
	}

	v, _, _ := f.group.Do(key, func() (any, error) {
		// Re-check under singleflight: a concurrent caller may have refreshed.
		f.mu.Lock()
		entry, ok := f.cache[key]
		f.mu.Unlock()
		if ok && f.now().Before(entry.expires) {
			return entry, nil
		}

		events, err := f.fetch(ctx, inst, start, end)
		status := InstanceStatus{
			Name:      inst.Name,
			Type:      inst.Type,
			OK:        err == nil,
			FetchedAt: f.now().UTC(),
		}
		if err != nil {
			status.Error = err.Error()
			slog.Warn("instance fetch failed", "instance", inst.Name, "error", err)
			// Cache failures too (with the same TTL) so a dead instance is
			// not hammered on every poll.
		}
		entry = cacheEntry{events: events, status: status, expires: f.now().Add(f.ttl)}
		f.mu.Lock()
		f.cache[key] = entry
		f.mu.Unlock()
		return entry, nil
	})
	entry = v.(cacheEntry)
	return entry.events, entry.status
}
