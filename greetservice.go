package main

type GreetService struct{}

func (g *GreetService) Greet(name string) string {
	return "Yo " + name + "!"
}
