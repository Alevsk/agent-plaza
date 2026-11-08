package domain

import "time"

// AgentStatus represents whether an agent is actively working or idle.
type AgentStatus string

const (
	StatusWorking AgentStatus = "working"
	StatusIdle    AgentStatus = "idle"
)

// Summary holds high-level counts of active agents.
type Summary struct {
	TotalAgents int `json:"total_agents"`
	Working     int `json:"working"`
	Idle        int `json:"idle"`
}

// AgentSession represents a single live AI agent session/pane in the workspace.
type AgentSession struct {
	ID             string      `json:"id"`
	Agent          string      `json:"agent"`
	AccountLabel   string      `json:"account_label,omitempty"`
	DisplayName    string      `json:"display_name"`
	Status         AgentStatus `json:"status"`
	Task           string      `json:"task"`
	CWD            string      `json:"cwd,omitempty"`
	WorkspaceID    string      `json:"workspace_id,omitempty"`
	PaneID         string      `json:"pane_id,omitempty"`
	SessionID      string      `json:"session_id,omitempty"`
	Focused        bool        `json:"focused,omitempty"`
	ContextRaw     string      `json:"context_raw"`
	ContextTokens  string      `json:"context_tokens"`
	ContextPercent int         `json:"context_percent"` // -1 when unknown, 0-100 when percentage is known
	CharacterKey   string      `json:"character_key"`
	Simulated      bool        `json:"simulated,omitempty"`
}

// LimitWindow represents one quota window row inside an AccountSubscription.
type LimitWindow struct {
	Label     string `json:"label"`
	UsagePct  int    `json:"usage_pct"` // -1 for non-percentage rows like "34k req · 7 sess"
	UsageText string `json:"usage_text"`
	Resets    string `json:"resets"`
}

// AccountSubscription represents a grouped agent + account subscription quota block.
type AccountSubscription struct {
	Agent          string        `json:"agent"`
	AccountID      string        `json:"account_id"`
	AccountDisplay string        `json:"account_display"`
	Plan           string        `json:"plan"`
	Windows        []LimitWindow `json:"windows"`
}

// OfflineAgent represents an installed or fallback agent with no active subscription rows.
type OfflineAgent struct {
	Agent    string `json:"agent"`
	Provider string `json:"provider"`
	Limit    string `json:"limit"`
}

// WorkspaceSnapshot is the complete state of agents, quotas, and active scene template.
type WorkspaceSnapshot struct {
	Summary        Summary               `json:"summary"`
	Agents         []AgentSession        `json:"agents"`
	Subscriptions  []AccountSubscription `json:"subscriptions"`
	OtherAgents    []OfflineAgent        `json:"other_agents"`
	ActiveTemplate string                `json:"active_template"`
	SourceType     string                `json:"source_type"`
	UpdatedAt      time.Time             `json:"updated_at"`
}

// WorkspaceEvent is pushed in real-time over WebSockets.
type WorkspaceEvent struct {
	Type      string             `json:"type"` // "snapshot", "diff", "template_changed"
	Snapshot  *WorkspaceSnapshot `json:"snapshot,omitempty"`
	Joined    []AgentSession     `json:"joined,omitempty"`
	Left      []string           `json:"left,omitempty"`
	Updated   []AgentSession     `json:"updated,omitempty"`
	Template  *TemplateManifest  `json:"template,omitempty"`
	Timestamp time.Time          `json:"timestamp"`
}

// TemplateSummary is a lightweight descriptor for listing available scene templates.
type TemplateSummary struct {
	ID          string `json:"id" yaml:"id"`
	Name        string `json:"name" yaml:"name"`
	Description string `json:"description" yaml:"description"`
	ThemeBadge  string `json:"theme_badge" yaml:"theme_badge"`
}

// TemplateManifest defines a self-contained visual scene template loaded from YAML.
type TemplateManifest struct {
	ID           string                       `json:"id" yaml:"id"`
	Name         string                       `json:"name" yaml:"name"`
	Description  string                       `json:"description" yaml:"description"`
	ThemeBadge   string                       `json:"theme_badge" yaml:"theme_badge"`
	Theme        TemplateTheme                `json:"theme" yaml:"theme"`
	Grid         TemplateGrid                 `json:"grid" yaml:"grid"`
	Zones        []TemplateZone               `json:"zones" yaml:"zones"`
	Workstations []TemplateWorkstation        `json:"workstations" yaml:"workstations"`
	Waypoints    []TemplateWaypoint           `json:"waypoints" yaml:"waypoints"`
	Props        []TemplateProp               `json:"props" yaml:"props"`
	Characters   map[string]CharacterStyle    `json:"characters" yaml:"characters"`
	Companions   []CompanionConfig            `json:"companions" yaml:"companions"`
}

type TemplateTheme struct {
	Background     string `json:"background" yaml:"background"`
	WallColor      string `json:"wall_color" yaml:"wall_color"`
	WallTrim       string `json:"wall_trim" yaml:"wall_trim"`
	FloorPrimary   string `json:"floor_primary" yaml:"floor_primary"`
	FloorSecondary string `json:"floor_secondary" yaml:"floor_secondary"`
	FloorAccent    string `json:"floor_accent" yaml:"floor_accent"`
	GridLine       string `json:"grid_line" yaml:"grid_line"`
	AccentColor    string `json:"accent_color" yaml:"accent_color"`
	SecondaryColor string `json:"secondary_color" yaml:"secondary_color"`
	SpawnEffect    string `json:"spawn_effect" yaml:"spawn_effect"` // "matrix", "portal", "beam", "smoke"
	SpawnColor     string `json:"spawn_color" yaml:"spawn_color"`
	Particles      string `json:"particles" yaml:"particles"` // "dust", "neon", "embers", "leaves"
	WorkingVerb    string `json:"working_verb" yaml:"working_verb"`
	IdleVerb       string `json:"idle_verb" yaml:"idle_verb"`
}

type TemplateGrid struct {
	Cols     int      `json:"cols" yaml:"cols"`
	Rows     int      `json:"rows" yaml:"rows"`
	TileSize int      `json:"tile_size" yaml:"tile_size"`
	Layout   []string `json:"layout" yaml:"layout"` // ASCII map rows: W=wall, .=floor, C=carpet, L=lounge, V=void
}

type TemplateZone struct {
	ID    string `json:"id" yaml:"id"`
	Label string `json:"label" yaml:"label"`
	Color string `json:"color" yaml:"color"`
	Col   int    `json:"col" yaml:"col"`
	Row   int    `json:"row" yaml:"row"`
	W     int    `json:"w" yaml:"w"`
	H     int    `json:"h" yaml:"h"`
}

type TemplateWorkstation struct {
	ID        string `json:"id" yaml:"id"`
	Label     string `json:"label,omitempty" yaml:"label,omitempty"`
	Col       int    `json:"col" yaml:"col"`
	Row       int    `json:"row" yaml:"row"`
	SeatCol   int    `json:"seat_col" yaml:"seat_col"`
	SeatRow   int    `json:"seat_row" yaml:"seat_row"`
	Facing    string `json:"facing" yaml:"facing"` // "up", "down", "left", "right"
	Style     string `json:"style" yaml:"style"`   // Diverse per-template workstation styles
	GlowColor string `json:"glow_color" yaml:"glow_color"`
	Sprite    string `json:"sprite,omitempty" yaml:"sprite,omitempty"` // Relative path inside templates/<id>/sprites/
}

type TemplateWaypoint struct {
	ID       string `json:"id" yaml:"id"`
	Col      int    `json:"col" yaml:"col"`
	Row      int    `json:"row" yaml:"row"`
	Activity string `json:"activity" yaml:"activity"` // "coffee", "watercooler", "lounge", "arcade", "bookshelf"
	Bubble   string `json:"bubble" yaml:"bubble"`
}

type TemplateProp struct {
	ID       string `json:"id" yaml:"id"`
	Type     string `json:"type" yaml:"type"` // "coffee_machine", "plant", "bookshelf", "sofa", "whiteboard", "server_rack", "arcade", "clock", "rug", "painting", "lantern", "holo_table", "campfire", "barrel"
	Col      int    `json:"col" yaml:"col"`
	Row      int    `json:"row" yaml:"row"`
	W        int    `json:"w" yaml:"w"`
	H        int    `json:"h" yaml:"h"`
	Label    string `json:"label,omitempty" yaml:"label,omitempty"`
	Color    string `json:"color,omitempty" yaml:"color,omitempty"`
	Animated bool   `json:"animated,omitempty" yaml:"animated,omitempty"`
	FlipX    bool   `json:"flip_x,omitempty" yaml:"flip_x,omitempty"`
	Sprite   string `json:"sprite,omitempty" yaml:"sprite,omitempty"` // Relative path inside templates/<id>/sprites/
}

type CharacterStyle struct {
	Title       string   `json:"title" yaml:"title"`
	Primary     string   `json:"primary" yaml:"primary"`         // Shirt / armor / coat hex
	Secondary   string   `json:"secondary" yaml:"secondary"`     // Pants / trim hex
	Skin        string   `json:"skin" yaml:"skin"`               // Skin / visor hex
	Hair        string   `json:"hair" yaml:"hair"`               // Hair / helmet hex
	Accessory   string   `json:"accessory" yaml:"accessory"`     // "hoodie", "visor", "wizard_hat", "cowboy_hat", "headphones", "crown", "goggles", "katana", "helmet"
	BadgeColor  string   `json:"badge_color" yaml:"badge_color"` // UI pill badge color
	Sprite      string   `json:"sprite,omitempty" yaml:"sprite,omitempty"` // Optional PNG sprite sheet path inside templates/<id>/sprites/
	SpriteSheet []string `json:"sprite_sheet,omitempty" yaml:"sprite_sheet,omitempty"`
}

type CompanionConfig struct {
	ID      string `json:"id" yaml:"id"`
	Name    string `json:"name" yaml:"name"`
	Type    string `json:"type" yaml:"type"` // "cat", "dog", "robot", "owl", "drone"
	Color   string `json:"color" yaml:"color"`
	HomeCol int    `json:"home_col" yaml:"home_col"`
	HomeRow int    `json:"home_row" yaml:"home_row"`
	Sprite  string `json:"sprite,omitempty" yaml:"sprite,omitempty"` // Optional PNG sprite path inside templates/<id>/sprites/
}
