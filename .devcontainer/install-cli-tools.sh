#!/usr/bin/env bash
# install-tools.sh — Install modern CLI toolkit components
# Usage:
#   bash install-tools.sh [tool1] [tool2] ...
#   bash install-tools.sh --all
#   bash install-tools.sh --check
#
# Supported tools: jq, yq, rg, fd, fzf, lazygit, zoxide, eza

set -euo pipefail

# ── Versions (pinned for reproducibility) ───────────────────────────────────
JQ_VERSION="1.7.1"
YQ_VERSION="4.44.1"
RG_VERSION="14.1.1"
FD_VERSION="10.2.0"
FZF_VERSION="0.57.0"
LAZYGIT_VERSION="0.44.1"
ZOXIDE_VERSION="0.9.6"
EZA_VERSION="0.20.12"

# ── Platform detection ──────────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64)  ARCH_ALT="amd64"; ARCH_RG="x86_64" ;;
  aarch64|arm64) ARCH_ALT="arm64"; ARCH_RG="aarch64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$OS" in
  linux)  OS_ALT="linux"; OS_RG="linux" ;;
  darwin) OS_ALT="darwin"; OS_RG="apple-darwin" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR"

# Ensure install dir is on PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  export PATH="$INSTALL_DIR:$PATH"
  echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "${HOME}/.bashrc" 2>/dev/null || true
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# ── Helper functions ────────────────────────────────────────────────────────
installed() { command -v "$1" >/dev/null 2>&1; }

download() {
  local url="$1" dest="$2"
  if installed curl; then
    curl -fsSL "$url" -o "$dest"
  elif installed wget; then
    wget -q "$url" -O "$dest"
  else
    echo "Neither curl nor wget found"; exit 1
  fi
}

# ── Package manager detection ───────────────────────────────────────────────
HAS_APT=false
HAS_BREW=false
if installed apt-get; then HAS_APT=true; fi
if installed brew; then HAS_BREW=true; fi

apt_install() {
  sudo apt-get install -y "$@" >/dev/null 2>&1
}

# ── Tool installers ────────────────────────────────────────────────────────
# Strategy: try system package manager first (fast, reliable), fall back to
# GitHub releases if unavailable or if we need a specific version.

install_jq() {
  if installed jq; then echo "jq: already installed ($(jq --version))"; return; fi
  echo "Installing jq..."
  if $HAS_APT; then
    apt_install jq
  elif $HAS_BREW; then
    brew install jq >/dev/null 2>&1
  else
    local bin="jq-${OS_ALT}-${ARCH_ALT}"
    [[ "$OS" == "darwin" ]] && bin="jq-macos-${ARCH_ALT}"
    download "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/${bin}" "$INSTALL_DIR/jq"
    chmod +x "$INSTALL_DIR/jq"
  fi
  echo "jq: installed → $(jq --version)"
}

install_yq() {
  if installed yq; then echo "yq: already installed ($(yq --version 2>&1 | head -1))"; return; fi
  echo "Installing yq..."
  local bin="yq_${OS_ALT}_${ARCH_ALT}"
  download "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/${bin}" "$INSTALL_DIR/yq"
  chmod +x "$INSTALL_DIR/yq"
  echo "yq: installed → $(yq --version 2>&1 | head -1)"
}

install_rg() {
  if installed rg; then echo "rg: already installed ($(rg --version | head -1))"; return; fi
  echo "Installing ripgrep..."
  if $HAS_APT; then
    apt_install ripgrep
  elif $HAS_BREW; then
    brew install ripgrep >/dev/null 2>&1
  else
    local archive="ripgrep-${RG_VERSION}-${ARCH_RG}-unknown-${OS_RG}-musl.tar.gz"
    [[ "$OS" == "darwin" ]] && archive="ripgrep-${RG_VERSION}-${ARCH_RG}-${OS_RG}.tar.gz"
    download "https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${archive}" "$TMP_DIR/rg.tar.gz"
    tar xzf "$TMP_DIR/rg.tar.gz" -C "$TMP_DIR"
    cp "$TMP_DIR"/ripgrep-*/rg "$INSTALL_DIR/rg"
    chmod +x "$INSTALL_DIR/rg"
  fi
  echo "rg: installed → $(rg --version | head -1)"
}

install_fd() {
  if installed fd || installed fdfind; then
    local fd_cmd="fd"; installed fdfind && fd_cmd="fdfind"
    echo "fd: already installed ($($fd_cmd --version))"; return
  fi
  echo "Installing fd..."
  if $HAS_APT; then
    apt_install fd-find
    # On Debian/Ubuntu, the binary is called fdfind to avoid conflict
    if installed fdfind && ! installed fd; then
      ln -sf "$(which fdfind)" "$INSTALL_DIR/fd"
    fi
  elif $HAS_BREW; then
    brew install fd >/dev/null 2>&1
  else
    local archive="fd-v${FD_VERSION}-${ARCH_RG}-unknown-${OS_RG}-musl.tar.gz"
    [[ "$OS" == "darwin" ]] && archive="fd-v${FD_VERSION}-${ARCH_RG}-${OS_RG}.tar.gz"
    download "https://github.com/sharkdp/fd/releases/download/v${FD_VERSION}/${archive}" "$TMP_DIR/fd.tar.gz"
    tar xzf "$TMP_DIR/fd.tar.gz" -C "$TMP_DIR"
    cp "$TMP_DIR"/fd-v*/fd "$INSTALL_DIR/fd"
    chmod +x "$INSTALL_DIR/fd"
  fi
  local fd_cmd="fd"; installed fdfind && ! installed fd && fd_cmd="fdfind"
  echo "fd: installed → $($fd_cmd --version)"
}

install_fzf() {
  if installed fzf; then echo "fzf: already installed ($(fzf --version | head -1))"; return; fi
  echo "Installing fzf..."
  if $HAS_APT; then
    apt_install fzf
  elif $HAS_BREW; then
    brew install fzf >/dev/null 2>&1
  else
    local archive="fzf-${FZF_VERSION}-${OS_ALT}_${ARCH_ALT}.tar.gz"
    download "https://github.com/junegunn/fzf/releases/download/v${FZF_VERSION}/${archive}" "$TMP_DIR/fzf.tar.gz"
    tar xzf "$TMP_DIR/fzf.tar.gz" -C "$TMP_DIR"
    cp "$TMP_DIR/fzf" "$INSTALL_DIR/fzf"
    chmod +x "$INSTALL_DIR/fzf"
  fi
  echo "fzf: installed → $(fzf --version | head -1)"
}

install_lazygit() {
  if installed lazygit; then echo "lazygit: already installed ($(lazygit --version | head -1))"; return; fi
  echo "Installing lazygit..."
  local lg_os="Linux" lg_arch="x86_64"
  [[ "$OS" == "darwin" ]] && lg_os="Darwin"
  [[ "$ARCH_ALT" == "arm64" ]] && lg_arch="arm64"
  local archive="lazygit_${LAZYGIT_VERSION}_${lg_os}_${lg_arch}.tar.gz"
  download "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/${archive}" "$TMP_DIR/lazygit.tar.gz"
  tar xzf "$TMP_DIR/lazygit.tar.gz" -C "$TMP_DIR"
  cp "$TMP_DIR/lazygit" "$INSTALL_DIR/lazygit"
  chmod +x "$INSTALL_DIR/lazygit"
  echo "lazygit: installed → $(lazygit --version | head -1)"
}

install_zoxide() {
  if installed zoxide; then echo "zoxide: already installed ($(zoxide --version))"; return; fi
  echo "Installing zoxide..."
  if $HAS_APT && [[ "$(lsb_release -rs 2>/dev/null)" > "23" ]]; then
    apt_install zoxide
  else
    local archive="zoxide-${ZOXIDE_VERSION}-${ARCH_RG}-unknown-${OS_RG}-musl.tar.gz"
    [[ "$OS" == "darwin" ]] && archive="zoxide-${ZOXIDE_VERSION}-${ARCH_RG}-${OS_RG}.tar.gz"
    download "https://github.com/ajeetdsouza/zoxide/releases/download/v${ZOXIDE_VERSION}/${archive}" "$TMP_DIR/zoxide.tar.gz"
    tar xzf "$TMP_DIR/zoxide.tar.gz" -C "$TMP_DIR"
    cp "$TMP_DIR/zoxide" "$INSTALL_DIR/zoxide"
    chmod +x "$INSTALL_DIR/zoxide"
  fi
  echo "zoxide: installed → $(zoxide --version)"
}

install_eza() {
  if installed eza; then echo "eza: already installed ($(eza --version | head -1))"; return; fi
  echo "Installing eza..."
  if $HAS_APT; then
    # eza needs its own repo on older Ubuntu
    if ! apt_install eza; then
      local eza_arch="x86_64"
      [[ "$ARCH_ALT" == "arm64" ]] && eza_arch="aarch64"
      local archive="eza_${eza_arch}-unknown-${OS_RG}-musl.tar.gz"
      [[ "$OS" == "darwin" ]] && archive="eza_${eza_arch}-${OS_RG}.tar.gz"
      download "https://github.com/eza-community/eza/releases/download/v${EZA_VERSION}/${archive}" "$TMP_DIR/eza.tar.gz"
      tar xzf "$TMP_DIR/eza.tar.gz" -C "$TMP_DIR"
      find "$TMP_DIR" -name 'eza' -type f -exec cp {} "$INSTALL_DIR/eza" \;
      chmod +x "$INSTALL_DIR/eza"
    fi
  elif $HAS_BREW; then
    brew install eza >/dev/null 2>&1
  else
    local eza_arch="x86_64"
    [[ "$ARCH_ALT" == "arm64" ]] && eza_arch="aarch64"
    local archive="eza_${eza_arch}-unknown-${OS_RG}-musl.tar.gz"
    [[ "$OS" == "darwin" ]] && archive="eza_${eza_arch}-${OS_RG}.tar.gz"
    download "https://github.com/eza-community/eza/releases/download/v${EZA_VERSION}/${archive}" "$TMP_DIR/eza.tar.gz"
    tar xzf "$TMP_DIR/eza.tar.gz" -C "$TMP_DIR"
    find "$TMP_DIR" -name 'eza' -type f -exec cp {} "$INSTALL_DIR/eza" \;
    chmod +x "$INSTALL_DIR/eza"
  fi
  echo "eza: installed → $(eza --version | head -1)"
}

# ── Main ────────────────────────────────────────────────────────────────────

ALL_TOOLS=(jq yq rg fd fzf lazygit zoxide eza)

check_tools() {
  echo "Tool availability:"
  for tool in "${ALL_TOOLS[@]}"; do
    if installed "$tool"; then
      local ver
      case "$tool" in
        jq) ver=$(jq --version 2>&1) ;;
        yq) ver=$(yq --version 2>&1 | head -1) ;;
        rg) ver=$(rg --version 2>&1 | head -1) ;;
        fd) ver=$(fd --version 2>&1) ;;
        fzf) ver=$(fzf --version 2>&1 | head -1) ;;
        lazygit) ver=$(lazygit --version 2>&1 | head -1) ;;
        zoxide) ver=$(zoxide --version 2>&1) ;;
        eza) ver=$(eza --version 2>&1 | head -1) ;;
      esac
      echo "  ✓ $tool: $ver"
    else
      echo "  ✗ $tool: not installed"
    fi
  done
}

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 [--all | --check | tool1 tool2 ...]"
  echo "Tools: ${ALL_TOOLS[*]}"
  exit 0
fi

case "$1" in
  --check) check_tools; exit 0 ;;
  --all) TOOLS=("${ALL_TOOLS[@]}") ;;
  *) TOOLS=("$@") ;;
esac

for tool in "${TOOLS[@]}"; do
  case "$tool" in
    jq)      install_jq ;;
    yq)      install_yq ;;
    rg)      install_rg ;;
    fd)      install_fd ;;
    fzf)     install_fzf ;;
    lazygit) install_lazygit ;;
    zoxide)  install_zoxide ;;
    eza)     install_eza ;;
    *) echo "Unknown tool: $tool (supported: ${ALL_TOOLS[*]})"; exit 1 ;;
  esac
done

echo ""
echo "Installation complete. Tools are in: $INSTALL_DIR"
echo "Run '$0 --check' to verify."
