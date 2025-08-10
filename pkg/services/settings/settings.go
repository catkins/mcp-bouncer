package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/adrg/xdg"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// MCPServerConfig represents configuration for a single MCP server
type MCPServerConfig struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Command     string            `json:"command"`
	Args        []string          `json:"args,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Enabled     bool              `json:"enabled"`
}

// Settings represents the application settings
type Settings struct {
	MCPServers []MCPServerConfig `json:"mcp_servers"`
	ListenAddr string            `json:"listen_addr"`
	AutoStart  bool              `json:"auto_start"`
}

// SettingsService handles loading and saving application settings
type SettingsService struct {
	settings *Settings
	filePath string
	callback func(e *application.CustomEvent)
}

// NewSettingsService creates a new settings service
func NewSettingsService() *SettingsService {
	return &SettingsService{
		settings: &Settings{
			MCPServers: []MCPServerConfig{},
			ListenAddr: "localhost:8091",
			AutoStart:  false,
		},
	}
}

// ServiceStartup is called when the service starts
func (s *SettingsService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	// Determine settings file path
	configDir, err := xdg.ConfigFile("mcp-bouncer")
	if err != nil {
		return fmt.Errorf("failed to get config directory: %w", err)
	}

	// Ensure config directory exists
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	s.filePath = filepath.Join(configDir, "settings.json")

	// Load existing settings
	if err := s.Load(); err != nil {
		// If file doesn't exist, create default settings
		if os.IsNotExist(err) {
			if err := s.Save(); err != nil {
				return fmt.Errorf("failed to create default settings: %w", err)
			}
		} else {
			return fmt.Errorf("failed to load settings: %w", err)
		}
	}

	return nil
}

// Subscribe sets the event callback
func (s *SettingsService) Subscribe(callback func(e *application.CustomEvent)) {
	s.callback = callback
}

// Load loads settings from file
func (s *SettingsService) Load() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, s.settings)
}

// Save saves settings to file
func (s *SettingsService) Save() error {
	slog.Debug("Saving settings", "file_path", s.filePath, "server_count", len(s.settings.MCPServers))

	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		slog.Error("Failed to marshal settings", "error", err)
		return err
	}

	if err := os.WriteFile(s.filePath, data, 0644); err != nil {
		slog.Error("Failed to write settings file", "file_path", s.filePath, "error", err)
		return err
	}

	slog.Debug("Settings saved successfully", "file_path", s.filePath)

	// Emit settings updated event
	s.emitEvent("settings:updated", s.settings)
	return nil
}

// GetSettings returns the current settings
func (s *SettingsService) GetSettings() *Settings {
	return s.settings
}

// UpdateSettings updates the settings and saves them
func (s *SettingsService) UpdateSettings(settings *Settings) error {
	s.settings = settings
	return s.Save()
}

// AddMCPServer adds a new MCP server configuration
func (s *SettingsService) AddMCPServer(config MCPServerConfig) error {
	slog.Info("Adding MCP server", "name", config.Name, "command", config.Command)
	s.settings.MCPServers = append(s.settings.MCPServers, config)
	if err := s.Save(); err != nil {
		slog.Error("Failed to save settings after adding server", "error", err)
		return err
	}
	slog.Info("Successfully added MCP server", "name", config.Name, "total_servers", len(s.settings.MCPServers))
	return nil
}

// RemoveMCPServer removes an MCP server configuration by name
func (s *SettingsService) RemoveMCPServer(name string) error {
	for i, server := range s.settings.MCPServers {
		if server.Name == name {
			s.settings.MCPServers = append(s.settings.MCPServers[:i], s.settings.MCPServers[i+1:]...)
			return s.Save()
		}
	}
	return fmt.Errorf("server '%s' not found", name)
}

// UpdateMCPServer updates an existing MCP server configuration
func (s *SettingsService) UpdateMCPServer(name string, config MCPServerConfig) error {
	for i, server := range s.settings.MCPServers {
		if server.Name == name {
			s.settings.MCPServers[i] = config
			return s.Save()
		}
	}
	return fmt.Errorf("server '%s' not found", name)
}

// GetMCPServers returns all MCP server configurations
func (s *SettingsService) GetMCPServers() []MCPServerConfig {
	return s.settings.MCPServers
}

// GetEnabledMCPServers returns only enabled MCP server configurations
func (s *SettingsService) GetEnabledMCPServers() []MCPServerConfig {
	var enabled []MCPServerConfig
	for _, server := range s.settings.MCPServers {
		if server.Enabled {
			enabled = append(enabled, server)
		}
	}
	return enabled
}

// SetListenAddr updates the listen address
func (s *SettingsService) SetListenAddr(addr string) error {
	s.settings.ListenAddr = addr
	return s.Save()
}

// GetListenAddr returns the current listen address
func (s *SettingsService) GetListenAddr() string {
	return s.settings.ListenAddr
}

// SetAutoStart updates the auto-start setting
func (s *SettingsService) SetAutoStart(autoStart bool) error {
	s.settings.AutoStart = autoStart
	return s.Save()
}

// GetAutoStart returns the current auto-start setting
func (s *SettingsService) GetAutoStart() bool {
	return s.settings.AutoStart
}

// emitEvent emits a custom event
func (s *SettingsService) emitEvent(name string, data any) {
	if s.callback != nil {
		s.callback(&application.CustomEvent{
			Name:   name,
			Data:   data,
			Sender: "settings_service",
		})
	}
}
