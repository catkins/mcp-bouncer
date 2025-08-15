FROM golang:1.24.6

# Set environment variables
ENV GOOS=linux
ENV GOARCH=amd64
ENV CGO_ENABLED=1

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get update && apt-get install -y nodejs

# Install Wails3 CLI
RUN go install github.com/wailsapp/wails/v3/cmd/wails@latest

# Install build dependencies for Wails3
RUN apt-get update && apt-get install -y \
    gcc \
    libc6-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace

# Add wails to PATH
ENV PATH="/root/go/bin:${PATH}"

# Default command
CMD ["bash"]
