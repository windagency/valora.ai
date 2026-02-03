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

echo "Development tools installation complete."
