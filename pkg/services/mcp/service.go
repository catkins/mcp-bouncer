package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/catkins/mcp-bouncer/pkg/services/settings"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type MCPService struct {
	listenAddr     string
	callbacks      []func(e *application.CustomEvent)
	callbacksMutex sync.RWMutex
	server         *Server
	settings       *settings.SettingsService
}

// GetIncomingClients returns the list of active incoming clients connected to the streamable HTTP endpoint
func (s *MCPService) GetIncomingClients() []IncomingClient {
	if s.server == nil {
		return []IncomingClient{}
	}
	return s.server.GetIncomingClients()
}

const defaultListenAddr = "localhost:8091"

func NewMCPService(settingsService *settings.SettingsService) *MCPService {
	return &MCPService{
		listenAddr: defaultListenAddr,
		server:     NewServer(defaultListenAddr),
		settings:   settingsService,
	}
}

func (s *MCPService) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	if s.settings != nil {
		s.listenAddr = s.settings.GetListenAddr()
		s.server = NewServer(s.listenAddr)
		// Bridge server-emitted events to the app event bus
		s.server.SetEventEmitter(func(name string, data any) {
			s.emitEvent(name, data)
		})

		s.settings.Subscribe(func(event *application.CustomEvent) {
			if event.Name == "settings:updated" {
				// Check if listen address changed
				newAddr := s.settings.GetListenAddr()
				if newAddr != s.listenAddr {
					slog.Info("Listen address changed, reloading all clients", "old", s.listenAddr, "new", newAddr)
					s.listenAddr = newAddr
					s.server = NewServer(s.listenAddr)
					s.server.SetEventEmitter(func(name string, data any) {
						s.emitEvent(name, data)
					})
					if err := s.ReloadClients(); err != nil {
						slog.Error("Failed to reload clients", "error", err)
					}
				} else {
					slog.Debug("Settings updated but no client reload needed")
				}
			}
		})
	}

	// Start the server
	go func() {
		s.server.Start(ctx)
	}()

	// Load clients from settings asynchronously
	go func() {
		if s.settings != nil {
			settings := s.settings.GetSettings()
			if settings != nil {
				slog.Info("Loading clients from settings", "client_count", len(settings.MCPServers))
				if err := s.server.GetClientManager().LoadClientsFromSettings(ctx, settings); err != nil {
					slog.Error("Failed to load clients from settings", "error", err)
				}
			}
		}
	}()

	return nil
}

func (s *MCPService) IsActive() bool {
	return s.server.active
}

func (s *MCPService) Subscribe(callback func(e *application.CustomEvent)) {
	s.callbacksMutex.Lock()
	defer s.callbacksMutex.Unlock()
	s.callbacks = append(s.callbacks, callback)
}

// Unsubscribe removes a callback from the list of callbacks
// Note: This removes the first matching callback. If you have multiple identical callbacks,
// you may need to call this multiple times.
func (s *MCPService) Unsubscribe(callback func(e *application.CustomEvent)) {
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
func (s *MCPService) ClearCallbacks() {
	s.callbacksMutex.Lock()
	defer s.callbacksMutex.Unlock()
	s.callbacks = nil
}

// GetCallbackCount returns the number of registered callbacks
func (s *MCPService) GetCallbackCount() int {
	s.callbacksMutex.RLock()
	defer s.callbacksMutex.RUnlock()
	return len(s.callbacks)
}

func (s *MCPService) List() ([]settings.MCPServerConfig, error) {
	if s.settings != nil {
		return s.settings.GetMCPServers(), nil
	}

	// Fallback to mock data if no settings service
	servers := []settings.MCPServerConfig{}
	for i := 0; i < rand.Intn(5)+1; i++ {
		servers = append(servers, settings.MCPServerConfig{
			Name:        fmt.Sprintf("service%d", i+1),
			Description: fmt.Sprintf("Mock service %d", i+1),
			Command:     fmt.Sprintf("mock-command-%d", i+1),
			Enabled:     rand.Intn(2) == 1,
		})
	}
	return servers, nil
}

func (s *MCPService) ListenAddr() string {
	return fmt.Sprintf("http://%s/mcp", s.listenAddr)
}

// AddMCPServer adds a new MCP server configuration
func (s *MCPService) AddMCPServer(config settings.MCPServerConfig) error {
	if s.settings != nil {
		err := s.settings.AddMCPServer(config)
		if err != nil {
			return err
		}

		// Start the client if it's enabled
		if config.Enabled && s.server != nil {
			go func() {
				if err := s.server.GetClientManager().StartClient(context.Background(), config); err != nil {
					slog.Error("Failed to start client after adding", "name", config.Name, "error", err)
					s.emitEvent(EventClientError, map[string]any{
						"server_name": config.Name,
						"error":       err.Error(),
						"action":      "start",
					})
				} else {
					s.emitEvent(EventClientStatusChanged, map[string]any{
						"server_name": config.Name,
						"status":      "started",
					})
				}
			}()
		}

		// Emit event to notify frontend that servers have been updated
		s.emitEvent(EventServersUpdated, map[string]any{
			"added_server": config.Name,
			"action":       "added",
		})
		return nil
	}
	return fmt.Errorf("settings service not available")
}

// RemoveMCPServer removes an MCP server configuration
func (s *MCPService) RemoveMCPServer(name string) error {
	if s.settings != nil {
		// Stop the client if it's running (asynchronously)
		if s.server != nil {
			go func() {
				if err := s.server.GetClientManager().StopClient(name); err != nil {
					slog.Error("Failed to stop client before removal", "name", name, "error", err)
					// Continue with removal even if stop fails
				} else {
					s.emitEvent(EventClientStatusChanged, map[string]any{
						"server_name": name,
						"status":      "stopped",
					})
				}
			}()
		}

		err := s.settings.RemoveMCPServer(name)
		if err != nil {
			return err
		}

		// Emit event to notify frontend that servers have been updated
		s.emitEvent(EventServersUpdated, map[string]any{
			"removed_server": name,
			"action":         "removed",
		})
		return nil
	}
	return fmt.Errorf("settings service not available")
}

// UpdateMCPServer updates an MCP server configuration
func (s *MCPService) UpdateMCPServer(name string, config settings.MCPServerConfig) error {
	if s.settings != nil {
		// Get the old configuration before updating
		var oldConfig *settings.MCPServerConfig
		for _, server := range s.settings.GetMCPServers() {
			if server.Name == name {
				oldConfig = &server
				break
			}
		}

		if oldConfig == nil {
			return fmt.Errorf("server '%s' not found", name)
		}

		slog.Info("Updating MCP server configuration",
			"name", name,
			"old_enabled", oldConfig.Enabled,
			"new_enabled", config.Enabled,
			"enabled_changed", oldConfig.Enabled != config.Enabled)

		// Update the settings
		err := s.settings.UpdateMCPServer(name, config)
		if err != nil {
			return err
		}

		// Emit event to notify frontend that servers have been updated
		s.emitEvent(EventServersUpdated, map[string]any{
			"updated_server": name,
			"action":         "updated",
		})

		// Handle client connection/disconnection based on toggle state
		if s.server != nil {
			// Check if this is a toggle operation (enabled state changed)
			if oldConfig.Enabled != config.Enabled {
				if config.Enabled {
					// Server was enabled - start the client
					slog.Info("Starting client after enabling server", "name", name)
					go func() {
						if err := s.server.GetClientManager().StartClient(context.Background(), config); err != nil {
							slog.Error("Failed to start client after enabling", "name", name, "error", err)
							// Emit error event for the frontend
							s.emitEvent(EventClientError, map[string]any{
								"server_name": name,
								"error":       err.Error(),
								"action":      "start",
							})
						} else {
							// Emit success event
							s.emitEvent(EventClientStatusChanged, map[string]any{
								"server_name": name,
								"status":      "started",
							})
						}
					}()
				} else {
					// Server was disabled - stop the client asynchronously
					slog.Info("Stopping client after disabling server", "name", name)
					go func() {
						slog.Debug("Starting async stop operation", "name", name)
						startTime := time.Now()

						if err := s.server.GetClientManager().StopClient(name); err != nil {
							slog.Error("Failed to stop client after disabling", "name", name, "error", err, "duration", time.Since(startTime))
							// Emit error event for the frontend
							s.emitEvent(EventClientError, map[string]any{
								"server_name": name,
								"error":       err.Error(),
								"action":      "stop",
							})
						} else {
							slog.Info("Successfully stopped client after disabling", "name", name, "duration", time.Since(startTime))
							// Emit success event
							s.emitEvent(EventClientStatusChanged, map[string]any{
								"server_name": name,
								"status":      "stopped",
							})
						}
					}()
				}
			} else {
				// Configuration changed but enabled state didn't change
				// If the server is enabled, restart it to apply new configuration
				if config.Enabled {
					slog.Info("Restarting client to apply configuration changes", "name", name)
					go func() {
						if err := s.server.GetClientManager().RestartClient(context.Background(), name); err != nil {
							slog.Error("Failed to restart client after config change", "name", name, "error", err)
							s.emitEvent(EventClientError, map[string]any{
								"server_name": name,
								"error":       err.Error(),
								"action":      "restart",
							})
						} else {
							s.emitEvent(EventClientStatusChanged, map[string]any{
								"server_name": name,
								"status":      "restarted",
							})
						}
					}()
				}
			}
		}

		return nil
	}
	return fmt.Errorf("settings service not available")
}

// GetSettings returns the current settings
func (s *MCPService) GetSettings() *settings.Settings {
	if s.settings != nil {
		return s.settings.GetSettings()
	}
	return nil
}

// UpdateSettings updates the settings
func (s *MCPService) UpdateSettings(settings *settings.Settings) error {
	if s.settings != nil {
		return s.settings.UpdateSettings(settings)
	}
	return fmt.Errorf("settings service not available")
}

// StartClient starts an MCP client
func (s *MCPService) StartClient(config settings.MCPServerConfig) error {
	if s.server != nil {
		return s.server.GetClientManager().StartClient(context.Background(), config)
	}
	return fmt.Errorf("server not available")
}

// StopClient stops an MCP client
func (s *MCPService) StopClient(name string) error {
	if s.server != nil {
		return s.server.GetClientManager().StopClient(name)
	}
	return fmt.Errorf("server not available")
}

// RestartClient restarts an MCP client
func (s *MCPService) RestartClient(name string) error {
	if s.server == nil {
		return fmt.Errorf("server not available")
	}
	if err := s.server.GetClientManager().RestartClient(context.Background(), name); err != nil {
		// If client not found, try to start it from settings
		if strings.Contains(err.Error(), "not found") {
			if s.settings != nil {
				for _, cfg := range s.settings.GetMCPServers() {
					if cfg.Name == name {
						if !cfg.Enabled {
							return fmt.Errorf("server '%s' is disabled", name)
						}
						slog.Info("Client not found on restart; starting from settings", "name", name)
						return s.server.GetClientManager().StartClient(context.Background(), cfg)
					}
				}
			}
		}
		return err
	}
	return nil
}

// AuthorizeClient triggers OAuth authorization flow for a specific client
func (s *MCPService) AuthorizeClient(name string) error {
	if s.server != nil {
		return s.server.GetClientManager().AuthorizeClient(context.Background(), name)
	}
	return fmt.Errorf("server not available")
}

// GetClientStatus returns the status of all clients
func (s *MCPService) GetClientStatus() map[string]ClientStatus {
	if s.server != nil {
		return s.server.GetClientManager().GetClientStatus()
	}
	return make(map[string]ClientStatus)
}

// ReloadClients reloads all clients from settings
func (s *MCPService) ReloadClients() error {
	if s.settings != nil && s.server != nil {
		settings := s.settings.GetSettings()
		if settings != nil {
			err := s.server.GetClientManager().LoadClientsFromSettings(context.Background(), settings)
			if err != nil {
				return err
			}
			s.emitEvent(EventServersUpdated, map[string]any{})
			return nil
		}
	}
	return fmt.Errorf("settings or server not available")
}

// GetClientTools returns the tools for a specific client
func (s *MCPService) GetClientTools(clientName string) ([]map[string]interface{}, error) {
	if s.server != nil {
		tools, err := s.server.GetClientManager().GetClientTools(clientName)
		if err != nil {
			// Auto-start missing client if enabled, then retry once
			if strings.Contains(err.Error(), "not found") && s.settings != nil {
				for _, cfg := range s.settings.GetMCPServers() {
					if cfg.Name == clientName {
						if !cfg.Enabled {
							return nil, fmt.Errorf("server '%s' is disabled", clientName)
						}
						if startErr := s.server.GetClientManager().StartClient(context.Background(), cfg); startErr != nil {
							return nil, fmt.Errorf("failed to start client '%s': %w", clientName, startErr)
						}
						// Retry
						var retryErr error
						tools, retryErr = s.server.GetClientManager().GetClientTools(clientName)
						if retryErr != nil {
							return nil, retryErr
						}
						break
					}
				}
			} else {
				return nil, err
			}
		}

		// Convert tools to map format for JSON serialization
		toolMaps := make([]map[string]any, len(tools))
		for i, tool := range tools {
			toolMaps[i] = map[string]any{
				"name":        tool.Name,
				"description": tool.Description,
				"inputSchema": tool.InputSchema,
			}
		}

		return toolMaps, nil
	}
	return nil, fmt.Errorf("server not available")
}

// ToggleTool enables or disables a specific tool for a client
func (s *MCPService) ToggleTool(clientName string, toolName string, enabled bool) error {
	if s.server != nil {
		if err := s.server.GetClientManager().ToggleTool(clientName, toolName, enabled); err != nil {
			if strings.Contains(err.Error(), "not found") && s.settings != nil {
				for _, cfg := range s.settings.GetMCPServers() {
					if cfg.Name == clientName {
						if !cfg.Enabled {
							return fmt.Errorf("server '%s' is disabled", clientName)
						}
						if startErr := s.server.GetClientManager().StartClient(context.Background(), cfg); startErr != nil {
							return fmt.Errorf("failed to start client '%s': %w", clientName, startErr)
						}
						// Retry once
						return s.server.GetClientManager().ToggleTool(clientName, toolName, enabled)
					}
				}
			}
			return err
		}
		return nil
	}
	return fmt.Errorf("server not available")
}

func (s *MCPService) emitEvent(name string, data any) {
	slog.Info("Emitting event", "name", name, "data", data, "callback_count", s.GetCallbackCount())

	// Copy callbacks under read lock, then invoke without holding the lock
	s.callbacksMutex.RLock()
	callbacks := append([]func(e *application.CustomEvent){}, s.callbacks...)
	s.callbacksMutex.RUnlock()

	if len(callbacks) == 0 {
		slog.Debug("No callbacks registered for MCP service event", "name", name)
		return
	}

	event := &application.CustomEvent{
		Name:   name,
		Data:   data,
		Sender: "mcp_service",
	}

	for i, callback := range callbacks {
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("Panic in MCP service callback", "callback_index", i, "event_name", name, "panic", r)
				}
			}()
			callback(event)
		}()
	}
}
