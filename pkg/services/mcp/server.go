package mcp

type MCPService struct{}

func (s *MCPService) List() ([]string, error) {
	return []string{
		"service1",
		"service2",
		"service3",
	}, nil
}
