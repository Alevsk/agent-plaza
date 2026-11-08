package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/alevsk/agents-animated-workspace/internal/config"
	"github.com/alevsk/agents-animated-workspace/internal/core/domain"
)

type Adapter struct {
	cfg    config.RemoteConfig
	client *http.Client
}

func NewAdapter(cfg config.RemoteConfig) *Adapter {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &Adapter{
		cfg: cfg,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (a *Adapter) Name() string {
	return "remote"
}

func (a *Adapter) FetchState(ctx context.Context) (
	[]domain.AgentSession,
	[]domain.AccountSubscription,
	[]domain.OfflineAgent,
	error,
) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.cfg.Endpoint, nil)
	if err != nil {
		return nil, nil, nil, err
	}
	req.Header.Set("Accept", "application/json")
	if a.cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+a.cfg.Token)
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, nil, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, nil, fmt.Errorf("remote source returned HTTP %d", resp.StatusCode)
	}

	var snap domain.WorkspaceSnapshot
	if err := json.NewDecoder(resp.Body).Decode(&snap); err != nil {
		return nil, nil, nil, err
	}

	return snap.Agents, snap.Subscriptions, snap.OtherAgents, nil
}
