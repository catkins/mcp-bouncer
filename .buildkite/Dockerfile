FROM rust:1-bookworm

# Base utilities + Node.js 22 LTS
RUN apt-get update && apt-get install -y \
  curl \
  ca-certificates \
  gnupg \
  build-essential \
  pkg-config \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get update && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Tauri Linux deps (WebKit/GTK)
RUN apt-get update && apt-get install -y \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache frontend dependencies
ADD package.json package-lock.json ./
RUN npm ci

# Copy the project
COPY . .

# Install Tauri CLI for cargo subcommand
RUN cargo install tauri-cli --locked
