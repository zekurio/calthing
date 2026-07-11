package server

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/event"
	"github.com/zekurio/arr-cal-proxy/internal/fetch"
	"github.com/zekurio/arr-cal-proxy/internal/ical"
)

// window resolves the start/end query params, falling back to the configured
// default window around today.
func (s *Server) window(r *http.Request) (start, end time.Time, err error) {
	now := s.now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	start = today.AddDate(0, 0, -s.cfg.Calendar.PastDays)
	end = today.AddDate(0, 0, s.cfg.Calendar.FutureDays)

	if v := r.URL.Query().Get("start"); v != "" {
		start, err = time.ParseInLocation("2006-01-02", v, time.UTC)
		if err != nil {
			return start, end, fmt.Errorf("invalid start %q, want YYYY-MM-DD", v)
		}
	}
	if v := r.URL.Query().Get("end"); v != "" {
		end, err = time.ParseInLocation("2006-01-02", v, time.UTC)
		if err != nil {
			return start, end, fmt.Errorf("invalid end %q, want YYYY-MM-DD", v)
		}
	}
	if !end.After(start) {
		return start, end, fmt.Errorf("end must be after start")
	}
	return start, end, nil
}

func (s *Server) handleICS(w http.ResponseWriter, r *http.Request) {
	if token := s.cfg.Auth.Token; token != "" {
		got := r.URL.Query().Get("token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	start, end, err := s.window(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	events, _ := s.fetcher.Events(r.Context(), start, end)
	body := ical.Generate(events, s.cfg.Calendar.Name, s.now())

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Cache-Control", fmt.Sprintf("max-age=%d", int(s.cfg.Cache.TTL.Duration().Seconds())))
	w.Write([]byte(body))
}

type eventsResponse struct {
	Events    []event.Event          `json:"events"`
	Instances []fetch.InstanceStatus `json:"instances"`
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	start, end, err := s.window(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	events, statuses := s.fetcher.Events(r.Context(), start, end)
	if events == nil {
		events = []event.Event{}
	}
	writeJSON(w, eventsResponse{Events: events, Instances: statuses})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	// Health must not trigger upstream fetches; report static readiness.
	writeJSON(w, map[string]any{
		"status":    "ok",
		"instances": len(s.cfg.Instances),
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// spaHandler serves the embedded SPA, falling back to index.html for paths
// that don't match a real file (client-side routing).
func (s *Server) spaHandler() http.Handler {
	if s.static == nil {
		return http.NotFoundHandler()
	}
	fileServer := http.FileServerFS(s.static)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path != "/" {
			if _, err := fs.Stat(s.static, path[1:]); err != nil {
				r.URL.Path = "/"
			}
		}
		fileServer.ServeHTTP(w, r)
	})
}
