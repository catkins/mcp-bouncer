FROM golang:1.25-bookworm

# base utilities needed for installs
RUN apt-get update && apt-get install -y \
  curl \
  ca-certificates \
  gnupg \
  && rm -rf /var/lib/apt/lists/*

# install nodejs 22 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

# Webkit & GTK deps
RUN apt-get update && apt-get install -y \
  gcc \
  libc6-dev \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  && rm -rf /var/lib/apt/lists/*

# install taskfile.dev
# https://taskfile.dev/installation/#install-script
RUN sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin v3.43.3

# install Wails3 CLI and add to PATH
RUN go install github.com/wailsapp/wails/v3/cmd/wails3@latest
ENV PATH="/root/go/bin:${PATH}"

WORKDIR /app

# add frontend deps
ADD frontend/package.json frontend/
ADD frontend/package-lock.json frontend/
RUN cd frontend && npm ci

# add go deps
ADD go.mod .
ADD go.sum .
RUN go mod download

COPY . .
