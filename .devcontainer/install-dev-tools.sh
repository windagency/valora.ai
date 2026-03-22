#!/bin/bash
set -e

echo "Installing development tools..."

# Ensure pnpm global bin directory exists
echo "Configuring pnpm..."
mkdir -p /home/node/.local/share/pnpm

# Ensure npm global bin directory exists (user-local, no sudo needed)
echo "Configuring npm..."
mkdir -p /home/node/.npm-global

# Install Docker CLI if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker CLI..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update
    sudo apt-get install -y docker-ce-cli docker-buildx-plugin docker-compose-plugin
else
    echo "Docker CLI already installed."
fi

# Create docker group if it doesn't exist and add node user
if ! getent group docker > /dev/null 2>&1; then
    echo "Creating docker group..."
    sudo groupadd docker
fi
echo "Adding node user to docker group..."
sudo usermod -aG docker node

# Fix docker socket permissions (host socket may have different group ownership)
# Use chmod 666 to ensure access regardless of group membership propagation timing
if [ -S /var/run/docker.sock ]; then
    echo "Fixing docker socket permissions..."
    sudo chown root:docker /var/run/docker.sock
    sudo chmod 666 /var/run/docker.sock
fi

# Install Claude CLI via native installer
if ! command -v claude &> /dev/null; then
    echo "Installing Claude CLI..."
    sudo pnpm add -g @anthropic-ai/claude-code
else
    echo "Claude CLI already installed."
fi

# Install Claude Code plugins for this project
if command -v claude &> /dev/null; then
    echo "Installing Claude Code plugins..."
    cd /workspaces/valora

    # Add the visual-explainer marketplace if not already present
    claude plugins marketplace add https://github.com/nicobailon/visual-explainer.git 2>/dev/null || true

    # Install plugins with project scope
    claude plugins install frontend-design@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install superpowers@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install context7@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install code-review@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install code-simplifier@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install feature-dev@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install playwright@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install ralph-loop@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install typescript-lsp@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install security-guidance@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install serena@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install pr-review-toolkit@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install explanatory-output-style@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install greptile@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install hookify@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install playground@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install learning-output-style@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install semgrep@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install chrome-devtools-mcp@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install sourcegraph@claude-plugins-official --scope project 2>/dev/null || true
    claude plugins install visual-explainer@visual-explainer-marketplace --scope project 2>/dev/null || true

    echo "Claude Code plugins installation complete."
fi

# Install modern CLI tools (from documentation modern-cli-toolkit)
echo "Installing modern CLI tools..."
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
bash "${SCRIPT_DIR}/scripts/install-cli-tools.sh" jq yq rg fd

echo "Development tools installation complete."
