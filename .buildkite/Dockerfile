FROM rust:1-bookworm

# Base utilities + Node.js 22 LTS
RUN apt-get update && apt-get install -y \
  curl \
  ca-certificates \
  gnupg \
  build-essential \
  libkeyutils-dev \
  keyutils \
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

# Use a more memory-efficient linker for large Rust link steps
# lld dramatically reduces peak memory vs GNU ld for our dependency graph
RUN apt-get update && apt-get install -y clang lld && rm -rf /var/lib/apt/lists/*
ENV CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=clang
ENV RUSTFLAGS="-C link-arg=-fuse-ld=lld"

# Install Tauri CLI for cargo subcommand
RUN cargo install tauri-cli --locked
RUN rustup component add clippy

WORKDIR /app

# Cache frontend dependencies
ADD package.json package-lock.json ./
RUN npm ci

# Copy the project
COPY . .
