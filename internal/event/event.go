// Package event defines the normalized calendar event model shared by the
// Radarr/Sonarr clients, the iCal generator, and the JSON API.
package event

import (
	"fmt"
	"sort"
	"time"
)

type Kind string

const (
	KindEpisode       Kind = "episode"
	KindMovieCinema   Kind = "movie-cinema"
	KindMovieDigital  Kind = "movie-digital"
	KindMoviePhysical Kind = "movie-physical"
)

type Event struct {
	UID        string    `json:"uid"`
	Instance   string    `json:"instance"`
	Source     string    `json:"source"` // "radarr" | "sonarr"
	Kind       Kind      `json:"kind"`
	Title      string    `json:"title"`    // movie title or series title
	Subtitle   string    `json:"subtitle"` // episode title, "" for movies
	Season     int       `json:"season"`
	Episode    int       `json:"episode"`
	Start      time.Time `json:"start"`
	End        time.Time `json:"end"`
	AllDay     bool      `json:"allDay"`
	Downloaded bool      `json:"downloaded"`
	Overview   string    `json:"overview"`
	PosterURL  string    `json:"posterUrl"`
}

// EpisodeUID returns the stable UID for a Sonarr episode event. UIDs must
// never change for the same upstream entity or subscribed calendar clients
// will duplicate events on refresh.
func EpisodeUID(instance string, episodeID int64) string {
	return fmt.Sprintf("sonarr-%s-%d@arr-cal-proxy", instance, episodeID)
}

// MovieUID returns the stable UID for one release-date event of a Radarr
// movie. release is one of "cinema", "digital", "physical".
func MovieUID(instance string, movieID int64, release string) string {
	return fmt.Sprintf("radarr-%s-%d-%s@arr-cal-proxy", instance, movieID, release)
}

// SxxEyy formats season/episode as "S02E05".
func (e Event) SxxEyy() string {
	return fmt.Sprintf("S%02dE%02d", e.Season, e.Episode)
}

// Sort orders events by start time, then UID for determinism.
func Sort(events []Event) {
	sort.Slice(events, func(i, j int) bool {
		if !events[i].Start.Equal(events[j].Start) {
			return events[i].Start.Before(events[j].Start)
		}
		return events[i].UID < events[j].UID
	})
}
