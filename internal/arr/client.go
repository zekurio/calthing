// Package arr contains HTTP clients for the Radarr and Sonarr v3 calendar
// APIs, normalizing their responses into event.Event values.
package arr

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/zekurio/arr-cal-proxy/internal/config"
	"github.com/zekurio/arr-cal-proxy/internal/event"
)

var httpClient = &http.Client{Timeout: 15 * time.Second}

// arrImage is the shared image entry shape of Radarr and Sonarr responses.
type arrImage struct {
	CoverType string `json:"coverType"`
	URL       string `json:"url"`       // instance-local, requires auth; unused
	RemoteURL string `json:"remoteUrl"` // public TMDB/fanart URL
}

// posterURL picks the public poster URL out of an image list, or "".
func posterURL(images []arrImage) string {
	for _, img := range images {
		if img.CoverType == "poster" && img.RemoteURL != "" {
			return img.RemoteURL
		}
	}
	return ""
}

// getJSON performs an authenticated GET against an instance API and decodes
// the JSON response into out.
func getJSON(ctx context.Context, inst config.Instance, path string, query url.Values, out any) error {
	u, err := url.Parse(inst.URL)
	if err != nil {
		return fmt.Errorf("instance %s: parse url: %w", inst.Name, err)
	}
	u = u.JoinPath(path)
	u.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return fmt.Errorf("instance %s: build request: %w", inst.Name, err)
	}
	req.Header.Set("X-Api-Key", inst.APIKey)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("instance %s: %w", inst.Name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("instance %s: %s returned %d: %s", inst.Name, path, resp.StatusCode, body)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("instance %s: decode response: %w", inst.Name, err)
	}
	return nil
}

// calendarQuery builds the shared start/end query params. RFC3339 UTC bounds
// avoid day-boundary ambiguity; both Radarr and Sonarr accept this format.
func calendarQuery(start, end time.Time, unmonitored bool) url.Values {
	q := url.Values{}
	q.Set("start", start.UTC().Format(time.RFC3339))
	q.Set("end", end.UTC().Format(time.RFC3339))
	q.Set("unmonitored", fmt.Sprintf("%t", unmonitored))
	return q
}

// FetchCalendar dispatches to the right client for the instance type.
func FetchCalendar(ctx context.Context, inst config.Instance, start, end time.Time) ([]event.Event, error) {
	switch inst.Type {
	case config.TypeSonarr:
		return fetchSonarr(ctx, inst, start, end)
	case config.TypeRadarr:
		return fetchRadarr(ctx, inst, start, end)
	default:
		return nil, fmt.Errorf("instance %s: unknown type %q", inst.Name, inst.Type)
	}
}
