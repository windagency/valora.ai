#!/usr/bin/env bash
set -e

# --------------------------------------------------
# Persistent shell history (stored on a Docker volume)
# --------------------------------------------------
HIST_DIR="/shellhistory"
if [ -d "$HIST_DIR" ]; then
    # Ensure the volume directory is writable by vscode
    sudo chown node:node "$HIST_DIR"

    # Touch history files so they exist before shells reference them
    touch "$HIST_DIR/.bash_history" "$HIST_DIR/.zsh_history"

    # Bash: point HISTFILE at the volume
    grep -qF "/shellhistory" ~/.bashrc 2>/dev/null || cat >> ~/.bashrc << 'BASH_HIST'

# Persistent shell history (Docker volume)
export HISTFILE="/shellhistory/.bash_history"
export HISTSIZE=10000
export HISTFILESIZE=20000
BASH_HIST

    # Zsh: point HISTFILE at the volume
    grep -qF "/shellhistory" ~/.zshrc 2>/dev/null || cat >> ~/.zshrc << 'ZSH_HIST'

# Persistent shell history (Docker volume)
export HISTFILE="/shellhistory/.zsh_history"
export HISTSIZE=10000
export SAVEHIST=20000
ZSH_HIST
fi

# --------------------------------------------------
# Persistent Claude Code history (stored on a Docker volume)
# --------------------------------------------------
CLAUDE_VOL="/claude-history"
if [ -d "$CLAUDE_VOL" ]; then
    # Ensure the volume directory is writable by node
    sudo chown node:node "$CLAUDE_VOL"

    # First run: seed the volume with any files the Claude feature already wrote
    if [ -d "$HOME/.claude" ] && [ -z "$(ls -A "$CLAUDE_VOL")" ]; then
        cp -a "$HOME/.claude/." "$CLAUDE_VOL/"
    fi

    # Replace ~/.claude with a symlink to the volume
    rm -rf "$HOME/.claude"
    ln -s "$CLAUDE_VOL" "$HOME/.claude"
fi

# --------------------------------------------------
# Zsh plugins
# --------------------------------------------------
ZSH_CUSTOM="${ZSH_CUSTOM:-/home/node/.oh-my-zsh/custom}"

git clone https://github.com/zsh-users/zsh-autosuggestions \
    "$ZSH_CUSTOM/plugins/zsh-autosuggestions" 2>/dev/null || true

git clone https://github.com/zsh-users/zsh-syntax-highlighting \
    "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" 2>/dev/null || true

sed -i 's/plugins=(git)/plugins=(git zsh-autosuggestions zsh-syntax-highlighting)/' \
    ~/.zshrc || true
