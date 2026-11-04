#!/usr/bin/env bash
# Установка и обновление «Волшебники против Зомби» на сервере Ubuntu 22.04 / 24.04.
#
# Первый раз:  bash /root/wvz-new/deploy/install.sh
#   — ставит Node.js, Caddy (HTTPS), спрашивает токен бота и ваш Telegram ID,
#     настраивает автозапуск, защиту и ежедневный бэкап базы.
# Обновление: тот же запуск с новым архивом — база (data/) и настройки (.env) сохраняются.
#
# Своё доменное имя (необязательно):  DOMAIN=game.example.ru bash install.sh
# Без него используется бесплатный адрес вида 1-2-3-4.sslip.io по IP сервера.
set -euo pipefail

APP_DIR=/opt/wvz
APP_USER=wvz
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "Запустите от имени root (на сервере вы и так root после входа по ssh root@...)"
[ -f "$SRC/package.json" ] && [ -d "$SRC/src" ] && [ -d "$SRC/public" ] || fail "Рядом нет файлов игры: распакуйте архив целиком и запускайте deploy/install.sh из него"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || [ "${ID:-}" = debian ] || fail "Скрипт рассчитан на Ubuntu или Debian, а здесь: ${PRETTY_NAME:-неизвестно}"
export DEBIAN_FRONTEND=noninteractive

# ---------- 1. Программы ----------
say "1/7 Ставлю нужные программы (пара минут)"
apt-get update -y -qq
apt-get install -y -qq curl ca-certificates gnupg sqlite3 ufw debian-keyring debian-archive-keyring apt-transport-https >/dev/null

node_major() { command -v node >/dev/null && node -p 'process.versions.node.split(".")[0]' || echo 0; }
node_minor() { node -p 'process.versions.node.split(".")[1]'; }
if [ "$(node_major)" -lt 22 ] || { [ "$(node_major)" -eq 22 ] && [ "$(node_minor)" -lt 13 ]; }; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node.js $(node -v)"

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -qq
  apt-get install -y -qq caddy >/dev/null
fi
ok "Caddy $(caddy version | cut -d' ' -f1)"

# ---------- 2. Файлы игры ----------
say "2/7 Копирую игру в $APP_DIR"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/data" "$APP_DIR/backups"
# Обновляем только код и картинки; база (data/), бэкапы и настройки (.env) остаются
for item in package.json package-lock.json src public deploy; do
  [ -e "$SRC/$item" ] || continue
  rm -rf "${APP_DIR:?}/$item"
  cp -a "$SRC/$item" "$APP_DIR/$item"
done
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "Файлы на месте"

say "3/7 Ставлю библиотеки игры"
cd "$APP_DIR"
sudo -u "$APP_USER" HOME="$APP_DIR" npm ci --omit=dev --no-audit --no-fund --loglevel=error
ok "Библиотеки установлены"

# ---------- 3. Настройки ----------
say "4/7 Настройки"
IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me || true)"
[ -n "$IP" ] || fail "Не удалось узнать внешний IP сервера"
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"

ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  ok "Настройки уже есть ($ENV_FILE) — оставляю как были"
  # адрес мог поменяться, если указали свой домен
  sed -i "s|^WEBAPP_URL=.*|WEBAPP_URL=https://$DOMAIN|" "$ENV_FILE"
else
  while :; do
    read -r -p "Вставьте токен бота от @BotFather и нажмите Enter: " TOKEN </dev/tty
    TOKEN="$(echo "$TOKEN" | tr -d '[:space:]')"
    NAME="$(curl -fsS --max-time 10 "https://api.telegram.org/bot$TOKEN/getMe" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p' || true)"
    [ -n "$NAME" ] && break
    echo "Telegram не узнал этот токен. Скопируйте его из сообщения BotFather ещё раз целиком."
  done
  ok "Бот найден: @$NAME"
  echo "Ваш Telegram ID нужен, чтобы бот пускал вас в админку."
  echo "Узнать его: напишите боту @userinfobot (он ответит строкой Id: 123456789)."
  while :; do
    read -r -p "Вставьте ваш Telegram ID (только цифры) и нажмите Enter: " ADMIN </dev/tty
    ADMIN="$(echo "$ADMIN" | tr -cd '0-9,')"
    [ -n "$ADMIN" ] && break
  done
  umask 077
  cat > "$ENV_FILE" <<EOF
BOT_TOKEN=$TOKEN
ADMIN_IDS=$ADMIN
WEBAPP_URL=https://$DOMAIN
HOST=127.0.0.1
PORT=3000
DB_FILE=$APP_DIR/data/game.db
DEV_MODE=0
EOF
  umask 022
fi
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
ok "Адрес игры: https://$DOMAIN"

# ---------- 4. Автозапуск ----------
say "5/7 Автозапуск игры и HTTPS"
cat > /etc/systemd/system/wvz.service <<EOF
[Unit]
Description=Wizards vs Zombies (Telegram Mini App)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning src/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$APP_DIR/data

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable wvz >/dev/null 2>&1
systemctl restart wvz

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip zstd
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
ok "Сервисы запущены"

# ---------- 5. Защита ----------
say "6/7 Защита и бэкап"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
cat > /etc/cron.daily/wvz-backup <<EOF
#!/bin/sh
# Ежедневная копия базы игры, хранится 30 дней
[ -f $APP_DIR/data/game.db ] || exit 0
sqlite3 $APP_DIR/data/game.db ".backup '$APP_DIR/backups/game-\$(date +%F).db'"
find $APP_DIR/backups -name 'game-*.db' -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/wvz-backup
ok "Открыты только порты 22, 80, 443; бэкап базы каждый день в $APP_DIR/backups"

# ---------- 6. Проверка ----------
say "7/7 Проверяю, что всё работает (до 2 минут — получаем HTTPS-сертификат)"
for _ in $(seq 1 60); do
  systemctl is-active --quiet wvz || { journalctl -u wvz -n 30 --no-pager; fail "Игра не запустилась — текст ошибки выше"; }
  if curl -fsS --max-time 5 "https://$DOMAIN/" -o /dev/null 2>/dev/null; then
    BOT="$(curl -fsS --max-time 10 "https://api.telegram.org/bot$(sed -n 's/^BOT_TOKEN=//p' "$ENV_FILE")/getMe" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p' || true)"
    printf '\n\033[1;32m🎉 Готово! Игра работает.\033[0m\n'
    echo "   Адрес игры:  https://$DOMAIN"
    [ -n "$BOT" ] && echo "   Бот:         https://t.me/$BOT  — откройте и нажмите «Запустить», затем «Играть»"
    echo "   Админка:     напишите боту /admin"
    exit 0
  fi
  sleep 2
done
journalctl -u caddy -n 20 --no-pager
fail "Не получилось открыть https://$DOMAIN — см. сообщения Caddy выше (часто помогает просто запустить скрипт ещё раз через минуту)"
