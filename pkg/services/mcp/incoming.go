package mcp

import (
	"sort"
	"sync"
	"time"
)

type IncomingClient struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	Title       string    `json:"title,omitempty"`
	ConnectedAt time.Time `json:"connected_at"`
}

type IncomingClientRegistry struct {
	mu      sync.RWMutex
	items   map[string]IncomingClient
	emitter func(name string, data any)
}

func NewIncomingClientRegistry(s *Server) *IncomingClientRegistry {
	return &IncomingClientRegistry{
		items:   make(map[string]IncomingClient),
		emitter: s.EmitEvent,
	}
}

func (r *IncomingClientRegistry) AddOrUpdate(id, name, version, title string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items[id] = IncomingClient{
		ID:          id,
		Name:        name,
		Version:     version,
		Title:       title,
		ConnectedAt: time.Now(),
	}
}

func (r *IncomingClientRegistry) Remove(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.items[id]; ok {
		delete(r.items, id)
		return true
	}
	return false
}

func (r *IncomingClientRegistry) List() []IncomingClient {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]IncomingClient, 0, len(r.items))
	for _, v := range r.items {
		out = append(out, v)
	}
	// Deterministic ordering: by Name, then ConnectedAt, then ID
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		if !out[i].ConnectedAt.Equal(out[j].ConnectedAt) {
			return out[i].ConnectedAt.Before(out[j].ConnectedAt)
		}
		return out[i].ID < out[j].ID
	})
	return out
}
