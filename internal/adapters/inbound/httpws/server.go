package httpws

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/alevsk/agent-plaza/internal/config"
	"github.com/alevsk/agent-plaza/internal/core/domain"
	"github.com/alevsk/agent-plaza/internal/core/services"
	embeddedTemplates "github.com/alevsk/agent-plaza/templates"
	"github.com/alevsk/agent-plaza/web"
	"github.com/gorilla/websocket"
)

type Hub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]bool
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[*websocket.Conn]bool),
	}
}

func (h *Hub) Broadcast(event domain.WorkspaceEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	h.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(h.clients))
	for c := range h.clients {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if err := c.WriteMessage(websocket.TextMessage, data); err != nil {
			h.remove(c)
		}
	}
}

func (h *Hub) add(c *websocket.Conn) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
}

func (h *Hub) remove(c *websocket.Conn) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		_ = c.Close()
	}
	h.mu.Unlock()
}

type Server struct {
	cfg     *config.Config
	hub     *Hub
	service *services.WorkspaceService
}

func NewServer(cfg *config.Config, hub *Hub, service *services.WorkspaceService) *Server {
	return &Server{
		cfg:     cfg,
		hub:     hub,
		service: service,
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/ws", s.authMiddleware(s.handleWS))
	mux.HandleFunc("/api/snapshot", s.authMiddleware(s.handleSnapshot))
	mux.HandleFunc("/api/templates", s.authMiddleware(s.handleListTemplates))
	mux.HandleFunc("/api/templates/active", s.authMiddleware(s.handleSetActiveTemplate))
	mux.HandleFunc("/api/templates/", s.authMiddleware(s.handleGetTemplate))
	mux.HandleFunc("/api/sim/spawn", s.authMiddleware(s.handleSimSpawn))
	mux.HandleFunc("/api/sim/toggle", s.authMiddleware(s.handleSimToggle))
	mux.HandleFunc("/api/sim/clear", s.authMiddleware(s.handleSimClear))

	// Serve template static assets: check disk directory first, fallback to embedded templates
	mux.HandleFunc("/template-assets/", func(w http.ResponseWriter, r *http.Request) {
		relPath := strings.TrimPrefix(r.URL.Path, "/template-assets/")
		relPath = strings.TrimPrefix(relPath, "/")

		// 1. Try disk if templates_dir exists
		if s.cfg.Scene.TemplatesDir != "" {
			diskPath := filepath.Join(s.cfg.Scene.TemplatesDir, filepath.Clean(relPath))
			if info, err := os.Stat(diskPath); err == nil && !info.IsDir() {
				http.ServeFile(w, r, diskPath)
				return
			}
		}

		// 2. Fallback to embedded template assets
		if f, err := embeddedTemplates.EmbeddedFS.Open(relPath); err == nil {
			_ = f.Close()
			http.StripPrefix("/template-assets/", http.FileServer(http.FS(embeddedTemplates.EmbeddedFS))).ServeHTTP(w, r)
			return
		}

		http.NotFound(w, r)
	})

	// Serve frontend SPA: check disk static_dir first (for dev / hot-reload), fallback to embedded web assets
	distFS, _ := web.DistFS()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		cleanPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
		if cleanPath == "." {
			cleanPath = ""
		}

		// 1. Try disk if static_dir exists
		staticDir := s.cfg.Server.StaticDir
		if staticDir != "" {
			if st, err := os.Stat(staticDir); err == nil && st.IsDir() {
				if cleanPath != "" {
					fullPath := filepath.Join(staticDir, cleanPath)
					if info, err := os.Stat(fullPath); err == nil && !info.IsDir() {
						http.ServeFile(w, r, fullPath)
						return
					}
				}
				indexFile := filepath.Join(staticDir, "index.html")
				if _, err := os.Stat(indexFile); err == nil {
					http.ServeFile(w, r, indexFile)
					return
				}
			}
		}

		// 2. Try embedded web dist assets
		if distFS != nil {
			if cleanPath != "" {
				if f, err := distFS.Open(cleanPath); err == nil {
					st, statErr := f.Stat()
					_ = f.Close()
					if statErr == nil && !st.IsDir() {
						http.FileServer(http.FS(distFS)).ServeHTTP(w, r)
						return
					}
				}
			}
			// Fallback to index.html for root and SPA routes
			if f, err := distFS.Open("index.html"); err == nil {
				_ = f.Close()
				r2 := new(http.Request)
				*r2 = *r
				r2.URL.Path = "/"
				http.FileServer(http.FS(distFS)).ServeHTTP(w, r2)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"agent-plaza"}`))
	})

	return corsMiddleware(mux)
}

func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.Server.Auth.Enabled || s.cfg.Server.Auth.Token == "" {
			next(w, r)
			return
		}
		token := r.URL.Query().Get("token")
		if token == "" {
			authHeader := r.Header.Get("Authorization")
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
		if token != s.cfg.Server.Auth.Token {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	s.hub.add(conn)

	// Send initial snapshot + active template immediately
	snap := s.service.GetSnapshot()
	tpl, _ := s.service.GetTemplate(snap.ActiveTemplate)
	initEvent := domain.WorkspaceEvent{
		Type:      "snapshot",
		Snapshot:  snap,
		Template:  tpl,
		Timestamp: time.Now(),
	}
	if data, err := json.Marshal(initEvent); err == nil {
		_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		_ = conn.WriteMessage(websocket.TextMessage, data)
	}

	// Listen for client commands over WS
	go func() {
		defer s.hub.remove(conn)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var cmd struct {
				Action     string `json:"action"`
				TemplateID string `json:"template_id"`
				Agent      string `json:"agent"`
				Task       string `json:"task"`
				Status     string `json:"status"`
				ID         string `json:"id"`
			}
			if json.Unmarshal(msg, &cmd) != nil {
				continue
			}
			switch cmd.Action {
			case "set_template":
				_, _ = s.service.SetActiveTemplate(cmd.TemplateID)
			case "spawn_sim":
				s.service.SpawnSimulatedAgent(cmd.Agent, cmd.Task, domain.AgentStatus(cmd.Status))
			case "toggle_status":
				s.service.ToggleAgentStatus(cmd.ID)
			case "clear_sim":
				id := cmd.ID
				if id == "" {
					id = "all"
				}
				s.service.RemoveSimulatedAgent(id)
			}
		}
	}()
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.service.GetSnapshot())
}

func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	list, err := s.service.ListTemplates()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, list)
}

func (s *Server) handleGetTemplate(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/templates/")
	mf, err := s.service.GetTemplate(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, mf)
}

func (s *Server) handleSetActiveTemplate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		TemplateID string `json:"template_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TemplateID == "" {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	mf, err := s.service.SetActiveTemplate(body.TemplateID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	writeJSON(w, mf)
}

func (s *Server) handleSimSpawn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Agent  string `json:"agent"`
		Task   string `json:"task"`
		Status string `json:"status"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	sim := s.service.SpawnSimulatedAgent(body.Agent, body.Task, domain.AgentStatus(body.Status))
	writeJSON(w, sim)
}

func (s *Server) handleSimToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == "" {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	s.service.ToggleAgentStatus(body.ID)
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handleSimClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.ID == "" {
		body.ID = "all"
	}
	s.service.RemoveSimulatedAgent(body.ID)
	writeJSON(w, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
