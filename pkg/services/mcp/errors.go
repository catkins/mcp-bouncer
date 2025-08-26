package mcp

import "errors"

// ErrClientNotFound is returned when a client lookup by name fails
var ErrClientNotFound = errors.New("client not found")
