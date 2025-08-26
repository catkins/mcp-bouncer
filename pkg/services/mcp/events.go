package mcp

// Event name constants to avoid string duplication/typos
const (
	EventClientStatusChanged        = "mcp:client_status_changed"
	EventClientError                = "mcp:client_error"
	EventServersUpdated             = "mcp:servers_updated"
	EventIncomingClientConnected    = "mcp:incoming_client_connected"
	EventIncomingClientDisconnected = "mcp:incoming_client_disconnected"
	EventIncomingClientsUpdated     = "mcp:incoming_clients_updated"
)
