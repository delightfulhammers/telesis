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

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func (c *Config) validate() error {
	if c.Project.Name == "" {
		return fmt.Errorf("config missing required field: project.name")
	}
	return nil
}

func Save(rootDir string, cfg *Config) error {
	dir := filepath.Join(rootDir, telesisDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("could not create %s directory: %w", telesisDir, err)
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("could not marshal config: %w", err)
	}

	header := []byte("# Telesis project configuration\n")
	content := append(header, data...)

	// Atomic write: temp file + rename to prevent partial writes
	dest := configPath(rootDir)
	tmp, err := os.CreateTemp(dir, ".config-*.yml")
	if err != nil {
		return fmt.Errorf("could not create temp file: %w", err)
	}
	tmpPath := tmp.Name()

	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("could not write config: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("could not close config: %w", err)
	}
	if err := os.Rename(tmpPath, dest); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("could not finalize config: %w", err)
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
