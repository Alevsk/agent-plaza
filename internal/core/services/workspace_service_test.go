package services

import (
	"context"
	"testing"
	"time"

	"github.com/alevsk/agent-plaza/internal/adapters/outbound/templates"
	"github.com/alevsk/agent-plaza/internal/config"
	"github.com/alevsk/agent-plaza/internal/core/domain"
)

type mockSource struct {
	agents []domain.AgentSession
}

func (m *mockSource) Name() string { return "mock" }
func (m *mockSource) FetchState(ctx context.Context) ([]domain.AgentSession, []domain.AccountSubscription, []domain.OfflineAgent, error) {
	return m.agents, nil, nil, nil
}

type mockPub struct {
	events []domain.WorkspaceEvent
}

func (p *mockPub) Broadcast(ev domain.WorkspaceEvent) {
	p.events = append(p.events, ev)
}

func TestWorkspaceServiceDiffAndTemplates(t *testing.T) {
	src := &mockSource{
		agents: []domain.AgentSession{
			{ID: "p1", Agent: "claude", DisplayName: "claude", Status: domain.StatusIdle, Task: "Task 1"},
		},
	}
	pub := &mockPub{}
	repo := templates.NewRepository(config.SceneConfig{
		ActiveTemplate: "office",
		TemplatesDir:   "../../../templates",
	})

	svc := NewWorkspaceService(src, repo, pub, "office", time.Second)
	svc.Refresh(context.Background())

	if len(pub.events) != 1 || pub.events[0].Type != "snapshot" {
		t.Fatalf("expected initial snapshot event, got %+v", pub.events)
	}

	// Simulate new agent joining + existing agent working
	src.agents = []domain.AgentSession{
		{ID: "p1", Agent: "claude", DisplayName: "claude", Status: domain.StatusWorking, Task: "Task 1"},
		{ID: "p2", Agent: "grok", DisplayName: "grok", Status: domain.StatusIdle, Task: "Task 2"},
	}
	svc.Refresh(context.Background())

	if len(pub.events) != 2 || pub.events[1].Type != "diff" {
		t.Fatalf("expected diff event, got %+v", pub.events)
	}
	diff := pub.events[1]
	if len(diff.Joined) != 1 || diff.Joined[0].ID != "p2" {
		t.Fatalf("expected p2 in Joined, got %+v", diff.Joined)
	}
	if len(diff.Updated) != 1 || diff.Updated[0].ID != "p1" {
		t.Fatalf("expected p1 in Updated, got %+v", diff.Updated)
	}

	// Verify templates load cleanly
	list, err := svc.ListTemplates()
	if err != nil || len(list) < 3 {
		t.Fatalf("expected at least 3 templates, got %v (err=%v)", list, err)
	}
}
