// Package server wires the HTTP API: the merged iCal feed, the JSON API for
// the SPA, and the embedded SPA itself.
package server

import (
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/fetch"
)

type Server struct {
	cfg     *config.Config
	fetcher *fetch.Fetcher
	static  fs.FS
	now     func() time.Time
}

// New builds the HTTP handler. static is the built SPA (index.html at its
// root); pass nil to disable static serving (tests).
func New(cfg *config.Config, fetcher *fetch.Fetcher, static fs.FS) http.Handler {
	s := &Server{cfg: cfg, fetcher: fetcher, static: static, now: time.Now}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /calendar.ics", s.handleICS)
	mux.HandleFunc("GET /api/events", s.handleEvents)
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.Handle("GET /", s.spaHandler())

	return logMiddleware(mux)
}

func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start).Round(time.Millisecond))
	})
}
