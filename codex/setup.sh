#!/usr/bin/env bash
set -euo pipefail

# Setup script for Codex environments
# Installs toolchains and system dependencies for Tauri and DuckDB.

# Trust mise configuration and install required toolchains
mise trust >/dev/null 2>&1 || true
mise install rust node

# Install system dependencies
apt-get update
apt-get install -y \
  curl \
  ca-certificates \
  gnupg \
  build-essential \
  pkg-config \
  unzip \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf

# Install DuckDB CLI
DUCKDB_VERSION=${DUCKDB_VERSION:-0.10.2}
curl -L "https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VERSION}/duckdb_cli-linux-amd64.zip" -o duckdb_cli.zip
unzip -p duckdb_cli.zip duckdb > /usr/local/bin/duckdb
chmod +x /usr/local/bin/duckdb
rm duckdb_cli.zip

# Install Rust components and Tauri CLI
cargo install tauri-cli --locked
rustup component add clippy
