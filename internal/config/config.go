// Package config loads and validates the arr-cal-proxy YAML configuration.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Duration wraps time.Duration with YAML unmarshalling from strings like "10m".
type Duration time.Duration

func (d *Duration) UnmarshalYAML(node *yaml.Node) error {
	var s string
	if err := node.Decode(&s); err != nil {
		return err
	}
	parsed, err := time.ParseDuration(s)
	if err != nil {
		return fmt.Errorf("invalid duration %q: %w", s, err)
	}
	*d = Duration(parsed)
	return nil
}

func (d Duration) Duration() time.Duration { return time.Duration(d) }

const (
	TypeRadarr = "radarr"
	TypeSonarr = "sonarr"
)

type Instance struct {
	Name               string `yaml:"name"`
	Type               string `yaml:"type"`
	URL                string `yaml:"url"`
	APIKey             string `yaml:"api_key"`
	IncludeUnmonitored bool   `yaml:"include_unmonitored"`
}

type Cache struct {
	TTL Duration `yaml:"ttl"`
}

type Calendar struct {
	PastDays   int    `yaml:"past_days"`
	FutureDays int    `yaml:"future_days"`
	Name       string `yaml:"name"`
}

type Auth struct {
	Token string `yaml:"token"`
}

type Config struct {
	Listen    string     `yaml:"listen"`
	Cache     Cache      `yaml:"cache"`
	Calendar  Calendar   `yaml:"calendar"`
	Auth      Auth       `yaml:"auth"`
	Instances []Instance `yaml:"instances"`
}

// Load reads the YAML file at path, expands ${VAR} references from the
// environment, applies defaults and env overrides, and validates the result.
func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	return Parse(raw)
}

// Parse is Load without the file read; exported for tests.
func Parse(raw []byte) (*Config, error) {
	expanded, err := expandEnv(string(raw))
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		Listen: ":8080",
		Cache:  Cache{TTL: Duration(10 * time.Minute)},
		Calendar: Calendar{
			PastDays:   30,
			FutureDays: 90,
			Name:       "Media Calendar",
		},
	}
	if err := yaml.Unmarshal([]byte(expanded), cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	if v := os.Getenv("ARR_CAL_PROXY_LISTEN"); v != "" {
		cfg.Listen = v
	}
	if v := os.Getenv("ARR_CAL_PROXY_TOKEN"); v != "" {
		cfg.Auth.Token = v
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// expandEnv expands $VAR / ${VAR} references and errors on unset variables so
// a missing secret fails loudly at startup instead of producing an empty api key.
func expandEnv(s string) (string, error) {
	var missing []string
	expanded := os.Expand(s, func(name string) string {
		if v, ok := os.LookupEnv(name); ok {
			return v
		}
		missing = append(missing, name)
		return ""
	})
	if len(missing) > 0 {
		return "", fmt.Errorf("config references unset environment variables: %s", strings.Join(missing, ", "))
	}
	return expanded, nil
}

func (c *Config) validate() error {
	if len(c.Instances) == 0 {
		return fmt.Errorf("config: at least one instance is required")
	}
	if c.Cache.TTL.Duration() <= 0 {
		return fmt.Errorf("config: cache.ttl must be positive")
	}
	if c.Calendar.PastDays < 0 || c.Calendar.FutureDays < 0 {
		return fmt.Errorf("config: calendar.past_days and future_days must be >= 0")
	}
	seen := make(map[string]bool, len(c.Instances))
	for i, inst := range c.Instances {
		if inst.Name == "" {
			return fmt.Errorf("config: instances[%d]: name is required", i)
		}
		if seen[inst.Name] {
			return fmt.Errorf("config: duplicate instance name %q", inst.Name)
		}
		seen[inst.Name] = true
		if inst.Type != TypeRadarr && inst.Type != TypeSonarr {
			return fmt.Errorf("config: instance %q: type must be %q or %q, got %q", inst.Name, TypeRadarr, TypeSonarr, inst.Type)
		}
		u, err := url.Parse(inst.URL)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return fmt.Errorf("config: instance %q: invalid url %q", inst.Name, inst.URL)
		}
		if inst.APIKey == "" {
			return fmt.Errorf("config: instance %q: api_key is required", inst.Name)
		}
	}
	return nil
}
