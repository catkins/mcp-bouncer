package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/catkins/mcp-bouncer-poc/pkg/services/settings"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

// ClientManager manages MCP client connections
type ClientManager struct {
	clients map[string]*ManagedClient
	mutex   sync.RWMutex
	server  *Server
}

// ManagedClient represents a managed MCP client connection
type ManagedClient struct {
	Config      settings.MCPServerConfig
	Client      *client.Client
	Transport   transport.Interface
	Tools       []mcp.Tool
	Connected   bool
	LastError   error
	StopChan    chan struct{}
	RestartChan chan struct{}
}

// NewClientManager creates a new client manager
func NewClientManager(server *Server) *ClientManager {
	return &ClientManager{
		clients: make(map[string]*ManagedClient),
		server:  server,
	}
}

// StartClient starts an MCP client based on configuration
func (cm *ClientManager) StartClient(ctx context.Context, config settings.MCPServerConfig) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	// Check if client already exists
	if existing, exists := cm.clients[config.Name]; exists {
		if existing.Connected {
			return fmt.Errorf("client '%s' is already running", config.Name)
		}
		// Clean up existing client
		cm.stopClientInternal(config.Name)
	}

	// Create new managed client
	mc := &ManagedClient{
		Config:      config,
		Connected:   false,
		StopChan:    make(chan struct{}),
		RestartChan: make(chan struct{}),
	}

	// Start the client process and create transport
	if err := cm.startClientProcess(mc); err != nil {
		return fmt.Errorf("failed to start client process: %w", err)
	}

	// Create client
	mcpClient := client.NewClient(mc.Transport)
	mc.Client = mcpClient

	// Start the client
	if err := mc.Client.Start(ctx); err != nil {
		cm.stopClientInternal(config.Name)
		return fmt.Errorf("failed to start client: %w", err)
	}

	// Initialize the client
	if err := cm.initializeClient(ctx, mc); err != nil {
		cm.stopClientInternal(config.Name)
		return fmt.Errorf("failed to initialize client: %w", err)
	}

	// Register tools with the main server
	if err := cm.registerClientTools(ctx, mc); err != nil {
		cm.stopClientInternal(config.Name)
		return fmt.Errorf("failed to register client tools: %w", err)
	}

	mc.Connected = true
	cm.clients[config.Name] = mc

	// Start monitoring goroutine
	go cm.monitorClient(ctx, mc)

	slog.Info("Started MCP client", "name", config.Name, "tools", len(mc.Tools))
	return nil
}

// StopClient stops an MCP client
func (cm *ClientManager) StopClient(name string) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	return cm.stopClientInternal(name)
}

// stopClientInternal stops a client (assumes lock is held)
func (cm *ClientManager) stopClientInternal(name string) error {
	mc, exists := cm.clients[name]
	if !exists {
		// Client doesn't exist, which is fine when disabling a server
		slog.Debug("Client not found when stopping", "name", name)
		return nil
	}

	// Signal stop
	close(mc.StopChan)

	// Remove tools from main server
	cm.removeClientTools(mc)

	// Close transport with timeout to prevent hanging
	if mc.Transport != nil {
		done := make(chan struct{})
		go func() {
			mc.Transport.Close()
			close(done)
		}()

		// Wait for transport close with timeout
		select {
		case <-done:
			slog.Debug("Transport closed successfully", "name", name)
		case <-time.After(5 * time.Second):
			slog.Warn("Transport close timed out", "name", name)
		}
	}

	// Remove from clients map
	delete(cm.clients, name)

	slog.Info("Stopped MCP client", "name", name)
	return nil
}

// RestartClient restarts an MCP client
func (cm *ClientManager) RestartClient(ctx context.Context, name string) error {
	cm.mutex.Lock()
	mc, exists := cm.clients[name]
	if !exists {
		cm.mutex.Unlock()
		return fmt.Errorf("client '%s' not found", name)
	}
	config := mc.Config
	cm.mutex.Unlock()

	// Stop the client
	if err := cm.StopClient(name); err != nil {
		return fmt.Errorf("failed to stop client: %w", err)
	}

	// Wait a bit before restarting
	time.Sleep(1 * time.Second)

	// Start the client again
	return cm.StartClient(ctx, config)
}

// GetClientStatus returns the status of all clients
func (cm *ClientManager) GetClientStatus() map[string]ClientStatus {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	status := make(map[string]ClientStatus)
	for name, mc := range cm.clients {
		status[name] = ClientStatus{
			Name:      name,
			Connected: mc.Connected,
			Tools:     len(mc.Tools),
			LastError: mc.LastError,
		}
	}
	return status
}

// ClientStatus represents the status of a client
type ClientStatus struct {
	Name      string `json:"name"`
	Connected bool   `json:"connected"`
	Tools     int    `json:"tools"`
	LastError error  `json:"last_error,omitempty"`
}

// startClientProcess starts the client process
func (cm *ClientManager) startClientProcess(mc *ManagedClient) error {
	switch mc.Config.Transport {
	case settings.TransportStdio:
		// Create stdio transport
		mc.Transport = transport.NewStdio(mc.Config.Command, []string{}, mc.Config.Args...)

	case settings.TransportSSE:
		// Create SSE transport
		if mc.Config.Endpoint == "" {
			return fmt.Errorf("endpoint is required for SSE transport")
		}

		var options []transport.ClientOption
		if mc.Config.Headers != nil {
			options = append(options, transport.WithHeaders(mc.Config.Headers))
		}

		sseTransport, err := transport.NewSSE(mc.Config.Endpoint, options...)
		if err != nil {
			return fmt.Errorf("failed to create SSE transport: %w", err)
		}
		mc.Transport = sseTransport

	case settings.TransportStreamableHTTP:
		// Create streamable HTTP transport
		if mc.Config.Endpoint == "" {
			return fmt.Errorf("endpoint is required for streamable HTTP transport")
		}

		var options []transport.StreamableHTTPCOption
		if mc.Config.Headers != nil {
			options = append(options, transport.WithHTTPHeaders(mc.Config.Headers))
		}

		httpTransport, err := transport.NewStreamableHTTP(mc.Config.Endpoint, options...)
		if err != nil {
			return fmt.Errorf("failed to create streamable HTTP transport: %w", err)
		}
		mc.Transport = httpTransport

	default:
		return fmt.Errorf("unsupported transport type: %s", mc.Config.Transport)
	}

	return nil
}

// initializeClient initializes the MCP client
func (cm *ClientManager) initializeClient(ctx context.Context, mc *ManagedClient) error {
	initializeRequest := mcp.InitializeRequest{}
	initializeRequest.Params.ClientInfo.Name = "mcp-bouncer"
	initializeRequest.Params.ClientInfo.Version = "0.0.1"

	_, err := mc.Client.Initialize(ctx, initializeRequest)
	if err != nil {
		return fmt.Errorf("failed to initialize client: %w", err)
	}

	return nil
}

// registerClientTools registers tools from the client with the main server
func (cm *ClientManager) registerClientTools(ctx context.Context, mc *ManagedClient) error {
	listToolsResult, err := mc.Client.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		return fmt.Errorf("failed to list tools: %w", err)
	}

	mc.Tools = listToolsResult.Tools

	// Register each tool with the main server
	for _, tool := range listToolsResult.Tools {
		// Create a proxy handler that forwards calls to the client
		handler := func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			// Strip the prefix from the tool name for the client call
			request.Params.Name = tool.Name

			slog.Info("Calling tool",
				"client", mc.Config.Name,
				"original_tool", tool.Name,
				"prefixed_tool", request.Params.Name,
				"request", request)

			// Call the client with the original tool name
			return mc.Client.CallTool(ctx, request)
		}

		// Add tool to main server with prefixed name to avoid conflicts
		prefixedName := fmt.Sprintf("%s:%s", mc.Config.Name, tool.Name)
		prefixedTool := mcp.Tool{
			Name:        prefixedName,
			Description: fmt.Sprintf("[%s] %s", mc.Config.Name, tool.Description),
			InputSchema: tool.InputSchema,
		}

		cm.server.mcp.AddTool(prefixedTool, handler)
		slog.Debug("Registered client tool", "client", mc.Config.Name, "tool", tool.Name, "prefixed_name", prefixedName)
	}

	return nil
}

// removeClientTools removes tools from the main server
func (cm *ClientManager) removeClientTools(mc *ManagedClient) {
	for _, tool := range mc.Tools {
		prefixedName := fmt.Sprintf("%s:%s", mc.Config.Name, tool.Name)
		cm.server.mcp.DeleteTools(prefixedName)
		slog.Debug("Removed client tool", "client", mc.Config.Name, "tool", tool.Name, "prefixed_name", prefixedName)
	}
	mc.Tools = nil
}

// monitorClient monitors the client for disconnections and restarts
func (cm *ClientManager) monitorClient(ctx context.Context, mc *ManagedClient) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-mc.StopChan:
			return
		case <-mc.RestartChan:
			slog.Info("Restarting client", "name", mc.Config.Name)
			if err := cm.RestartClient(ctx, mc.Config.Name); err != nil {
				slog.Error("Failed to restart client", "name", mc.Config.Name, "error", err)
			}
			return
		case <-ticker.C:
			// For now, we'll rely on the transport to handle process monitoring
			// The transport will close if the process exits, which will be detected
			// when we try to make calls to the client
		}
	}
}

// LoadClientsFromSettings loads and starts clients based on settings
func (cm *ClientManager) LoadClientsFromSettings(ctx context.Context, settings *settings.Settings) error {
	slog.Info("Starting to load clients from settings", "total_clients", len(settings.MCPServers))

	// Stop all existing clients
	cm.mutex.Lock()
	for name := range cm.clients {
		slog.Info("Stopping existing client", "name", name)
		cm.stopClientInternal(name)
	}
	cm.mutex.Unlock()

	// Start enabled clients
	for _, config := range settings.MCPServers {
		if config.Enabled {
			slog.Info("Starting enabled client", "name", config.Name, "command", config.Command)
			if err := cm.StartClient(ctx, config); err != nil {
				slog.Error("Failed to start client", "name", config.Name, "error", err)
				// Continue with other clients
			} else {
				slog.Info("Successfully started client", "name", config.Name)
			}
		} else {
			slog.Info("Skipping disabled client", "name", config.Name)
		}
	}

	slog.Info("Finished loading clients from settings")
	return nil
}

// StopAllClients stops all managed clients
func (cm *ClientManager) StopAllClients() {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	for name := range cm.clients {
		cm.stopClientInternal(name)
	}
}

// GetClientTools returns the tools for a specific client
func (cm *ClientManager) GetClientTools(clientName string) ([]mcp.Tool, error) {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	mc, exists := cm.clients[clientName]
	if !exists {
		return nil, fmt.Errorf("client '%s' not found", clientName)
	}

	if !mc.Connected {
		return nil, fmt.Errorf("client '%s' is not connected", clientName)
	}

	return mc.Tools, nil
}

// ToggleTool enables or disables a specific tool for a client
func (cm *ClientManager) ToggleTool(clientName string, toolName string, enabled bool) error {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	mc, exists := cm.clients[clientName]
	if !exists {
		return fmt.Errorf("client '%s' not found", clientName)
	}

	if !mc.Connected {
		return fmt.Errorf("client '%s' is not connected", clientName)
	}

	// Find the tool
	var targetTool *mcp.Tool
	for _, tool := range mc.Tools {
		if tool.Name == toolName {
			targetTool = &tool
			break
		}
	}

	if targetTool == nil {
		return fmt.Errorf("tool '%s' not found in client '%s'", toolName, clientName)
	}

	prefixedName := fmt.Sprintf("%s:%s", clientName, toolName)

	if enabled {
		// Re-register the tool
		handler := func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			// Strip the prefix from the tool name for the client call
			request.Params.Name = toolName

			slog.Info("Calling tool",
				"client", mc.Config.Name,
				"original_tool", toolName,
				"prefixed_tool", request.Params.Name,
				"request", request)

			// Call the client with the original tool name
			return mc.Client.CallTool(ctx, request)
		}

		prefixedTool := mcp.Tool{
			Name:        prefixedName,
			Description: fmt.Sprintf("[%s] %s", mc.Config.Name, targetTool.Description),
			InputSchema: targetTool.InputSchema,
		}

		cm.server.mcp.AddTool(prefixedTool, handler)
		slog.Debug("Re-enabled client tool", "client", mc.Config.Name, "tool", toolName, "prefixed_name", prefixedName)
	} else {
		// Remove the tool
		cm.server.mcp.DeleteTools(prefixedName)
		slog.Debug("Disabled client tool", "client", mc.Config.Name, "tool", toolName, "prefixed_name", prefixedName)
	}

	return nil
}
