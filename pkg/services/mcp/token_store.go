package mcp

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/adrg/xdg"
	"github.com/mark3labs/mcp-go/client/transport"
)

// FileTokenStore implements transport.TokenStore by persisting tokens to disk.
// It stores OAuth tokens in JSON format with secure file permissions (0600).
// Tokens are stored per-server using unique filenames in the user's config directory.
// Thread-safe operations are provided through mutex protection.
type FileTokenStore struct {
	filePath string
	mutex    sync.RWMutex
}

// NewFileTokenStore creates a new file-based token store using the default location
func NewFileTokenStore(serverName string) *FileTokenStore {
	filename := fmt.Sprintf("mcp-tokens-%s.json", serverName)
	filePath := filepath.Join(xdg.ConfigHome, "mcp-bouncer", filename)

	return NewFileTokenStoreWithPath(filePath)
}

// NewFileTokenStoreWithPath creates a new file-based token store with a custom file path
func NewFileTokenStoreWithPath(filePath string) *FileTokenStore {
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		slog.Warn("Failed to create token storage directory", "error", err, "path", filepath.Dir(filePath))
	}

	return &FileTokenStore{
		filePath: filePath,
	}
}

// GetToken retrieves a token from the file
func (f *FileTokenStore) GetToken() (*transport.Token, error) {
	f.mutex.RLock()
	defer f.mutex.RUnlock()

	slog.Debug("FileTokenStore: GetToken called", "path", f.filePath)

	if _, err := os.Stat(f.filePath); os.IsNotExist(err) {
		// Follow MemoryTokenStore pattern: return error when no token available
		slog.Debug("FileTokenStore: no token file found", "path", f.filePath)
		return nil, fmt.Errorf("no token available")
	}

	data, err := os.ReadFile(f.filePath)
	if err != nil {
		slog.Error("FileTokenStore: failed to read token file", "path", f.filePath, "error", err)
		return nil, fmt.Errorf("failed to read token file: %w", err)
	}

	var token transport.Token
	if err := json.Unmarshal(data, &token); err != nil {
		slog.Error("FileTokenStore: failed to parse token file", "path", f.filePath, "error", err)
		return nil, fmt.Errorf("failed to parse token file: %w", err)
	}

	slog.Debug("FileTokenStore: successfully loaded token", "path", f.filePath, "expires_at", token.ExpiresAt)
	return &token, nil
}

// SaveToken saves a token to the file
func (f *FileTokenStore) SaveToken(token *transport.Token) error {
	f.mutex.Lock()
	defer f.mutex.Unlock()

	data, err := json.MarshalIndent(token, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal token: %w", err)
	}

	if err := os.WriteFile(f.filePath, data, 0600); err != nil {
		return fmt.Errorf("failed to write token file: %w", err)
	}

	slog.Debug("Token saved to file", "path", f.filePath)
	return nil
}

// ClearToken removes the stored token file
func (f *FileTokenStore) ClearToken() error {
	f.mutex.Lock()
	defer f.mutex.Unlock()

	if err := os.Remove(f.filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove token file: %w", err)
	}

	slog.Debug("Token file cleared", "path", f.filePath)
	return nil
}

// GetTokenFilePath returns the path to the token file (for debugging/info purposes)
func (f *FileTokenStore) GetTokenFilePath() string {
	return f.filePath
}
