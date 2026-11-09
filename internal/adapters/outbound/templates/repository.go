package templates

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"

	"github.com/alevsk/agent-plaza/internal/config"
	"github.com/alevsk/agent-plaza/internal/core/domain"
	embeddedTemplates "github.com/alevsk/agent-plaza/templates"
	"gopkg.in/yaml.v3"
)

type Repository struct {
	sceneCfg config.SceneConfig
}

func NewRepository(sceneCfg config.SceneConfig) *Repository {
	return &Repository{
		sceneCfg: sceneCfg,
	}
}

func (r *Repository) ListTemplates() ([]domain.TemplateSummary, error) {
	seen := make(map[string]bool)
	var list []domain.TemplateSummary

	// 1. Scan disk templates directory if it exists
	if entries, err := os.ReadDir(r.sceneCfg.TemplatesDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			mf, err := r.GetTemplate(e.Name())
			if err != nil {
				continue
			}
			seen[mf.ID] = true
			list = append(list, domain.TemplateSummary{
				ID:          mf.ID,
				Name:        mf.Name,
				Description: mf.Description,
				ThemeBadge:  mf.ThemeBadge,
			})
		}
	}

	// 2. Discover embedded templates for any default themes not yet found on disk
	if entries, err := fs.ReadDir(embeddedTemplates.EmbeddedFS, "."); err == nil {
		for _, e := range entries {
			if !e.IsDir() || seen[e.Name()] {
				continue
			}
			mf, err := r.GetTemplate(e.Name())
			if err != nil {
				continue
			}
			seen[mf.ID] = true
			list = append(list, domain.TemplateSummary{
				ID:          mf.ID,
				Name:        mf.Name,
				Description: mf.Description,
				ThemeBadge:  mf.ThemeBadge,
			})
		}
	}

	if len(list) == 0 {
		return nil, fmt.Errorf("no scene templates available on disk or embedded")
	}

	sort.Slice(list, func(i, j int) bool {
		if list[i].ID == "office" {
			return true
		}
		if list[j].ID == "office" {
			return false
		}
		return list[i].ID < list[j].ID
	})
	return list, nil
}

func (r *Repository) GetTemplate(id string) (*domain.TemplateManifest, error) {
	var data []byte
	var err error

	// 1. Try disk directory first
	file := filepath.Join(r.sceneCfg.TemplatesDir, id, "template.yaml")
	if st, statErr := os.Stat(file); statErr == nil && !st.IsDir() {
		data, err = os.ReadFile(file)
	}

	// 2. Fallback to embedded template assets
	if len(data) == 0 {
		embeddedPath := id + "/template.yaml"
		data, err = embeddedTemplates.EmbeddedFS.ReadFile(embeddedPath)
		if err != nil {
			return nil, fmt.Errorf("template %q not found on disk or embedded: %w", id, err)
		}
	}

	var mf domain.TemplateManifest
	if err := yaml.Unmarshal(data, &mf); err != nil {
		return nil, fmt.Errorf("invalid template %q yaml: %w", id, err)
	}
	if mf.ID == "" {
		mf.ID = id
	}
	if mf.Grid.TileSize == 0 {
		mf.Grid.TileSize = 16
	}
	if mf.Characters == nil {
		mf.Characters = make(map[string]domain.CharacterStyle)
	}

	// Merge custom characters, props, and companions from main config.yaml
	for k, v := range r.sceneCfg.CustomCharacters {
		mf.Characters[k] = v
	}
	if len(r.sceneCfg.CustomProps) > 0 {
		mf.Props = append(mf.Props, r.sceneCfg.CustomProps...)
	}
	if len(r.sceneCfg.CustomCompanions) > 0 {
		mf.Companions = append(mf.Companions, r.sceneCfg.CustomCompanions...)
	}

	return &mf, nil
}
