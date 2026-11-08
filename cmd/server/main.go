package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/alevsk/agents-animated-workspace/internal/adapters/inbound/httpws"
	"github.com/alevsk/agents-animated-workspace/internal/adapters/outbound/sources/local"
	"github.com/alevsk/agents-animated-workspace/internal/adapters/outbound/sources/remote"
	"github.com/alevsk/agents-animated-workspace/internal/adapters/outbound/templates"
	"github.com/alevsk/agents-animated-workspace/internal/config"
	"github.com/alevsk/agents-animated-workspace/internal/core/ports"
	"github.com/alevsk/agents-animated-workspace/internal/core/services"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to YAML configuration file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config %s: %v", *configPath, err)
	}

	// Dependency Inversion: select DataSourcePort adapter from configuration
	var dataSource ports.DataSourcePort
	switch cfg.Source.Type {
	case "remote":
		log.Printf("Using REMOTE data source adapter (%s)", cfg.Source.Remote.Endpoint)
		dataSource = remote.NewAdapter(cfg.Source.Remote)
	default:
		log.Printf("Using LOCAL data source adapter (herdr=%s)", cfg.Source.Local.HerdrBin)
		dataSource = local.NewAdapter(cfg.Source.Local)
	}

	templateRepo := templates.NewRepository(cfg.Scene)
	hub := httpws.NewHub()

	pollInterval := time.Duration(cfg.Server.PollIntervalMs) * time.Millisecond
	svc := services.NewWorkspaceService(
		dataSource,
		templateRepo,
		hub,
		cfg.Scene.ActiveTemplate,
		pollInterval,
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go svc.Start(ctx)

	srv := httpws.NewServer(cfg, hub, svc)
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: srv.Handler(),
	}

	go func() {
		log.Printf("Agents Animated Workspace server listening on http://%s (active template: %s)", addr, cfg.Scene.ActiveTemplate)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Shutting down server...")
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutCtx)
}
