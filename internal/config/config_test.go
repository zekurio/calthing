package config

import (
	"strings"
	"testing"
	"time"
)

const validYAML = `
listen: ":9090"
cache:
  ttl: 5m
calendar:
  past_days: 7
  future_days: 14
  name: "Test Calendar"
auth:
  token: "secret"
instances:
  - name: movies
    type: radarr
    url: http://localhost:7878
    api_key: abc123
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: def456
    include_unmonitored: true
`

func TestParseValid(t *testing.T) {
	cfg, err := Parse([]byte(validYAML))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.Listen != ":9090" {
		t.Errorf("Listen = %q, want :9090", cfg.Listen)
	}
	if cfg.Cache.TTL.Duration() != 5*time.Minute {
		t.Errorf("TTL = %v, want 5m", cfg.Cache.TTL.Duration())
	}
	if cfg.Calendar.PastDays != 7 || cfg.Calendar.FutureDays != 14 {
		t.Errorf("window = -%d/+%d, want -7/+14", cfg.Calendar.PastDays, cfg.Calendar.FutureDays)
	}
	if cfg.Auth.Token != "secret" {
		t.Errorf("Token = %q", cfg.Auth.Token)
	}
	if len(cfg.Instances) != 2 {
		t.Fatalf("len(Instances) = %d, want 2", len(cfg.Instances))
	}
	if !cfg.Instances[1].IncludeUnmonitored {
		t.Error("tv instance should include unmonitored")
	}
}

func TestParseDefaults(t *testing.T) {
	minimal := `
instances:
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: key
`
	cfg, err := Parse([]byte(minimal))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.Listen != ":8080" {
		t.Errorf("default Listen = %q, want :8080", cfg.Listen)
	}
	if cfg.Cache.TTL.Duration() != 10*time.Minute {
		t.Errorf("default TTL = %v, want 10m", cfg.Cache.TTL.Duration())
	}
	if cfg.Calendar.PastDays != 30 || cfg.Calendar.FutureDays != 90 {
		t.Errorf("default window = -%d/+%d, want -30/+90", cfg.Calendar.PastDays, cfg.Calendar.FutureDays)
	}
	if cfg.Calendar.Name != "Media Calendar" {
		t.Errorf("default Name = %q", cfg.Calendar.Name)
	}
}

func TestEnvExpansion(t *testing.T) {
	t.Setenv("TEST_ARR_KEY", "expanded-key")
	yaml := `
instances:
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: ${TEST_ARR_KEY}
`
	cfg, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.Instances[0].APIKey != "expanded-key" {
		t.Errorf("APIKey = %q, want expanded-key", cfg.Instances[0].APIKey)
	}
}

func TestEnvExpansionUnset(t *testing.T) {
	yaml := `
instances:
  - name: tv
    type: sonarr
    url: http://localhost:8989
    api_key: ${DEFINITELY_UNSET_VAR_12345}
`
	_, err := Parse([]byte(yaml))
	if err == nil || !strings.Contains(err.Error(), "DEFINITELY_UNSET_VAR_12345") {
		t.Errorf("want unset-variable error naming the variable, got %v", err)
	}
}

func TestEnvOverrides(t *testing.T) {
	t.Setenv("ARR_CAL_PROXY_LISTEN", ":7777")
	t.Setenv("ARR_CAL_PROXY_TOKEN", "envtoken")
	cfg, err := Parse([]byte(validYAML))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.Listen != ":7777" {
		t.Errorf("Listen = %q, want env override :7777", cfg.Listen)
	}
	if cfg.Auth.Token != "envtoken" {
		t.Errorf("Token = %q, want env override envtoken", cfg.Auth.Token)
	}
}

func TestValidation(t *testing.T) {
	cases := []struct {
		name    string
		yaml    string
		wantErr string
	}{
		{"no instances", `listen: ":8080"`, "at least one instance"},
		{"bad type", `
instances:
  - {name: x, type: lidarr, url: "http://a", api_key: k}
`, "type must be"},
		{"duplicate names", `
instances:
  - {name: x, type: radarr, url: "http://a", api_key: k}
  - {name: x, type: sonarr, url: "http://b", api_key: k}
`, "duplicate instance name"},
		{"missing api key", `
instances:
  - {name: x, type: radarr, url: "http://a", api_key: ""}
`, "api_key is required"},
		{"bad url", `
instances:
  - {name: x, type: radarr, url: "not a url", api_key: k}
`, "invalid url"},
		{"missing name", `
instances:
  - {name: "", type: radarr, url: "http://a", api_key: k}
`, "name is required"},
		{"bad duration", `
cache: {ttl: "banana"}
instances:
  - {name: x, type: radarr, url: "http://a", api_key: k}
`, "invalid duration"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Parse([]byte(tc.yaml))
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("want error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}
