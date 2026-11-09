export type AgentStatus = 'working' | 'idle';
export type CameraMode = 'free' | 'follow' | 'tour' | 'activity';

export interface Summary {
  total_agents: number;
  working: number;
  idle: number;
}

export interface AgentSession {
  id: string;
  agent: string;
  account_label?: string;
  display_name: string;
  status: AgentStatus;
  task: string;
  cwd?: string;
  workspace_id?: string;
  pane_id?: string;
  session_id?: string;
  focused?: boolean;
  context_raw: string;
  context_tokens: string;
  context_percent: number; // -1 when unknown, 0..100 when known
  character_key: string;
  simulated?: boolean;
}

export interface LimitWindow {
  label: string;
  usage_pct: number; // -1 for text-only rows like "34k req · 7 sess"
  usage_text: string;
  resets: string;
}

export interface AccountSubscription {
  agent: string;
  account_id: string;
  account_display: string;
  plan: string;
  windows: LimitWindow[];
}

export interface OfflineAgent {
  agent: string;
  provider: string;
  limit: string;
}

export interface WorkspaceSnapshot {
  summary: Summary;
  agents: AgentSession[];
  subscriptions: AccountSubscription[];
  other_agents: OfflineAgent[];
  active_template: string;
  source_type: string;
  updated_at: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  theme_badge: string;
}

export interface TemplateTheme {
  background: string;
  wall_color: string;
  wall_trim: string;
  floor_primary: string;
  floor_secondary: string;
  floor_accent: string;
  grid_line: string;
  accent_color: string;
  secondary_color: string;
  spawn_effect: 'matrix' | 'beam' | 'portal' | 'smoke' | string;
  spawn_color: string;
  particles: 'dust' | 'neon' | 'embers' | 'leaves' | string;
  working_verb: string;
  idle_verb: string;
}

export interface TemplateGrid {
  cols: number;
  rows: number;
  tile_size: number;
  layout: string[];
}

export interface TemplateZone {
  id: string;
  label: string;
  color: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface TemplateWorkstation {
  id: string;
  label?: string;
  col: number;
  row: number;
  seat_col: number;
  seat_row: number;
  facing: string;
  style: string;
  glow_color: string;
  sprite?: string;
}

export interface TemplateWaypoint {
  id: string;
  col: number;
  row: number;
  activity: string;
  bubble: string;
}

export interface TemplateProp {
  id: string;
  type: string;
  col: number;
  row: number;
  w: number;
  h: number;
  label?: string;
  color?: string;
  animated?: boolean;
  flip_x?: boolean;
  sprite?: string;
}

export interface CharacterStyle {
  title: string;
  primary: string;
  secondary: string;
  skin: string;
  hair: string;
  accessory: string;
  badge_color: string;
  sprite?: string;
  sprite_sheet?: string[];
}

export interface CompanionConfig {
  id: string;
  name: string;
  type: string;
  color: string;
  home_col: number;
  home_row: number;
  sprite?: string;
}

export interface TemplateManifest {
  id: string;
  name: string;
  description: string;
  theme_badge: string;
  theme: TemplateTheme;
  grid: TemplateGrid;
  zones: TemplateZone[];
  workstations: TemplateWorkstation[];
  waypoints: TemplateWaypoint[];
  props: TemplateProp[];
  characters: Record<string, CharacterStyle>;
  companions: CompanionConfig[];
}

export interface WorkspaceEvent {
  type: 'snapshot' | 'diff' | 'template_changed';
  snapshot?: WorkspaceSnapshot;
  joined?: AgentSession[];
  left?: string[];
  updated?: AgentSession[];
  template?: TemplateManifest;
  timestamp: string;
}
