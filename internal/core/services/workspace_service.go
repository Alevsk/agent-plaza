package services

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/alevsk/agents-animated-workspace/internal/core/domain"
	"github.com/alevsk/agents-animated-workspace/internal/core/ports"
)

type WorkspaceService struct {
	source         ports.DataSourcePort
	templates      ports.TemplateRepositoryPort
	publisher      ports.EventPublisherPort
	pollInterval   time.Duration
	mu             sync.RWMutex
	activeTemplate string
	lastSnapshot   *domain.WorkspaceSnapshot
	simAgents      []domain.AgentSession
	statusOverride map[string]domain.AgentStatus
	simSeq         int
}

func NewWorkspaceService(
	source ports.DataSourcePort,
	templates ports.TemplateRepositoryPort,
	publisher ports.EventPublisherPort,
	activeTemplate string,
	pollInterval time.Duration,
) *WorkspaceService {
	if activeTemplate == "" {
		activeTemplate = "office"
	}
	if pollInterval < 500*time.Millisecond {
		pollInterval = 2500 * time.Millisecond
	}
	return &WorkspaceService{
		source:         source,
		templates:      templates,
		publisher:      publisher,
		pollInterval:   pollInterval,
		activeTemplate: activeTemplate,
		statusOverride: make(map[string]domain.AgentStatus),
	}
}

func (s *WorkspaceService) Start(ctx context.Context) {
	// Initial fetch
	s.Refresh(ctx)

	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.Refresh(ctx)
		}
	}
}

func (s *WorkspaceService) Refresh(ctx context.Context) {
	agents, subs, others, err := s.source.FetchState(ctx)
	if err != nil {
		return
	}

	s.mu.Lock()
	// Apply status overrides & append simulated agents
	merged := make([]domain.AgentSession, 0, len(agents)+len(s.simAgents))
	for _, ag := range agents {
		if ov, ok := s.statusOverride[ag.ID]; ok {
			ag.Status = ov
		}
		merged = append(merged, ag)
	}
	for _, sim := range s.simAgents {
		if ov, ok := s.statusOverride[sim.ID]; ok {
			sim.Status = ov
		}
		merged = append(merged, sim)
	}

	working, idle := 0, 0
	for _, ag := range merged {
		if ag.Status == domain.StatusWorking {
			working++
		} else {
			idle++
		}
	}

	nextSnap := &domain.WorkspaceSnapshot{
		Summary: domain.Summary{
			TotalAgents: len(merged),
			Working:     working,
			Idle:        idle,
		},
		Agents:         merged,
		Subscriptions:  subs,
		OtherAgents:    others,
		ActiveTemplate: s.activeTemplate,
		SourceType:     s.source.Name(),
		UpdatedAt:      time.Now(),
	}

	prevSnap := s.lastSnapshot
	s.lastSnapshot = nextSnap
	s.mu.Unlock()

	if prevSnap == nil {
		s.publisher.Broadcast(domain.WorkspaceEvent{
			Type:      "snapshot",
			Snapshot:  nextSnap,
			Timestamp: nextSnap.UpdatedAt,
		})
		return
	}

	joined, left, updated, changed := diffSnapshots(prevSnap, nextSnap)
	if changed {
		s.publisher.Broadcast(domain.WorkspaceEvent{
			Type:      "diff",
			Snapshot:  nextSnap,
			Joined:    joined,
			Left:      left,
			Updated:   updated,
			Timestamp: nextSnap.UpdatedAt,
		})
	}
}

func (s *WorkspaceService) GetSnapshot() *domain.WorkspaceSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.lastSnapshot != nil {
		return s.lastSnapshot
	}
	return &domain.WorkspaceSnapshot{
		ActiveTemplate: s.activeTemplate,
		SourceType:     s.source.Name(),
		UpdatedAt:      time.Now(),
	}
}

func (s *WorkspaceService) ListTemplates() ([]domain.TemplateSummary, error) {
	return s.templates.ListTemplates()
}

func (s *WorkspaceService) GetTemplate(id string) (*domain.TemplateManifest, error) {
	if id == "" {
		s.mu.RLock()
		id = s.activeTemplate
		s.mu.RUnlock()
	}
	return s.templates.GetTemplate(id)
}

func (s *WorkspaceService) SetActiveTemplate(id string) (*domain.TemplateManifest, error) {
	mf, err := s.templates.GetTemplate(id)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.activeTemplate = mf.ID
	if s.lastSnapshot != nil {
		s.lastSnapshot.ActiveTemplate = mf.ID
	}
	snap := s.lastSnapshot
	s.mu.Unlock()

	s.publisher.Broadcast(domain.WorkspaceEvent{
		Type:      "template_changed",
		Snapshot:  snap,
		Template:  mf,
		Timestamp: time.Now(),
	})
	return mf, nil
}

// SpawnSimulatedAgent spawns a live simulated agent so the user can test real-time join animations on demand.
func (s *WorkspaceService) SpawnSimulatedAgent(agentType, task string, status domain.AgentStatus) domain.AgentSession {
	s.mu.Lock()
	s.simSeq++
	seq := s.simSeq
	if agentType == "" {
		types := []string{"claude", "agy", "codex", "grok", "opencode"}
		agentType = types[seq%len(types)]
	}
	if task == "" {
		tasks := []string{
			"Refactoring hexagonal ports & WebSocket hub",
			"Optimizing pixel sprite matrix shaders",
			"Auditing multi-account OAuth quota cache",
			"Running e2e test suite on agent-usage",
			"Synthesizing scene template manifest",
		}
		task = tasks[seq%len(tasks)]
	}
	if status == "" {
		status = domain.StatusWorking
	}
	pct := 15 + (seq*17)%70
	tok := fmt.Sprintf("%dk", 40+(seq*35)%300)
	cwd, err := os.Getwd()
	if err != nil || cwd == "" {
		cwd = "/workspace"
	}
	sim := domain.AgentSession{
		ID:             fmt.Sprintf("sim:%s:%d", agentType, seq),
		Agent:          agentType,
		AccountLabel:   "sim",
		DisplayName:    agentType + "·sim",
		Status:         status,
		Task:           task,
		CWD:            cwd,
		WorkspaceID:    "wSim",
		PaneID:         fmt.Sprintf("wSim:p%d", seq),
		SessionID:      fmt.Sprintf("sim-session-%d", seq),
		ContextRaw:     fmt.Sprintf("%d%% · %s", pct, tok),
		ContextTokens:  tok,
		ContextPercent: pct,
		CharacterKey:   agentType,
		Simulated:      true,
	}
	s.simAgents = append(s.simAgents, sim)
	s.mu.Unlock()

	s.Refresh(context.Background())
	return sim
}

func (s *WorkspaceService) RemoveSimulatedAgent(id string) {
	s.mu.Lock()
	var filtered []domain.AgentSession
	for _, a := range s.simAgents {
		if a.ID != id && id != "all" {
			filtered = append(filtered, a)
		}
	}
	s.simAgents = filtered
	if id == "all" {
		s.statusOverride = make(map[string]domain.AgentStatus)
	} else {
		delete(s.statusOverride, id)
	}
	s.mu.Unlock()
	s.Refresh(context.Background())
}

func (s *WorkspaceService) ToggleAgentStatus(id string) {
	s.mu.Lock()
	var current domain.AgentStatus = domain.StatusIdle
	if s.lastSnapshot != nil {
		for _, a := range s.lastSnapshot.Agents {
			if a.ID == id {
				current = a.Status
				break
			}
		}
	}
	if current == domain.StatusWorking {
		s.statusOverride[id] = domain.StatusIdle
	} else {
		s.statusOverride[id] = domain.StatusWorking
	}
	s.mu.Unlock()
	s.Refresh(context.Background())
}

func diffSnapshots(prev, next *domain.WorkspaceSnapshot) (
	joined []domain.AgentSession,
	left []string,
	updated []domain.AgentSession,
	changed bool,
) {
	prevMap := make(map[string]domain.AgentSession, len(prev.Agents))
	for _, a := range prev.Agents {
		prevMap[a.ID] = a
	}
	nextMap := make(map[string]domain.AgentSession, len(next.Agents))
	for _, a := range next.Agents {
		nextMap[a.ID] = a
		if old, exists := prevMap[a.ID]; !exists {
			joined = append(joined, a)
			changed = true
		} else if old.Status != a.Status || old.Task != a.Task || old.ContextRaw != a.ContextRaw || old.DisplayName != a.DisplayName || old.Focused != a.Focused {
			updated = append(updated, a)
			changed = true
		}
	}
	for id := range prevMap {
		if _, exists := nextMap[id]; !exists {
			left = append(left, id)
			changed = true
		}
	}
	if len(prev.Subscriptions) != len(next.Subscriptions) {
		changed = true
	} else {
		for i := range next.Subscriptions {
			if len(prev.Subscriptions[i].Windows) != len(next.Subscriptions[i].Windows) {
				changed = true
				break
			}
			for j := range next.Subscriptions[i].Windows {
				if prev.Subscriptions[i].Windows[j] != next.Subscriptions[i].Windows[j] {
					changed = true
					break
				}
			}
		}
	}
	return
}
