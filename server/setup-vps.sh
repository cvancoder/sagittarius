#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Sagittarius Dev VPS — One-Time Setup
#
# Run this on a fresh Ubuntu 22.04/24.04 VPS:
#   curl -sSL https://raw.githubusercontent.com/YOURUSER/sagittarius/main/server/setup-vps.sh | bash
#
# Or copy it over and run:
#   chmod +x setup-vps.sh && sudo ./setup-vps.sh
#
# What it does:
#   1. Creates a non-root user 'sagdev'
#   2. Installs Node.js, nginx, tmux
#   3. Installs Claude Code
#   4. Clones your repo
#   5. Runs the first build
#   6. Configures nginx to serve the built HTML
#   7. Prints next steps
# ═══════════════════════════════════════════════════════════

set -e

# ── CONFIG ──
REPO_URL="https://github.com/YOURUSER/sagittarius.git"  # ← CHANGE THIS
DOMAIN="dev.pageranger.com"                               # ← CHANGE THIS (or use the VPS IP)
PROJECT_DIR="/home/sagdev/sagittarius"

echo "═══ Sagittarius Dev VPS Setup ═══"
echo ""

# Must run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo ./setup-vps.sh"
  exit 1
fi

# ── 1. System updates ──
echo "→ Updating system..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Create dev user ──
if ! id "sagdev" &>/dev/null; then
  echo "→ Creating user 'sagdev'..."
  adduser --disabled-password --gecos "" sagdev
  usermod -aG sudo sagdev
  echo "sagdev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/sagdev
fi

# ── 3. Install essentials ──
echo "→ Installing nginx, tmux, git..."
apt-get install -y -qq nginx tmux git curl ufw

# ── 4. Install Node.js 22 LTS ──
echo "→ Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
apt-get install -y -qq nodejs

# ── 5. Install Claude Code ──
echo "→ Installing Claude Code..."
npm install -g @anthropic-ai/claude-code > /dev/null 2>&1

# ── 6. Clone repo ──
echo "→ Cloning repository..."
sudo -u sagdev git clone "$REPO_URL" "$PROJECT_DIR" 2>/dev/null || {
  echo "   Repo already exists, pulling latest..."
  sudo -u sagdev git -C "$PROJECT_DIR" pull
}

# ── 7. First build ──
echo "→ Running first build..."
sudo -u sagdev bash -c "cd $PROJECT_DIR && chmod +x build.sh && ./build.sh"

# ── 8. Configure nginx ──
echo "→ Configuring nginx..."
cat > /etc/nginx/sites-available/sagittarius << 'NGINX'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    root PROJECT_DIR_PLACEHOLDER;
    index sag_build.html;

    location / {
        try_files $uri $uri/ /sag_build.html;
    }

    # Cache-bust: never cache the built HTML
    location = /sag_build.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Allow Google Fonts for Barlow Semi Condensed
    add_header Content-Security-Policy "default-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;";
}
NGINX

# Replace placeholders
sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" /etc/nginx/sites-available/sagittarius
sed -i "s|PROJECT_DIR_PLACEHOLDER|$PROJECT_DIR|g" /etc/nginx/sites-available/sagittarius

# Enable site
ln -sf /etc/nginx/sites-available/sagittarius /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t && systemctl reload nginx

# ── 9. Firewall ──
echo "→ Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx HTTP'
ufw --force enable

# ── 10. Done ──
echo ""
echo "═══════════════════════════════════════════════════"
echo "  SETUP COMPLETE"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Preview URL:  http://$DOMAIN"
echo "  Project dir:  $PROJECT_DIR"
echo "  Dev user:     sagdev"
echo ""
echo "  NEXT STEPS:"
echo ""
echo "  1. SSH in as sagdev:"
echo "     ssh sagdev@YOUR_VPS_IP"
echo ""
echo "  2. Set your Anthropic API key:"
echo "     echo 'export ANTHROPIC_API_KEY=\"sk-ant-...\"' >> ~/.bashrc"
echo "     source ~/.bashrc"
echo ""
echo "  3. Start a tmux session and launch Claude Code:"
echo "     tmux new -s sag"
echo "     cd $PROJECT_DIR"
echo "     claude"
echo ""
echo "  4. Tell Claude what to change. It edits the files,"
echo "     runs build.sh, and you refresh your browser."
echo ""
echo "  5. To reconnect after disconnecting:"
echo "     tmux attach -t sag"
echo ""
echo "═══════════════════════════════════════════════════"
