package arr

import (
	"context"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/event"
)

const defaultEpisodeRuntime = 30 * time.Minute

type sonarrEpisode struct {
	ID            int64     `json:"id"`
	SeriesID      int64     `json:"seriesId"`
	Title         string    `json:"title"`
	SeasonNumber  int       `json:"seasonNumber"`
	EpisodeNumber int       `json:"episodeNumber"`
	AirDateUTC    time.Time `json:"airDateUtc"`
	HasFile       bool      `json:"hasFile"`
	Monitored     bool      `json:"monitored"`
	Overview      string    `json:"overview"`
	Series        struct {
		Title   string     `json:"title"`
		Runtime int        `json:"runtime"` // minutes
		Images  []arrImage `json:"images"`
	} `json:"series"`
}

func fetchSonarr(ctx context.Context, inst config.Instance, start, end time.Time) ([]event.Event, error) {
	q := calendarQuery(start, end, inst.IncludeUnmonitored)
	q.Set("includeSeries", "true")

	var episodes []sonarrEpisode
	if err := getJSON(ctx, inst, "/api/v3/calendar", q, &episodes); err != nil {
		return nil, err
	}

	events := make([]event.Event, 0, len(episodes))
	for _, ep := range episodes {
		if ep.AirDateUTC.IsZero() {
			continue
		}
		runtime := time.Duration(ep.Series.Runtime) * time.Minute
		if runtime <= 0 {
			runtime = defaultEpisodeRuntime
		}
		events = append(events, event.Event{
			UID:        event.EpisodeUID(inst.Name, ep.ID),
			Instance:   inst.Name,
			Source:     config.TypeSonarr,
			Kind:       event.KindEpisode,
			Title:      ep.Series.Title,
			Subtitle:   ep.Title,
			Season:     ep.SeasonNumber,
			Episode:    ep.EpisodeNumber,
			Start:      ep.AirDateUTC.UTC(),
			End:        ep.AirDateUTC.UTC().Add(runtime),
			Downloaded: ep.HasFile,
			Overview:   ep.Overview,
			PosterURL:  posterURL(ep.Series.Images),
		})
	}
	return events, nil
}
