package ports

import (
	"context"

	"github.com/alevsk/agents-animated-workspace/internal/core/domain"
)

// DataSourcePort defines the outbound port for fetching agent sessions and subscription quotas.
// Implementations can discover data locally (Herdr CLI + local session files) or fetch from a remote endpoint.
type DataSourcePort interface {
	Name() string
	FetchState(ctx context.Context) (
		agents []domain.AgentSession,
		subscriptions []domain.AccountSubscription,
		otherAgents []domain.OfflineAgent,
		err error,
	)
}

// TemplateRepositoryPort defines the outbound port for discovering and loading scene templates.
type TemplateRepositoryPort interface {
	ListTemplates() ([]domain.TemplateSummary, error)
	GetTemplate(id string) (*domain.TemplateManifest, error)
}

// EventPublisherPort defines the outbound port for broadcasting real-time workspace events.
type EventPublisherPort interface {
	Broadcast(event domain.WorkspaceEvent)
}
