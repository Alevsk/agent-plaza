package templates

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/alevsk/agents-animated-workspace/internal/config"
	"github.com/alevsk/agents-animated-workspace/internal/core/domain"
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
	entries, err := os.ReadDir(r.sceneCfg.TemplatesDir)
	if err != nil {
		return nil, err
	}
	var list []domain.TemplateSummary
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		mf, err := r.GetTemplate(e.Name())
		if err != nil {
			continue
		}
		list = append(list, domain.TemplateSummary{
			ID:          mf.ID,
			Name:        mf.Name,
			Description: mf.Description,
			ThemeBadge:  mf.ThemeBadge,
		})
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
	file := filepath.Join(r.sceneCfg.TemplatesDir, id, "template.yaml")
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("template %q not found: %w", id, err)
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
