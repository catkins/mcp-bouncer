package mcp

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type MCPService struct {
	addr     string
	callback func(e *application.CustomEvent)
}

func NewMCPService() *MCPService {
	return &MCPService{
		addr: "http://localhost:8080/mcp",
	}
}

func (s *MCPService) Start(ctx context.Context) error {
	ticker := time.NewTicker(5 * time.Second)
	for {
		select {
		case <-ticker.C:

			s.callback(&application.CustomEvent{
				Name: "mcp:servers_updated",
				Data: map[string]any{},
			})

		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (s *MCPService) Subscribe(callback func(e *application.CustomEvent)) {
	s.callback = callback
}

func (s *MCPService) List() ([]string, error) {
	servers := []string{}
	for i := range rand.Intn(10) {
		servers = append(servers, fmt.Sprintf("service%d", i+1))
	}
	return servers, nil
}

func (s *MCPService) ListenAddr() string {
	return s.addr
}
