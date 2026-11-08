package config

import (
	"os"

	"github.com/alevsk/agents-animated-workspace/internal/core/domain"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Server ServerConfig `yaml:"server" json:"server"`
	Source SourceConfig `yaml:"source" json:"source"`
	Scene  SceneConfig  `yaml:"scene" json:"scene"`
}

type ServerConfig struct {
	Host           string     `yaml:"host" json:"host"`
	Port           int        `yaml:"port" json:"port"`
	PollIntervalMs int        `yaml:"poll_interval_ms" json:"poll_interval_ms"`
	StaticDir      string     `yaml:"static_dir" json:"static_dir"`
	Auth           AuthConfig `yaml:"auth" json:"auth"`
}

type AuthConfig struct {
	Enabled bool   `yaml:"enabled" json:"enabled"`
	Token   string `yaml:"token" json:"token"`
}

type SourceConfig struct {
	Type   string       `yaml:"type" json:"type"` // "local" or "remote"
	Local  LocalConfig  `yaml:"local" json:"local"`
	Remote RemoteConfig `yaml:"remote" json:"remote"`
}

type LocalConfig struct {
	HerdrBin        string `yaml:"herdr_bin" json:"herdr_bin"`
	UsagePluginDir  string `yaml:"usage_plugin_dir" json:"usage_plugin_dir"`
	QuotaTTLSeconds int    `yaml:"quota_ttl_seconds" json:"quota_ttl_seconds"`
}

type RemoteConfig struct {
	Endpoint       string `yaml:"endpoint" json:"endpoint"`
	Token          string `yaml:"token" json:"token"`
	TimeoutSeconds int    `yaml:"timeout_seconds" json:"timeout_seconds"`
}

type SceneConfig struct {
	ActiveTemplate   string                           `yaml:"active_template" json:"active_template"`
	TemplatesDir     string                           `yaml:"templates_dir" json:"templates_dir"`
	CustomCharacters map[string]domain.CharacterStyle `yaml:"custom_characters" json:"custom_characters"`
	CustomProps      []domain.TemplateProp            `yaml:"custom_props" json:"custom_props"`
	CustomCompanions []domain.CompanionConfig         `yaml:"custom_companions" json:"custom_companions"`
}

func Default() *Config {
	return &Config{
		Server: ServerConfig{
			Host:           "0.0.0.0",
			Port:           8080,
			PollIntervalMs: 2500,
			StaticDir:      "./web/dist",
			Auth: AuthConfig{
				Enabled: false,
				Token:   "",
			},
		},
		Source: SourceConfig{
			Type: "local",
			Local: LocalConfig{
				HerdrBin:        "herdr",
				UsagePluginDir:  "/Users/alevsk/Development/herdr-plugins/herdr-agent-usage",
				QuotaTTLSeconds: 300,
			},
			Remote: RemoteConfig{
				Endpoint:       "http://localhost:8080/api/snapshot",
				Token:          "",
				TimeoutSeconds: 10,
			},
		},
		Scene: SceneConfig{
			ActiveTemplate: "office",
			TemplatesDir:   "./templates",
		},
	}
}

func Load(path string) (*Config, error) {
	cfg := Default()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.Server.PollIntervalMs < 500 {
		cfg.Server.PollIntervalMs = 2500
	}
	if cfg.Scene.ActiveTemplate == "" {
		cfg.Scene.ActiveTemplate = "office"
	}
	if cfg.Scene.TemplatesDir == "" {
		cfg.Scene.TemplatesDir = "./templates"
	}
	if cfg.Source.Type == "" {
		cfg.Source.Type = "local"
	}
	return cfg, nil
}
