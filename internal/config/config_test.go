package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/delightfulhammers/telesis/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSaveAndLoad(t *testing.T) {
	rootDir := t.TempDir()

	cfg := &config.Config{
		Project: config.Project{
			Name:     "TestProject",
			Owner:    "Test Owner",
			Language: "Go",
			Status:   "active",
			Repo:     "github.com/test/project",
		},
	}

	err := config.Save(rootDir, cfg)
	require.NoError(t, err)

	// Verify file was created
	configPath := filepath.Join(rootDir, ".telesis", "config.yml")
	assert.FileExists(t, configPath)

	loaded, err := config.Load(rootDir)
	require.NoError(t, err)

	assert.Equal(t, cfg.Project.Name, loaded.Project.Name)
	assert.Equal(t, cfg.Project.Owner, loaded.Project.Owner)
	assert.Equal(t, cfg.Project.Language, loaded.Project.Language)
	assert.Equal(t, cfg.Project.Status, loaded.Project.Status)
	assert.Equal(t, cfg.Project.Repo, loaded.Project.Repo)
}

func TestLoadNonExistent(t *testing.T) {
	rootDir := t.TempDir()

	_, err := config.Load(rootDir)
	assert.Error(t, err)
}

func TestSaveCreatesDirectory(t *testing.T) {
	rootDir := t.TempDir()

	cfg := &config.Config{
		Project: config.Project{
			Name: "TestProject",
		},
	}

	err := config.Save(rootDir, cfg)
	require.NoError(t, err)

	telesisDir := filepath.Join(rootDir, ".telesis")
	info, err := os.Stat(telesisDir)
	require.NoError(t, err)
	assert.True(t, info.IsDir())
}

func TestExists(t *testing.T) {
	tests := []struct {
		name      string
		setup     func(string) error
		expected  bool
		expectErr bool
	}{
		{
			name:     "returns false when no config",
			setup:    func(dir string) error { return nil },
			expected: false,
		},
		{
			name: "returns true when config exists",
			setup: func(dir string) error {
				return config.Save(dir, &config.Config{
					Project: config.Project{Name: "Test"},
				})
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rootDir := t.TempDir()
			require.NoError(t, tt.setup(rootDir))
			exists, err := config.Exists(rootDir)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expected, exists)
			}
		})
	}
}
