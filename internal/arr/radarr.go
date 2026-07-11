package arr

import (
	"context"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/event"
)

type radarrMovie struct {
	ID              int64      `json:"id"`
	Title           string     `json:"title"`
	InCinemas       time.Time  `json:"inCinemas"`
	DigitalRelease  time.Time  `json:"digitalRelease"`
	PhysicalRelease time.Time  `json:"physicalRelease"`
	HasFile         bool       `json:"hasFile"`
	Status          string     `json:"status"`
	Overview        string     `json:"overview"`
	Images          []arrImage `json:"images"`
}

type movieRelease struct {
	name string // UID fragment
	kind event.Kind
	date time.Time
}

func fetchRadarr(ctx context.Context, inst config.Instance, start, end time.Time) ([]event.Event, error) {
	q := calendarQuery(start, end, inst.IncludeUnmonitored)

	var movies []radarrMovie
	if err := getJSON(ctx, inst, "/api/v3/calendar", q, &movies); err != nil {
		return nil, err
	}

	var events []event.Event
	for _, m := range movies {
		releases := []movieRelease{
			{"cinema", event.KindMovieCinema, m.InCinemas},
			{"digital", event.KindMovieDigital, m.DigitalRelease},
			{"physical", event.KindMoviePhysical, m.PhysicalRelease},
		}
		for _, rel := range releases {
			if rel.date.IsZero() {
				continue
			}
			// Release timestamps are calendar dates, not instants: keep the
			// date as given (UTC) instead of converting through local zones.
			day := time.Date(rel.date.Year(), rel.date.Month(), rel.date.Day(), 0, 0, 0, 0, time.UTC)
			// Radarr returns the movie if any of its dates is in the window;
			// filter each release date individually.
			if day.Before(start) || !day.Before(end) {
				continue
			}
			events = append(events, event.Event{
				UID:        event.MovieUID(inst.Name, m.ID, rel.name),
				Instance:   inst.Name,
				Source:     config.TypeRadarr,
				Kind:       rel.kind,
				Title:      m.Title,
				Start:      day,
				End:        day.AddDate(0, 0, 1),
				AllDay:     true,
				Downloaded: m.HasFile,
				Overview:   m.Overview,
				PosterURL:  posterURL(m.Images),
			})
		}
	}
	return events, nil
}
