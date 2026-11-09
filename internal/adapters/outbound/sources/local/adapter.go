package local

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/alevsk/agents-animated-workspace/internal/config"
	"github.com/alevsk/agents-animated-workspace/internal/core/domain"
)

type Adapter struct {
	cfg            config.LocalConfig
	homeDir        string
	cacheRoot      string
	identityRoot   string
	claudeStatRoot string
	refreshMu      sync.Mutex
	refreshing     map[string]time.Time
}

func NewAdapter(cfg config.LocalConfig) *Adapter {
	home, _ := os.UserHomeDir()
	tmpDir := os.TempDir()
	// Ensure no trailing slash issues
	tmpDir = strings.TrimRight(tmpDir, "/")
	xdgCache := os.Getenv("XDG_CACHE_HOME")
	if xdgCache == "" {
		xdgCache = filepath.Join(home, ".cache")
	}
	if cfg.HerdrBin == "" {
		cfg.HerdrBin = "herdr"
	}
	if cfg.UsagePluginDir == "" {
		cfg.UsagePluginDir = os.Getenv("HERDR_USAGE_PLUGIN_DIR")
	}
	if cfg.UsagePluginDir == "" && home != "" {
		candidates := []string{
			filepath.Join(home, ".config", "herdr", "plugins", "herdr-agent-usage"),
			filepath.Join(home, "Development", "herdr-plugins", "herdr-agent-usage"),
		}
		for _, candidate := range candidates {
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				cfg.UsagePluginDir = candidate
				break
			}
		}
	}
	if cfg.QuotaTTLSeconds <= 0 {
		cfg.QuotaTTLSeconds = 300
	}
	return &Adapter{
		cfg:            cfg,
		homeDir:        home,
		cacheRoot:      filepath.Join(tmpDir, "herdr-agent-usage", "quota"),
		identityRoot:   filepath.Join(tmpDir, "herdr-agent-usage", "identity"),
		claudeStatRoot: filepath.Join(xdgCache, "herdr-agent-usage", "claude"),
		refreshing:     make(map[string]time.Time),
	}
}

func (a *Adapter) Name() string {
	return "local"
}

type herdrResponse struct {
	Result struct {
		Agents []herdrAgent `json:"agents"`
	} `json:"result"`
}

type herdrAgent struct {
	Agent        string `json:"agent"`
	AgentStatus  string `json:"agent_status"`
	CWD          string `json:"cwd"`
	ForegroundCW string `json:"foreground_cwd"`
	DisplayAgent string `json:"display_agent"`
	Focused      bool   `json:"focused"`
	PaneID       string `json:"pane_id"`
	TabID        string `json:"tab_id"`
	TerminalID   string `json:"terminal_id"`
	Title        string `json:"terminal_title"`
	TitleStrip   string `json:"terminal_title_stripped"`
	WorkspaceID  string `json:"workspace_id"`
	AgentSession *struct {
		Value string `json:"value"`
	} `json:"agent_session"`
	Tokens *struct {
		Context  string `json:"context"`
		Limit    string `json:"limit"`
		Provider string `json:"provider"`
		Title    string `json:"title"`
	} `json:"tokens"`
}

type accountRecord struct {
	Agent string
	ID    string
	Label string
	Email string
	Plan  string
	Home  string
}

func (a *Adapter) FetchState(ctx context.Context) (
	[]domain.AgentSession,
	[]domain.AccountSubscription,
	[]domain.OfflineAgent,
	error,
) {
	rawAgents, err := a.fetchHerdrAgents(ctx)
	if err != nil || len(rawAgents) == 0 {
		// When Herdr CLI is absent or returns no active processes,
		// discover recent & active sessions natively from local transcripts
		rawAgents = a.discoverNativeSessions()
	}

	accounts := a.discoverAccounts(ctx)
	accMap := make(map[string]accountRecord)
	agentHasAccount := make(map[string]bool)
	for _, acc := range accounts {
		accMap[acc.Agent+"/"+acc.ID] = acc
		agentHasAccount[acc.Agent] = true
	}

	// Trigger non-blocking background quota refreshes when stale
	a.triggerAsyncQuotaRefreshes(accounts)

	// Build active AgentSessions
	sessions := make([]domain.AgentSession, 0, len(rawAgents))
	herdrLimits := make(map[string]string)
	herdrProviders := make(map[string]string)

	for i, ra := range rawAgents {
		if ra.Tokens != nil && ra.Tokens.Limit != "" {
			if _, exists := herdrLimits[ra.Agent]; !exists {
				herdrLimits[ra.Agent] = ra.Tokens.Limit
				Provider := ra.Tokens.Provider
				if Provider == "" {
					Provider = "-"
				}
				herdrProviders[ra.Agent] = Provider
			}
		}

		sessionID := "-"
		if ra.AgentSession != nil && ra.AgentSession.Value != "" {
			sessionID = ra.AgentSession.Value
		}
		cwd := ra.ForegroundCW
		if cwd == "" {
			cwd = ra.CWD
		}

		// Live context resolution
		contextStr := "-"
		if ra.Tokens != nil && ra.Tokens.Context != "" {
			contextStr = ra.Tokens.Context
		}
		if live := a.resolveLiveContext(ra.Agent, sessionID, cwd); live != "" {
			contextStr = live
		}

		// Account attribution for claude & codex
		accLabel := ""
		displayName := ra.Agent
		switch ra.Agent {
		case "claude":
			accID := a.resolveClaudeAccount(sessionID)
			if acc, ok := accMap["claude/"+accID]; ok {
				accLabel = acc.Label
				if acc.Label != "" && acc.Label != "default" {
					displayName = ra.Agent + "·" + acc.Label
				}
			}
		case "codex":
			accID := a.resolveCodexAccount(cwd)
			if acc, ok := accMap["codex/"+accID]; ok {
				accLabel = acc.Label
				if acc.Label != "" && acc.Label != "default" {
					displayName = ra.Agent + "·" + acc.Label
				}
			}
		}

		pct, tokText, cleanRaw := parseContextString(contextStr)
		task := strings.TrimSpace(ra.TitleStrip)
		if task == "" {
			task = strings.TrimSpace(ra.Title)
		}
		if task == "" {
			task = "Active Session"
		}

		id := ra.PaneID
		if id == "" {
			id = ra.TerminalID
		}
		if id == "" {
			id = fmt.Sprintf("%s-%d", ra.Agent, i)
		}

		status := domain.StatusIdle
		if strings.EqualFold(ra.AgentStatus, "working") {
			status = domain.StatusWorking
		}

		sessions = append(sessions, domain.AgentSession{
			ID:             id,
			Agent:          ra.Agent,
			AccountLabel:   accLabel,
			DisplayName:    displayName,
			Status:         status,
			Task:           task,
			CWD:            cwd,
			WorkspaceID:    ra.WorkspaceID,
			PaneID:         ra.PaneID,
			SessionID:      sessionID,
			Focused:        ra.Focused,
			ContextRaw:     cleanRaw,
			ContextTokens:  tokText,
			ContextPercent: pct,
			CharacterKey:   ra.Agent,
		})
	}

	// Build Subscriptions & OtherAgents
	subs := a.buildSubscriptions(accounts, herdrLimits)
	others := a.buildOtherAgents(agentHasAccount, herdrLimits, herdrProviders)

	return sessions, subs, others, nil
}

func (a *Adapter) fetchHerdrAgents(ctx context.Context) ([]herdrAgent, error) {
	cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, a.cfg.HerdrBin, "agent", "list")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var resp herdrResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}
	return resp.Result.Agents, nil
}

var (
	rePct    = regexp.MustCompile(`(\d+)%`)
	reTokens = regexp.MustCompile(`(\d+[kKmM]?)`)
)

func parseContextString(raw string) (pct int, tokens string, formatted string) {
	s := strings.TrimSpace(raw)
	if s == "" || s == "-" || s == "—" {
		return -1, "—", "—"
	}
	s = strings.TrimPrefix(s, "⛁")
	s = strings.TrimSpace(s)

	pct = -1
	if m := rePct.FindStringSubmatch(s); len(m) > 1 {
		if v, err := strconv.Atoi(m[1]); err == nil {
			pct = v
		}
	}

	// Look for parenthesized tokens e.g. "36% (92k)" or standalone "489k"
	if idx := strings.Index(s, "("); idx >= 0 {
		rest := s[idx+1:]
		rest = strings.TrimSuffix(rest, ")")
		tokens = strings.TrimSpace(rest)
	} else if pct == -1 {
		tokens = s
	} else {
		// Remove percentage part and find token string
		withoutPct := rePct.ReplaceAllString(s, "")
		if m := reTokens.FindStringSubmatch(withoutPct); len(m) > 1 {
			tokens = m[1]
		}
	}

	if pct >= 0 && tokens != "" {
		formatted = fmt.Sprintf("%d%% · %s", pct, tokens)
	} else if pct >= 0 {
		formatted = fmt.Sprintf("%d%%", pct)
	} else if tokens != "" {
		formatted = tokens
	} else {
		formatted = "—"
	}
	return pct, tokens, formatted
}

// ── Live Context Readers ───────────────────────────────────────────────────

func (a *Adapter) resolveLiveContext(agent, sessionID, cwd string) string {
	switch agent {
	case "claude":
		return a.claudeLiveContext(sessionID)
	case "codex":
		return a.codexLiveContext(cwd)
	case "opencode":
		return a.opencodeLiveContext(sessionID, cwd)
	default:
		return ""
	}
}

func (a *Adapter) claudeCandidateHomes() []string {
	var dirs []string
	seen := make(map[string]bool)
	add := func(d string) {
		if d == "" || seen[d] {
			return
		}
		if st, err := os.Stat(d); err == nil && st.IsDir() {
			seen[d] = true
			dirs = append(dirs, d)
		}
	}
	add(os.Getenv("CLAUDE_CONFIG_DIR"))
	add(filepath.Join(a.homeDir, ".claude"))
	add("/home/workspace/.claude")
	add("/root/.claude")
	matches, _ := filepath.Glob(filepath.Join(a.homeDir, ".claude-*"))
	for _, m := range matches {
		add(m)
	}
	return dirs
}

func (a *Adapter) codexCandidateHomes() []string {
	var dirs []string
	seen := make(map[string]bool)
	add := func(d string) {
		if d == "" || seen[d] {
			return
		}
		if st, err := os.Stat(d); err == nil && st.IsDir() {
			seen[d] = true
			dirs = append(dirs, d)
		}
	}
	add(os.Getenv("CODEX_HOME"))
	add(filepath.Join(a.homeDir, ".codex"))
	add("/home/workspace/.codex")
	add("/root/.codex")
	matches, _ := filepath.Glob(filepath.Join(a.homeDir, ".codex-*"))
	for _, m := range matches {
		add(m)
	}
	return dirs
}

func (a *Adapter) findClaudeTranscript(sessionID string) string {
	if sessionID == "" || sessionID == "-" {
		return ""
	}
	for _, dir := range a.claudeCandidateHomes() {
		pattern := filepath.Join(dir, "projects", "*", sessionID+".jsonl")
		matches, _ := filepath.Glob(pattern)
		for _, m := range matches {
			if st, err := os.Stat(m); err == nil && !st.IsDir() {
				return m
			}
		}
	}
	return ""
}

func (a *Adapter) resolveClaudeAccount(sessionID string) string {
	t := a.findClaudeTranscript(sessionID)
	if t == "" {
		return ""
	}
	// <home>/projects/<proj>/<session>.jsonl
	home := filepath.Dir(filepath.Dir(filepath.Dir(t)))
	return filepath.Base(home)
}

func (a *Adapter) claudeLiveContext(sessionID string) string {
	transcript := a.findClaudeTranscript(sessionID)
	if transcript == "" {
		return ""
	}
	f, err := os.Open(transcript)
	if err != nil {
		return ""
	}
	defer f.Close()

	// Read from the tail or scan lines for last main-thread assistant usage
	var lastLine string
	scanner := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 2*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, `"type":"assistant"`) &&
			!strings.Contains(line, `"isSidechain":true`) &&
			!strings.Contains(line, `"model":"<synthetic>"`) {
			lastLine = line
		}
	}
	if lastLine == "" {
		return ""
	}

	var parsed struct {
		Message struct {
			Usage struct {
				InputTokens              int `json:"input_tokens"`
				CacheReadInputTokens     int `json:"cache_read_input_tokens"`
				CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
			} `json:"usage"`
		} `json:"message"`
	}
	if err := json.Unmarshal([]byte(lastLine), &parsed); err != nil {
		return ""
	}
	tokens := parsed.Message.Usage.InputTokens +
		parsed.Message.Usage.CacheReadInputTokens +
		parsed.Message.Usage.CacheCreationInputTokens
	if tokens <= 0 {
		return ""
	}

	window := 0
	statusFile := filepath.Join(a.claudeStatRoot, sessionID+".json")
	if b, err := os.ReadFile(statusFile); err == nil {
		var sf struct {
			ContextWindow struct {
				Size int `json:"context_window_size"`
			} `json:"context_window"`
		}
		if json.Unmarshal(b, &sf) == nil {
			window = sf.ContextWindow.Size
		}
	}

	return formatTokensAndWindow(tokens, window)
}

func (a *Adapter) findCodexRollout(cwd string) string {
	if cwd == "" || cwd == "-" {
		return ""
	}
	needle := fmt.Sprintf(`"cwd":%q`, cwd)
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	var newestPath string
	var newestMod time.Time

	for _, dir := range a.codexCandidateHomes() {
		sessDir := filepath.Join(dir, "sessions")
		_ = filepath.WalkDir(sessDir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			if !strings.HasPrefix(d.Name(), "rollout-") || !strings.HasSuffix(d.Name(), ".jsonl") {
				return nil
			}
			info, err := d.Info()
			if err != nil || info.ModTime().Before(cutoff) {
				return nil
			}
			if newestPath != "" && !info.ModTime().After(newestMod) {
				return nil
			}
			f, err := os.Open(path)
			if err != nil {
				return nil
			}
			sc := bufio.NewScanner(f)
			buf := make([]byte, 0, 64*1024)
			sc.Buffer(buf, 512*1024)
			matched := false
			if sc.Scan() && strings.Contains(sc.Text(), needle) {
				matched = true
			}
			f.Close()
			if matched {
				newestPath = path
				newestMod = info.ModTime()
			}
			return nil
		})
	}
	return newestPath
}

func (a *Adapter) resolveCodexAccount(cwd string) string {
	r := a.findCodexRollout(cwd)
	if r == "" {
		return ""
	}
	// <home>/sessions/Y/M/D/rollout.jsonl
	home := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(r)))))
	return filepath.Base(home)
}

func (a *Adapter) codexLiveContext(cwd string) string {
	rollout := a.findCodexRollout(cwd)
	if rollout == "" {
		return ""
	}
	f, err := os.Open(rollout)
	if err != nil {
		return ""
	}
	defer f.Close()

	var lastLine string
	sc := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 2*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if strings.Contains(line, `"type":"token_count"`) && strings.Contains(line, `"info":{`) {
			lastLine = line
		}
	}
	if lastLine == "" {
		return ""
	}
	var parsed struct {
		Payload struct {
			Info struct {
				LastTokenUsage struct {
					TotalTokens int `json:"total_tokens"`
				} `json:"last_token_usage"`
				ModelContextWindow int `json:"model_context_window"`
			} `json:"info"`
		} `json:"payload"`
	}
	if err := json.Unmarshal([]byte(lastLine), &parsed); err != nil {
		return ""
	}
	used := parsed.Payload.Info.LastTokenUsage.TotalTokens
	if used <= 0 {
		return ""
	}
	return formatTokensAndWindow(used, parsed.Payload.Info.ModelContextWindow)
}

func (a *Adapter) opencodeLiveContext(sessionID, cwd string) string {
	if a.cfg.UsagePluginDir != "" {
		script := filepath.Join(a.cfg.UsagePluginDir, "lib", "providers", "opencode.sh")
		providerSh := filepath.Join(a.cfg.UsagePluginDir, "lib", "provider.sh")
		if fileExists(script) && fileExists(providerSh) {
			cmd := exec.Command("bash", "-c",
				fmt.Sprintf("source %q && source %q && provider_opencode_live_context %q %q",
					providerSh, script, sessionID, cwd))
			if out, err := cmd.Output(); err == nil {
				s := strings.TrimSpace(string(out))
				if s != "" {
					return s
				}
			}
		}
	}
	return ""
}

func shortTokens(n int) string {
	if n >= 1000 {
		return fmt.Sprintf("%dk", (n+500)/1000)
	}
	return strconv.Itoa(n)
}

func formatTokensAndWindow(tokens, window int) string {
	if window > 0 {
		pct := (tokens*100 + window/2) / window
		return fmt.Sprintf("⛁ %d%% (%s)", pct, shortTokens(tokens))
	}
	return fmt.Sprintf("⛁ %s", shortTokens(tokens))
}

// ── Account Discovery & Subscriptions ──────────────────────────────────────

func (a *Adapter) discoverAccounts(ctx context.Context) []accountRecord {
	// If herdr-agent-usage/lib/accounts.sh exists, use it so accounts.conf overrides work identically
	if a.cfg.UsagePluginDir != "" {
		accScript := filepath.Join(a.cfg.UsagePluginDir, "lib", "accounts.sh")
		if fileExists(accScript) {
			cctx, cancel := context.WithTimeout(ctx, 2*time.Second)
			defer cancel()
			if out, err := exec.CommandContext(cctx, "bash", accScript, "list").Output(); err == nil {
				var res []accountRecord
				for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
					if line == "" {
						continue
					}
					parts := strings.Split(line, "\t")
					if len(parts) >= 6 {
						res = append(res, accountRecord{
							Agent: parts[0],
							ID:    parts[1],
							Label: parts[2],
							Email: parts[3],
							Plan:  parts[4],
							Home:  parts[5],
						})
					}
				}
				if len(res) > 0 {
					return res
				}
			}
		}
	}

	// Native Go fallback account discovery
	var res []accountRecord
	for _, dir := range a.claudeCandidateHomes() {
		base := filepath.Base(dir)
		cjson := filepath.Join(dir, ".claude.json")
		projs := filepath.Join(dir, "projects")
		if !fileExists(cjson) && !dirExists(projs) {
			continue
		}
		email, plan := "-", "-"
		if b, err := os.ReadFile(cjson); err == nil {
			var parsed struct {
				OAuth struct {
					Email    string `json:"emailAddress"`
					SeatTier string `json:"seatTier"`
					OrgName  string `json:"organizationName"`
				} `json:"oauthAccount"`
			}
			if json.Unmarshal(b, &parsed) == nil && parsed.OAuth.Email != "" {
				email = parsed.OAuth.Email
				if parsed.OAuth.SeatTier != "" {
					plan = parsed.OAuth.SeatTier
				} else if parsed.OAuth.OrgName != "" && !strings.Contains(parsed.OAuth.OrgName, "@") {
					plan = parsed.OAuth.OrgName
				}
			}
		}
		label := "default"
		if base != ".claude" {
			label = strings.TrimPrefix(base, ".claude-")
		}
		res = append(res, accountRecord{Agent: "claude", ID: base, Label: label, Email: email, Plan: plan, Home: dir})
	}

	// Agy
	agyFile := filepath.Join(a.homeDir, ".gemini", "google_accounts.json")
	if b, err := os.ReadFile(agyFile); err == nil {
		var parsed struct {
			Active string `json:"active"`
		}
		if json.Unmarshal(b, &parsed) == nil && parsed.Active != "" {
			res = append(res, accountRecord{Agent: "agy", ID: "default", Label: "default", Email: parsed.Active, Plan: "-", Home: filepath.Join(a.homeDir, ".gemini")})
		}
	}

	// Codex
	for _, dir := range a.codexCandidateHomes() {
		authFile := filepath.Join(dir, "auth.json")
		if b, err := os.ReadFile(authFile); err == nil {
			var parsed struct {
				Tokens struct {
					IDToken string `json:"id_token"`
				} `json:"tokens"`
			}
			if json.Unmarshal(b, &parsed) == nil && parsed.Tokens.IDToken != "" {
				email, plan := decodeCodexJWT(parsed.Tokens.IDToken)
				base := filepath.Base(dir)
				label := "default"
				if base != ".codex" {
					label = strings.TrimPrefix(base, ".codex-")
				}
				res = append(res, accountRecord{Agent: "codex", ID: base, Label: label, Email: email, Plan: plan, Home: dir})
			}
		}
	}

	// Grok
	grokAuth := filepath.Join(a.homeDir, ".grok", "auth.json")
	if b, err := os.ReadFile(grokAuth); err == nil {
		var entries map[string]struct {
			Email string      `json:"email"`
			Tier  interface{} `json:"tier"`
		}
		if json.Unmarshal(b, &entries) == nil {
			for k, v := range entries {
				if v.Email == "" {
					continue
				}
				lbl := strings.Split(v.Email, "@")[0]
				plan := "-"
				if v.Tier != nil && fmt.Sprint(v.Tier) != "" {
					plan = "tier " + fmt.Sprint(v.Tier)
				}
				res = append(res, accountRecord{Agent: "grok", ID: k, Label: lbl, Email: v.Email, Plan: plan, Home: filepath.Join(a.homeDir, ".grok")})
			}
		}
	}

	// OpenCode
	ocAuth := filepath.Join(a.homeDir, ".local", "share", "opencode", "auth.json")
	if b, err := os.ReadFile(ocAuth); err == nil {
		var entries map[string]interface{}
		if json.Unmarshal(b, &entries) == nil {
			for k := range entries {
				res = append(res, accountRecord{Agent: "opencode", ID: k, Label: k, Email: "-", Plan: "-", Home: filepath.Join(a.homeDir, ".config", "opencode")})
			}
		}
	}

	return res
}

func decodeCodexJWT(jwt string) (email, plan string) {
	email, plan = "-", "-"
	parts := strings.Split(jwt, ".")
	if len(parts) < 2 {
		return
	}
	b, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return
	}
	var payload struct {
		Email string `json:"email"`
		Auth  struct {
			Plan string `json:"chatgpt_plan_type"`
		} `json:"https://api.openai.com/auth"`
	}
	if json.Unmarshal(b, &payload) == nil {
		if payload.Email != "" {
			email = payload.Email
		}
		if payload.Auth.Plan != "" {
			plan = payload.Auth.Plan
		}
	}
	return
}

// ── Native Transcript-Based Session Discovery (fallback when Herdr is absent) ─

type transcriptCandidate struct {
	path    string
	modTime time.Time
	id      string
	cwd     string
}

func (a *Adapter) discoverNativeSessions() []herdrAgent {
	var results []herdrAgent
	results = append(results, a.discoverNativeClaudeSessions()...)
	results = append(results, a.discoverNativeCodexSessions()...)
	return results
}

func (a *Adapter) discoverNativeClaudeSessions() []herdrAgent {
	cutoff := time.Now().Add(-48 * time.Hour)
	var candidates []transcriptCandidate

	for _, dir := range a.claudeCandidateHomes() {
		projectsDir := filepath.Join(dir, "projects")
		pEntries, err := os.ReadDir(projectsDir)
		if err != nil {
			continue
		}
		for _, pe := range pEntries {
			if !pe.IsDir() {
				continue
			}
			projDir := filepath.Join(projectsDir, pe.Name())
			matches, _ := filepath.Glob(filepath.Join(projDir, "*.jsonl"))
			for _, m := range matches {
				fi, err := os.Stat(m)
				if err != nil || fi.IsDir() || fi.ModTime().Before(cutoff) {
					continue
				}
				sessionID := strings.TrimSuffix(filepath.Base(m), ".jsonl")
				cwd := pe.Name()
				if strings.HasPrefix(cwd, "-") {
					cwd = "/" + strings.ReplaceAll(strings.TrimPrefix(cwd, "-"), "-", "/")
				}
				candidates = append(candidates, transcriptCandidate{
					path:    m,
					modTime: fi.ModTime(),
					id:      sessionID,
					cwd:     cwd,
				})
			}
		}
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].modTime.After(candidates[j].modTime)
	})

	if len(candidates) > 8 {
		candidates = candidates[:8]
	}

	var agents []herdrAgent
	for _, c := range candidates {
		task := a.extractClaudeSessionTask(c.path)
		if task == "" {
			task = "Claude Session (" + filepath.Base(c.cwd) + ")"
		}
		status := "idle"
		if time.Since(c.modTime) < 5*time.Minute {
			status = "working"
		}
		paneID := "claude-" + c.id
		if len(c.id) > 8 {
			paneID = "claude-" + c.id[:8]
		}
		agents = append(agents, herdrAgent{
			Agent:        "claude",
			AgentStatus:  status,
			CWD:          c.cwd,
			DisplayAgent: "claude",
			PaneID:       paneID,
			Title:        task,
			TitleStrip:   task,
			WorkspaceID:  filepath.Base(c.cwd),
			AgentSession: &struct {
				Value string `json:"value"`
			}{Value: c.id},
		})
	}
	return agents
}

func (a *Adapter) extractClaudeSessionTask(transcriptPath string) string {
	f, err := os.Open(transcriptPath)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	var lastUserMsg string
	for scanner.Scan() {
		line := scanner.Bytes()
		if !bytes.Contains(line, []byte(`"type":"user"`)) {
			continue
		}
		var parsed struct {
			Message struct {
				Content interface{} `json:"content"`
			} `json:"message"`
		}
		if json.Unmarshal(line, &parsed) == nil {
			switch c := parsed.Message.Content.(type) {
			case string:
				c = strings.TrimSpace(c)
				if c != "" && !strings.HasPrefix(c, "/") {
					lastUserMsg = c
				}
			case []interface{}:
				for _, block := range c {
					if bm, ok := block.(map[string]interface{}); ok {
						if bm["type"] == "text" {
							if text, ok := bm["text"].(string); ok {
								text = strings.TrimSpace(text)
								if text != "" && !strings.HasPrefix(text, "/") {
									lastUserMsg = text
									break
								}
							}
						}
					}
				}
			}
		}
	}
	if len(lastUserMsg) > 90 {
		lastUserMsg = lastUserMsg[:87] + "..."
	}
	return lastUserMsg
}

func (a *Adapter) discoverNativeCodexSessions() []herdrAgent {
	var agents []herdrAgent
	cutoff := time.Now().Add(-48 * time.Hour)

	for _, dir := range a.codexCandidateHomes() {
		idxPath := filepath.Join(dir, "session_index.jsonl")
		f, err := os.Open(idxPath)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		var entries []struct {
			ID         string    `json:"id"`
			ThreadName string    `json:"thread_name"`
			UpdatedAt  time.Time `json:"updated_at"`
		}
		for scanner.Scan() {
			var e struct {
				ID         string    `json:"id"`
				ThreadName string    `json:"thread_name"`
				UpdatedAt  time.Time `json:"updated_at"`
			}
			if json.Unmarshal(scanner.Bytes(), &e) == nil && e.ID != "" && e.UpdatedAt.After(cutoff) {
				entries = append(entries, e)
			}
		}
		_ = f.Close()

		sort.Slice(entries, func(i, j int) bool {
			return entries[i].UpdatedAt.After(entries[j].UpdatedAt)
		})

		if len(entries) > 4 {
			entries = entries[:4]
		}

		for _, e := range entries {
			status := "idle"
			if time.Since(e.UpdatedAt) < 5*time.Minute {
				status = "working"
			}
			task := strings.TrimSpace(e.ThreadName)
			if task == "" {
				task = "Codex Session"
			}
			if len(task) > 90 {
				task = task[:87] + "..."
			}
			paneID := "codex-" + e.ID
			if len(e.ID) > 8 {
				paneID = "codex-" + e.ID[:8]
			}
			agents = append(agents, herdrAgent{
				Agent:        "codex",
				AgentStatus:  status,
				CWD:          dir,
				DisplayAgent: "codex",
				PaneID:       paneID,
				Title:        task,
				TitleStrip:   task,
				WorkspaceID:  "codex",
				AgentSession: &struct {
					Value string `json:"value"`
				}{Value: e.ID},
			})
		}
	}
	return agents
}

func (a *Adapter) quotaCachePath(agent, id, ext string) string {
	safeID := strings.ReplaceAll(id, "/", "_")
	if ext == "" {
		ext = "txt"
	}
	return filepath.Join(a.cacheRoot, agent, safeID+"."+ext)
}

func (a *Adapter) isCacheFresh(path string) bool {
	st, err := os.Stat(path)
	if err != nil {
		return false
	}
	return time.Since(st.ModTime()) < time.Duration(a.cfg.QuotaTTLSeconds)*time.Second
}

func (a *Adapter) triggerAsyncQuotaRefreshes(accounts []accountRecord) {
	if a.cfg.UsagePluginDir == "" {
		return
	}
	quotaSh := filepath.Join(a.cfg.UsagePluginDir, "lib", "quota.sh")
	providerSh := filepath.Join(a.cfg.UsagePluginDir, "lib", "provider.sh")
	opencodeSh := filepath.Join(a.cfg.UsagePluginDir, "lib", "providers", "opencode.sh")
	if !fileExists(quotaSh) {
		return
	}

	for _, acc := range accounts {
		ext := "txt"
		if acc.Agent == "kimi" || acc.Agent == "opencode" {
			ext = "json"
		}
		cachePath := a.quotaCachePath(acc.Agent, acc.ID, ext)
		if a.isCacheFresh(cachePath) {
			continue
		}

		key := acc.Agent + "/" + acc.ID
		a.refreshMu.Lock()
		last, busy := a.refreshing[key]
		if busy && time.Since(last) < 45*time.Second {
			a.refreshMu.Unlock()
			continue
		}
		a.refreshing[key] = time.Now()
		a.refreshMu.Unlock()

		go func(acc accountRecord, ext, key string) {
			defer func() {
				a.refreshMu.Lock()
				delete(a.refreshing, key)
				a.refreshMu.Unlock()
			}()
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			cmdStr := fmt.Sprintf("source %q && source %q && source %q 2>/dev/null; quota_dispatch %q %q %q %q",
				quotaSh, providerSh, opencodeSh, acc.Agent, acc.ID, ext, acc.Home)
			_ = exec.CommandContext(ctx, "bash", "-c", cmdStr).Run()
		}(acc, ext, key)
	}
}

func (a *Adapter) buildSubscriptions(accounts []accountRecord, herdrLimits map[string]string) []domain.AccountSubscription {
	groupOrder := []string{"claude", "agy", "codex", "grok", "opencode", "kimi"}
	byAgent := make(map[string][]accountRecord)
	for _, acc := range accounts {
		byAgent[acc.Agent] = append(byAgent[acc.Agent], acc)
	}

	var result []domain.AccountSubscription
	for _, agent := range groupOrder {
		accs := byAgent[agent]
		if len(accs) == 0 {
			continue
		}
		multi := len(accs) > 1
		firstID := accs[0].ID
		for _, acc := range accs {
			sub := domain.AccountSubscription{
				Agent:          agent,
				AccountID:      acc.ID,
				AccountDisplay: formatAccountDisplay(acc.Label, acc.Email, multi),
				Plan:           formatPlanName(acc.Plan),
				Windows:        a.readAccountWindows(acc, firstID, herdrLimits),
			}
			result = append(result, sub)
		}
	}
	return result
}

func formatPlanName(plan string) string {
	if idx := strings.Index(plan, "_"); idx >= 0 {
		plan = plan[:idx]
	}
	if plan == "" || plan == "-" {
		return "—"
	}
	return plan
}

func formatAccountDisplay(label, email string, multi bool) string {
	if email != "" && email != "-" {
		localpart := strings.Split(email, "@")[0]
		if label != "" && label != "-" && label != "default" && !strings.HasPrefix(localpart, label) {
			return label + " · " + email
		}
		if label == "default" && multi {
			return "default · " + email
		}
		return email
	}
	if label != "" && label != "-" && label != "default" {
		return label
	}
	return "—"
}

func (a *Adapter) readAccountWindows(acc accountRecord, firstID string, herdrLimits map[string]string) []domain.LimitWindow {
	var windows []domain.LimitWindow

	switch acc.Agent {
	case "claude":
		cache := a.quotaCachePath("claude", acc.ID, "txt")
		weekPct, weekReset, sessPct, fablePct := parseClaudeQuotaFile(cache)
		if weekPct >= 0 {
			windows = append(windows, domain.LimitWindow{
				Label:     "week",
				UsagePct:  weekPct,
				UsageText: fmt.Sprintf("%d%%", weekPct),
				Resets:    defaultDash(weekReset),
			})
		}
		if sessPct >= 0 {
			windows = append(windows, domain.LimitWindow{
				Label:     "session",
				UsagePct:  sessPct,
				UsageText: fmt.Sprintf("%d%%", sessPct),
				Resets:    "—",
			})
		}
		if fablePct >= 0 {
			windows = append(windows, domain.LimitWindow{
				Label:     "fable",
				UsagePct:  fablePct,
				UsageText: fmt.Sprintf("%d%%", fablePct),
				Resets:    "—",
			})
		}
		if summary := a.claudeLocal7dSummary(cache, acc.Home); summary != "" {
			windows = append(windows, domain.LimitWindow{
				Label:     "7d",
				UsagePct:  -1,
				UsageText: summary,
				Resets:    "—",
			})
		}

	case "agy":
		cache := a.quotaCachePath("agy", acc.ID, "txt")
		windows = append(windows, parseAgyQuotaFile(cache)...)

	case "codex":
		if usedPct, winLabel := parseHerdrLimit(herdrLimits["codex"]); usedPct >= 0 {
			windows = append(windows, domain.LimitWindow{
				Label:     winLabel,
				UsagePct:  usedPct,
				UsageText: fmt.Sprintf("%d%%", usedPct),
				Resets:    "—",
			})
		}

	case "grok":
		if acc.ID == firstID {
			if usedPct, winLabel := parseHerdrLimit(herdrLimits["grok"]); usedPct >= 0 {
				windows = append(windows, domain.LimitWindow{
					Label:     winLabel,
					UsagePct:  usedPct,
					UsageText: fmt.Sprintf("%d%%", usedPct),
					Resets:    "—",
				})
			}
		}

	case "opencode":
		cache := a.quotaCachePath("opencode", acc.ID, "json")
		windows = append(windows, parseOpenCodeQuotaFile(cache)...)

	case "kimi":
		cache := a.quotaCachePath("kimi", acc.ID, "json")
		windows = append(windows, parseKimiQuotaFile(cache)...)
	}

	if len(windows) == 0 {
		windows = append(windows, domain.LimitWindow{
			Label:     "—",
			UsagePct:  -1,
			UsageText: "—",
			Resets:    "—",
		})
	}
	return windows
}

var (
	reUsedPct  = regexp.MustCompile(`(\d+)% used`)
	reResetsAt = regexp.MustCompile(`resets ([^·\n]+)`)
	reLast7d   = regexp.MustCompile(`Last 7d · (\d+) requests? · (\d+) sessions?`)
	reParenTZ  = regexp.MustCompile(` \(.*\)`)
)

func parseClaudeQuotaFile(path string) (weekPct int, weekReset string, sessPct int, fablePct int) {
	weekPct, sessPct, fablePct = -1, -1, -1
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	kind := ""
	for _, line := range strings.Split(string(b), "\n") {
		if strings.Contains(line, "Current week (all models):") {
			kind = "week"
		} else if strings.HasPrefix(strings.TrimSpace(line), "Current session:") {
			kind = "sess"
		} else if strings.Contains(line, "Current week (Fable):") {
			kind = "fable"
		}
		if kind == "" {
			continue
		}
		if m := reUsedPct.FindStringSubmatch(line); len(m) > 1 {
			v, _ := strconv.Atoi(m[1])
			reset := ""
			if rm := reResetsAt.FindStringSubmatch(line); len(rm) > 1 {
				reset = rm[1]
				reset = reParenTZ.ReplaceAllString(reset, "")
				reset = strings.ReplaceAll(reset, " at ", " ")
				reset = strings.TrimSpace(reset)
			}
			switch kind {
			case "week":
				weekPct = v
				weekReset = reset
			case "sess":
				sessPct = v
			case "fable":
				fablePct = v
			}
			kind = ""
		}
	}
	return
}

func (a *Adapter) claudeLocal7dSummary(cachePath, home string) string {
	if b, err := os.ReadFile(cachePath); err == nil {
		if m := reLast7d.FindStringSubmatch(string(b)); len(m) > 2 {
			req, _ := strconv.Atoi(m[1])
			sess := m[2]
			return fmt.Sprintf("%s req · %s sess", shortTokens(req), sess)
		}
	}
	statsFile := filepath.Join(home, "stats-cache.json")
	b, err := os.ReadFile(statsFile)
	if err != nil {
		return ""
	}
	var parsed struct {
		DailyActivity []struct {
			Date         string `json:"date"`
			MessageCount int    `json:"messageCount"`
			SessionCount int    `json:"sessionCount"`
		} `json:"dailyActivity"`
	}
	if json.Unmarshal(b, &parsed) != nil {
		return ""
	}
	cutoff := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
	totalReq, totalSess, count := 0, 0, 0
	for _, d := range parsed.DailyActivity {
		if d.Date >= cutoff {
			totalReq += d.MessageCount
			totalSess += d.SessionCount
			count++
		}
	}
	if count == 0 {
		return ""
	}
	return fmt.Sprintf("%s req · %d sess", shortTokens(totalReq), totalSess)
}

func parseAgyQuotaFile(path string) []domain.LimitWindow {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	type famData struct {
		model  string
		wpct   string
		wreset string
		fpct   string
	}
	var order []string
	fams := make(map[string]*famData)

	for _, line := range strings.Split(string(b), "\n") {
		if line == "" || strings.HasPrefix(line, "Quota:") {
			continue
		}
		cols := strings.Split(line, "\t")
		if len(cols) < 3 {
			continue
		}
		m := strings.TrimSpace(cols[0])
		win := cols[1]
		pct := strings.TrimSpace(cols[2])
		rst := ""
		if len(cols) >= 4 {
			rst = strings.TrimSpace(cols[3])
		}
		fd, exists := fams[m]
		if !exists {
			fd = &famData{model: m}
			fams[m] = fd
			order = append(order, m)
		}
		if strings.Contains(win, "Weekly") && fd.wpct == "" {
			fd.wpct = pct
			fd.wreset = rst
		}
		if strings.Contains(win, "Five Hour") && fd.fpct == "" {
			fd.fpct = pct
		}
	}

	var out []domain.LimitWindow
	for _, m := range order {
		fd := fams[m]
		if fd.wpct != "" {
			if fd.wpct == "disabled" {
				out = append(out, domain.LimitWindow{
					Label:     m + " · week",
					UsagePct:  -1,
					UsageText: "disabled",
					Resets:    "—",
				})
			} else {
				used := remainingToUsed(fd.wpct)
				out = append(out, domain.LimitWindow{
					Label:     m + " · week",
					UsagePct:  used,
					UsageText: fmt.Sprintf("%d%%", used),
					Resets:    formatISOReset(fd.wreset),
				})
			}
		}
		if fd.fpct != "" {
			if fd.fpct == "disabled" {
				out = append(out, domain.LimitWindow{
					Label:     m + " · 5h",
					UsagePct:  -1,
					UsageText: "disabled",
					Resets:    "—",
				})
			} else {
				used := remainingToUsed(fd.fpct)
				out = append(out, domain.LimitWindow{
					Label:     m + " · 5h",
					UsagePct:  used,
					UsageText: fmt.Sprintf("%d%%", used),
					Resets:    "—",
				})
			}
		}
	}
	return out
}

func parseOpenCodeQuotaFile(path string) []domain.LimitWindow {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var parsed struct {
		Data struct {
			Limits []struct {
				Type          string   `json:"type"`
				Unit          int      `json:"unit"`
				Number        int      `json:"number"`
				Percentage    *float64 `json:"percentage"`
				NextResetTime *int64   `json:"nextResetTime"`
			} `json:"limits"`
		} `json:"data"`
	}
	if json.Unmarshal(b, &parsed) != nil {
		return nil
	}
	var out []domain.LimitWindow
	for _, lim := range parsed.Data.Limits {
		if lim.Type != "TOKENS_LIMIT" && lim.Type != "CREDIT_LIMIT" {
			continue
		}
		label := ""
		if lim.Unit == 3 && lim.Number == 5 {
			label = "5h"
		} else if lim.Unit == 6 && lim.Number == 1 {
			label = "week"
		} else {
			continue
		}
		pct := 0
		if lim.Percentage != nil {
			v := int(*lim.Percentage + 0.5)
			if v < 0 {
				v = 0
			} else if v > 100 {
				v = 100
			}
			pct = v
		}
		rst := "—"
		if lim.NextResetTime != nil && *lim.NextResetTime > 0 {
			rst = formatEpochReset(*lim.NextResetTime / 1000)
		}
		out = append(out, domain.LimitWindow{
			Label:     label,
			UsagePct:  pct,
			UsageText: fmt.Sprintf("%d%%", pct),
			Resets:    rst,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Label == "5h" && out[j].Label != "5h" {
			return true
		}
		return false
	})
	return out
}

func parseKimiQuotaFile(path string) []domain.LimitWindow {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var parsed struct {
		Usages map[string]struct {
			UsedRatio *float64 `json:"used_ratio"`
			ResetTime string   `json:"reset_time"`
		} `json:"usages"`
	}
	if json.Unmarshal(b, &parsed) != nil {
		return nil
	}
	var out []domain.LimitWindow
	keys := []struct {
		key   string
		label string
	}{
		{"limit_7d", "7d"},
		{"limit_5h", "5h"},
		{"limit_month_total", "month"},
	}
	for _, k := range keys {
		u, ok := parsed.Usages[k.key]
		if !ok || u.UsedRatio == nil {
			continue
		}
		pct := int(*u.UsedRatio*100 + 0.5)
		rst := "—"
		if k.key == "limit_7d" && u.ResetTime != "" {
			if t, err := time.Parse(time.RFC3339, u.ResetTime); err == nil {
				if t.Before(time.Now()) {
					pct = 0
				} else {
					rst = formatEpochReset(t.Unix())
				}
			}
		}
		out = append(out, domain.LimitWindow{
			Label:     k.label,
			UsagePct:  pct,
			UsageText: fmt.Sprintf("%d%%", pct),
			Resets:    rst,
		})
	}
	return out
}

func (a *Adapter) buildOtherAgents(agentHasAccount map[string]bool, herdrLimits, herdrProviders map[string]string) []domain.OfflineAgent {
	knownDirs := map[string]string{
		"codex":    filepath.Join(a.homeDir, ".codex"),
		"opencode": filepath.Join(a.homeDir, ".config", "opencode"),
		"grok":     filepath.Join(a.homeDir, ".grok"),
		"claude":   filepath.Join(a.homeDir, ".claude"),
		"agy":      filepath.Join(a.homeDir, ".gemini", "config"),
		"cursor":   filepath.Join(a.homeDir, ".cursor"),
		"devin":    filepath.Join(a.homeDir, ".config", "devin"),
		"kimi":     filepath.Join(a.homeDir, ".kimi-code"),
	}
	allSet := make(map[string]bool)
	for k := range knownDirs {
		allSet[k] = true
	}
	for k := range herdrLimits {
		allSet[k] = true
	}
	var names []string
	for k := range allSet {
		names = append(names, k)
	}
	sort.Strings(names)

	var others []domain.OfflineAgent
	for _, agent := range names {
		if agentHasAccount[agent] {
			continue
		}
		installed := false
		if d, ok := knownDirs[agent]; ok && dirExists(d) {
			installed = true
		}
		limit, hasLimit := herdrLimits[agent]
		if !installed && !hasLimit {
			continue
		}
		provider := herdrProviders[agent]
		if provider == "" {
			provider = "(Installed)"
		}
		if !hasLimit || limit == "" {
			limit = "Idle / Offline"
		}
		others = append(others, domain.OfflineAgent{
			Agent:    agent,
			Provider: provider,
			Limit:    limit,
		})
	}
	return others
}

func parseHerdrLimit(limit string) (usedPct int, window string) {
	fields := strings.Fields(strings.TrimSpace(limit))
	if len(fields) != 2 {
		return -1, ""
	}
	win, pctStr := fields[0], fields[1]
	if !strings.HasSuffix(pctStr, "%") {
		return -1, ""
	}
	return remainingToUsed(pctStr), win
}

func remainingToUsed(s string) int {
	s = strings.TrimSuffix(strings.TrimSpace(s), "%")
	v, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	if v > 100 {
		v = 100
	}
	if v < 0 {
		v = 0
	}
	return 100 - v
}

func formatISOReset(iso string) string {
	if iso == "" {
		return "—"
	}
	layouts := []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05Z"}
	for _, l := range layouts {
		if t, err := time.Parse(l, iso); err == nil {
			return formatEpochReset(t.Unix())
		}
	}
	return "—"
}

func formatEpochReset(epoch int64) string {
	t := time.Unix(epoch, 0).Local()
	s := t.Format("Jan 2 3:04pm")
	s = strings.ReplaceAll(s, ":00pm", "pm")
	s = strings.ReplaceAll(s, ":00am", "am")
	return s
}

func defaultDash(s string) string {
	if strings.TrimSpace(s) == "" || s == "-" {
		return "—"
	}
	return s
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

var _ = bytes.Compare
