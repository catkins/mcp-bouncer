package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/adrg/xdg"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// TransportType represents the type of transport for MCP server communication
type TransportType string

const (
	TransportStdio           TransportType = "stdio"
	TransportSSE             TransportType = "sse"
	TransportStreamableHTTP  TransportType = "streamable_http"
)

// MCPServerConfig represents configuration for a single MCP server
type MCPServerConfig struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Transport   TransportType     `json:"transport"`
	Command     string            `json:"command"`
	Args        []string          `json:"args,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Endpoint    string            `json:"endpoint,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
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
	settings       *Settings
	filePath       string
	callbacks      []func(e *application.CustomEvent)
	callbacksMutex sync.RWMutex
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
	s.callbacksMutex.Lock()
	defer s.callbacksMutex.Unlock()
	s.callbacks = append(s.callbacks, callback)
}

// Unsubscribe removes a callback from the list of callbacks
// Note: This removes the first matching callback. If you have multiple identical callbacks,
// you may need to call this multiple times.
func (s *SettingsService) Unsubscribe(callback func(e *application.CustomEvent)) {
	s.callbacksMutex.Lock()
	defer s.callbacksMutex.Unlock()

	for i, cb := range s.callbacks {
		if fmt.Sprintf("%p", cb) == fmt.Sprintf("%p", callback) {
			// Remove the callback by slicing
			s.callbacks = append(s.callbacks[:i], s.callbacks[i+1:]...)
			break
		}
	}
}

// ClearCallbacks removes all callbacks
func (s *SettingsService) ClearCallbacks() {
	s.callbacksMutex.Lock()
	defer s.callbacksMutex.Unlock()
	s.callbacks = nil
}

// GetCallbackCount returns the number of registered callbacks
func (s *SettingsService) GetCallbackCount() int {
	s.callbacksMutex.RLock()
	defer s.callbacksMutex.RUnlock()
	return len(s.callbacks)
}

// Load loads settings from file
func (s *SettingsService) Load() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	err = json.Unmarshal(data, s.settings)
	if err != nil {
		return err
	}

	// Migrate existing configurations to include transport type
	for i := range s.settings.MCPServers {
		if s.settings.MCPServers[i].Transport == "" {
			s.settings.MCPServers[i].Transport = TransportStdio
		}
	}

	return nil
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

	// Check for duplicate names
	for _, server := range s.settings.MCPServers {
		if server.Name == config.Name {
			return fmt.Errorf("server with name '%s' already exists", config.Name)
		}
	}

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
	// Check for duplicate names (excluding the current server being updated)
	for _, server := range s.settings.MCPServers {
		if server.Name == config.Name && server.Name != name {
			return fmt.Errorf("server with name '%s' already exists", config.Name)
		}
	}

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
	slog.Info("Emitting settings event", "name", name, "callback_count", s.GetCallbackCount())

	s.callbacksMutex.RLock()
	defer s.callbacksMutex.RUnlock()

	if len(s.callbacks) == 0 {
		slog.Debug("No callbacks registered for settings service event", "name", name)
		return
	}

	event := &application.CustomEvent{
		Name:   name,
		Data:   data,
		Sender: "settings_service",
	}

	for i, callback := range s.callbacks {
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("Panic in settings service callback", "callback_index", i, "event_name", name, "panic", r)
				}
			}()
			callback(event)
		}()
	}
}

// OpenConfigDirectory opens the config directory in the platform's file manager
func (s *SettingsService) OpenConfigDirectory() error {
	configDir := filepath.Dir(s.filePath)

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", configDir)
	case "windows":
		cmd = exec.Command("explorer", configDir)
	case "linux":
		cmd = exec.Command("xdg-open", configDir)
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	return cmd.Run()
}
