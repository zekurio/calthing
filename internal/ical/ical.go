// Package ical renders normalized events as an iCalendar feed.
package ical

import (
	"fmt"
	"time"

	ics "github.com/arran4/golang-ical"

	"github.com/zekurio/arr-cal-proxy/internal/event"
)

// Generate renders events into a VCALENDAR. now is injected for deterministic
// DTSTAMP values in tests.
func Generate(events []event.Event, calName string, now time.Time) string {
	cal := ics.NewCalendar()
	cal.SetMethod(ics.MethodPublish)
	cal.SetProductId("-//arr-cal-proxy//EN")
	cal.SetName(calName)
	cal.SetXWRCalName(calName)
	// Hint clients to re-poll hourly.
	cal.SetRefreshInterval("PT1H")
	cal.SetXPublishedTTL("PT1H")

	for _, e := range events {
		ev := cal.AddEvent(e.UID)
		ev.SetDtStampTime(now.UTC())
		ev.SetModifiedAt(now.UTC())
		ev.SetSummary(summary(e))
		if e.Overview != "" {
			ev.SetDescription(e.Overview)
		}
		ev.SetProperty(ics.ComponentPropertyCategories, e.Instance)
		if e.AllDay {
			ev.SetAllDayStartAt(e.Start)
			ev.SetAllDayEndAt(e.End)
		} else {
			ev.SetStartAt(e.Start.UTC())
			ev.SetEndAt(e.End.UTC())
		}
	}
	// RFC 5545 requires CRLF; the library defaults to platform line endings.
	return cal.Serialize(ics.WithNewLineWindows)
}

func summary(e event.Event) string {
	var s string
	switch e.Kind {
	case event.KindEpisode:
		s = fmt.Sprintf("%s %s", e.Title, e.SxxEyy())
		if e.Subtitle != "" {
			s += " - " + e.Subtitle
		}
	case event.KindMovieCinema:
		s = e.Title + " (Cinema Release)"
	case event.KindMovieDigital:
		s = e.Title + " (Digital Release)"
	case event.KindMoviePhysical:
		s = e.Title + " (Physical Release)"
	default:
		s = e.Title
	}
	if e.Downloaded {
		s = "✔ " + s
	}
	return s
}
