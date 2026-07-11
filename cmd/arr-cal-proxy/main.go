package main

import (
	"context"
	"errors"
	"flag"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zekurio/arr-cal-proxy/frontend"
	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/fetch"
	"github.com/zekurio/arr-cal-proxy/internal/server"
)

func main() {
	defaultConfig := "config.yaml"
	if v := os.Getenv("ARR_CAL_PROXY_CONFIG"); v != "" {
		defaultConfig = v
	}
	configPath := flag.String("config", defaultConfig, "path to config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	static, err := fs.Sub(frontend.Dist, "dist")
	if err != nil {
		slog.Error("failed to open embedded frontend", "error", err)
		os.Exit(1)
	}

	fetcher := fetch.New(cfg.Instances, cfg.Cache.TTL.Duration())
	handler := server.New(cfg, fetcher, static)

	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("listening", "addr", cfg.Listen, "instances", len(cfg.Instances))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}
