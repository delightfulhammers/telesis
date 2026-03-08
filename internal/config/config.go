package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

const (
	telesisDir = ".telesis"
	configFile = "config.yml"
)

type Config struct {
	Project Project `yaml:"project"`
}

type Project struct {
	Name     string `yaml:"name"`
	Owner    string `yaml:"owner"`
	Language string `yaml:"language"`
	Status   string `yaml:"status"`
	Repo     string `yaml:"repo"`
}

func configPath(rootDir string) string {
	return filepath.Join(rootDir, telesisDir, configFile)
}

func Load(rootDir string) (*Config, error) {
	data, err := os.ReadFile(configPath(rootDir))
	if err != nil {
		return nil, fmt.Errorf("could not read config (run `telesis init` first): %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("could not parse config: %w", err)
	}

	return &cfg, nil
}

func Save(rootDir string, cfg *Config) error {
	dir := filepath.Join(rootDir, telesisDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("could not create %s directory: %w", telesisDir, err)
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("could not marshal config: %w", err)
	}

	header := []byte("# Telesis project configuration\n")
	content := append(header, data...)

	if err := os.WriteFile(configPath(rootDir), content, 0o644); err != nil {
		return fmt.Errorf("could not write config: %w", err)
	}

	return nil
}

func Exists(rootDir string) (bool, error) {
	_, err := os.Stat(configPath(rootDir))
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, fmt.Errorf("could not check config: %w", err)
}
