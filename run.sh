#!/usr/bin/env bash
#
# Ubuntu(및 데비안 계열)에서 이 저장소를 **받은 그대로 서비스 상태까지** 올린다.
#
#   git clone … && cd … && ./run.sh
#
# 하는 일: 필요한 것을 확인하고 없으면 설치한 뒤, 의존성 설치 → 준비 → 빌드 → 실행까지 이어 붙인다.
# 이미 갖춰진 단계는 건너뛴다(몇 번을 실행해도 결과가 같다).
#
#   1) Node.js 20+        없으면 NodeSource(apt)로, sudo가 없으면 nvm으로 홈에 설치
#   2) pnpm               corepack → npm 전역 → npm 사용자 홈 순으로 시도
#   3) pnpm install       lockfile 그대로. 다른 OS라 잠금이 안 맞으면 한 번 더 완화해 시도
#   4) 준비               세션 서명 키(.env.local)·Prisma 클라이언트·빈 폴더
#   5) 빌드·실행          기본은 프로덕션(next build → next start), `dev`면 개발 서버
#
# 설계(prisma/meta.db)와 업무 데이터(data/app.db), 게시판 첨부는 저장소에 함께 들어 있어
# 따로 넣을 것이 없다.
#
# 사용법:
#   ./run.sh                    프로덕션 모드로 빌드 후 실행 (http://localhost:3000)
#   ./run.sh dev                개발 서버 (파일을 고치면 바로 반영)
#   ./run.sh --port 8080        포트 지정
#   ./run.sh --host             0.0.0.0에 바인딩 + 방화벽에 포트를 연다 (다른 기기에서 접속)
#   ./run.sh --host --no-firewall   바인딩만 하고 방화벽은 건드리지 않는다
#   ./run.sh --tunnel           공유기 설정 없이 인터넷에서 닿는 https 주소를 받는다
#   ./run.sh --skip-build       빌드를 건너뛰고 기존 산출물로 실행
#   ./run.sh setup              설치·준비까지만 하고 실행하지 않음
#
set -euo pipefail

cd "$(dirname "$0")"

# ── 표시 ────────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BOLD=''; C_OFF=''
fi
step()  { printf '\n%s▸ %s%s\n' "$C_BOLD" "$1" "$C_OFF"; }
info()  { printf '  %s\n' "$1"; }
ok()    { printf '  %s✓%s %s\n' "$C_GREEN" "$C_OFF" "$1"; }
warn()  { printf '  %s!%s %s\n' "$C_YELLOW" "$C_OFF" "$1"; }
die()   { printf '\n%s✗ %s%s\n\n' "$C_RED" "$1" "$C_OFF" >&2; exit 1; }

# ── 옵션 ────────────────────────────────────────────────────────────────────
MODE=start          # start | dev | setup
PORT=3000
HOST=127.0.0.1
SKIP_BUILD=0
SKIP_INSTALL=0
OPEN_PORT=1         # --host일 때만 의미가 있다. --no-firewall로 끈다.
TUNNEL=0            # --tunnel — 공유기를 건드리지 않고 바깥에서 닿게 한다.

while [ $# -gt 0 ]; do
  case "$1" in
    dev)            MODE=dev ;;
    start)          MODE=start ;;
    setup)          MODE=setup ;;
    --port)         PORT="${2:?--port 다음에 포트 번호가 필요합니다}"; shift ;;
    --port=*)       PORT="${1#*=}" ;;
    --host)         HOST=0.0.0.0 ;;
    --host=*)       HOST="${1#*=}" ;;
    --no-firewall)  OPEN_PORT=0 ;;
    --tunnel)       TUNNEL=1; HOST=0.0.0.0 ;;
    --skip-build)   SKIP_BUILD=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    # 머리 주석을 그대로 도움말로 쓴다. 줄 번호로 자르면 주석이 한 줄만 늘어도 `set -e`까지
    # 딸려 나온다(실제로 그랬다) — 첫 번째 주석 아닌 줄에서 멈춘다.
    -h|--help)      awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    *)              die "모르는 옵션입니다: $1   (./run.sh --help)" ;;
  esac
  shift
done

case "$PORT" in (*[!0-9]*|'') die "포트는 숫자여야 합니다: $PORT" ;; esac

printf '%s\n' "${C_DIM}WebApp_V1 — 로컬 실행 준비${C_OFF}"

# ── 0) 이 저장소가 맞는지 ───────────────────────────────────────────────────
[ -f package.json ] || die "package.json이 없습니다. 저장소 루트에서 실행하세요."
[ -f prisma/meta.db ] || die "prisma/meta.db가 없습니다. 저장소를 다시 받아 주세요(설계 데이터가 저장소에 함께 들어 있습니다)."
[ -f data/app.db ]   || die "data/app.db가 없습니다. 저장소를 다시 받아 주세요(업무 데이터가 저장소에 함께 들어 있습니다)."

# sudo를 쓸 수 있는지 — root면 필요 없고, 없으면 홈 디렉터리 설치로 우회한다.
SUDO=''
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    SUDO='sudo'                      # 암호 없이 바로 쓸 수 있다
  elif command -v sudo >/dev/null 2>&1; then
    SUDO='sudo'                      # 암호를 물을 수 있다
  fi
fi

apt_install() {
  # 데비안 계열에서만. 실패해도 스크립트를 죽이지 않는다(뒤에서 대안을 찾는다).
  command -v apt-get >/dev/null 2>&1 || return 1
  [ -n "$SUDO" ] || [ "$(id -u)" -eq 0 ] || return 1
  info "apt로 설치: $*"
  $SUDO apt-get update -qq >/dev/null 2>&1 || true
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null 2>&1
}

# ── 0-b) 기본 도구 ──────────────────────────────────────────────────────────
# curl은 설치 스크립트를 받는 데, OpenSSL은 Prisma 엔진이 쓴다(슬림 이미지에는 빠져 있곤 하다).
for pkg in curl openssl; do
  command -v "$pkg" >/dev/null 2>&1 || apt_install "$pkg" ca-certificates || true
done

# ── 1) Node.js 20+ ──────────────────────────────────────────────────────────
step "Node.js"

node_major() { node -v 2>/dev/null | sed 's/^v//; s/\..*//'; }
have_node_20() {
  command -v node >/dev/null 2>&1 || return 1
  major="$(node_major)"
  # 버전을 못 읽으면(빈 값·이상한 형식) 없는 것으로 본다 — [ -ge ]에 빈 값이 가면 오류가 난다.
  case "$major" in (''|*[!0-9]*) return 1 ;; esac
  [ "$major" -ge 20 ]
}

# 이전 실행에서 nvm으로 깔아 뒀다면 이번에도 쓸 수 있게 불러온다.
if ! have_node_20 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

if have_node_20; then
  ok "이미 있음 ($(node -v))"
else
  if command -v node >/dev/null 2>&1; then
    warn "Node $(node -v)는 너무 낮습니다(20 이상 필요) — 새로 설치합니다"
  else
    info "Node.js가 없습니다 — 설치합니다"
  fi

  command -v curl >/dev/null 2>&1 || apt_install curl ca-certificates || true
  command -v curl >/dev/null 2>&1 || die "curl이 필요합니다. 먼저 설치해 주세요: sudo apt-get install -y curl"

  installed=0
  # (a) 데비안 계열 + sudo → NodeSource 저장소 (시스템 전역, 가장 흔한 경로)
  if command -v apt-get >/dev/null 2>&1 && { [ -n "$SUDO" ] || [ "$(id -u)" -eq 0 ]; }; then
    info "NodeSource로 Node 22 설치 중… (몇 분 걸릴 수 있습니다)"
    if { curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - >/dev/null 2>&1; } \
       && apt_install nodejs && have_node_20; then
      installed=1
    else
      warn "NodeSource 설치가 실패했습니다 — nvm으로 다시 시도합니다"
    fi
  fi

  # (b) 폴백: nvm으로 홈 디렉터리에 설치 (관리자 권한이 필요 없다)
  if [ "$installed" -eq 0 ]; then
    info "nvm으로 홈 디렉터리에 설치합니다 (관리자 권한 없이)"
    export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1 \
        || die "nvm 설치에 실패했습니다. 네트워크를 확인하거나 Node 20 이상을 직접 설치해 주세요."
    fi
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install 22 >/dev/null 2>&1 || die "nvm으로 Node 설치에 실패했습니다."
    nvm use 22 >/dev/null 2>&1 || true
  fi

  have_node_20 || die "Node 20 이상을 준비하지 못했습니다. 직접 설치한 뒤 다시 실행해 주세요."
  ok "설치 완료 ($(node -v))"
fi

# ── 2) pnpm ─────────────────────────────────────────────────────────────────
step "pnpm"

# npm 사용자 전역 설치를 쓸 수 있게 PATH를 미리 넓힌다.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"

# package.json이 못 박아 둔 pnpm 버전 — 대체 경로로 넣을 때도 같은 것을 넣는다.
want_pnpm="$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@\([^"]*\)".*/\1/p' package.json | head -1)"

# pnpm이 **실제로 도는지** 본다. PATH에 있는지만 보면 안 된다 — corepack은 `enable` 하는 순간
# 자리표(shim)를 PATH에 만들고, 진짜 내려받기와 서명 확인은 처음 실행할 때 일어난다. 그 확인이
# 막히면 자리표만 있고 pnpm은 없는 상태가 되는데, 예전에는 그것을 '설치 성공'으로 세어 아래
# 대체 경로가 한 번도 돌지 않았다(설치는 성공했다고 하고 다음 단계에서 서명 오류로 죽었다).
pnpm_works() { command -v pnpm >/dev/null 2>&1 && pnpm --version >/dev/null 2>&1; }

if pnpm_works; then
  ok "이미 있음 (pnpm $(pnpm --version))"
else
  info "pnpm이 없습니다 — 설치합니다"
  installed=0
  # (a) corepack: Node에 딸려 온다. package.json의 packageManager 버전을 그대로 쓴다.
  if command -v corepack >/dev/null 2>&1; then
    if corepack enable pnpm >/dev/null 2>&1 || { [ -n "$SUDO" ] && $SUDO corepack enable pnpm >/dev/null 2>&1; }; then
      corepack prepare --activate >/dev/null 2>&1 || true
      if pnpm_works; then installed=1; fi
    fi
    if [ "$installed" -eq 0 ]; then
      # corepack이 못 가져왔다(대개 서명 확인 실패 — 낡은 corepack에 박힌 npm 서명 키가
      # 지금 레지스트리 키와 맞지 않는다). 자리표를 걷어내지 않으면 아래에서 npm으로 넣은
      # pnpm을 그 자리표가 계속 가린다.
      warn "corepack으로 가져오지 못했습니다 — npm으로 넣습니다"
      corepack disable pnpm >/dev/null 2>&1 || { [ -n "$SUDO" ] && $SUDO corepack disable pnpm >/dev/null 2>&1; } || true
      hash -r 2>/dev/null || true
    fi
  fi
  # (b) npm 전역 — 못 박아 둔 버전 그대로. npm도 레지스트리가 준 무결성 해시로 받은 것을 확인한다.
  if [ "$installed" -eq 0 ] && command -v npm >/dev/null 2>&1; then
    if npm install -g "pnpm@${want_pnpm:-latest}" >/dev/null 2>&1 && pnpm_works; then installed=1; fi
    if [ "$installed" -eq 0 ] && [ -n "$SUDO" ]; then
      if $SUDO npm install -g "pnpm@${want_pnpm:-latest}" >/dev/null 2>&1 && pnpm_works; then installed=1; fi
    fi
  fi
  # (c) 권한 없이 홈에 설치 — 전역 경로에 쓸 권한이 없을 때
  if [ "$installed" -eq 0 ] && command -v npm >/dev/null 2>&1; then
    if npm install -g --prefix "$HOME/.local" "pnpm@${want_pnpm:-latest}" >/dev/null 2>&1 && pnpm_works; then installed=1; fi
  fi

  pnpm_works || die "pnpm 설치에 실패했습니다. 직접 설치해 주세요: npm install -g pnpm@${want_pnpm:-latest}"
  ok "설치 완료 (pnpm $(pnpm --version))"
fi

# ── 3) 의존성 ───────────────────────────────────────────────────────────────
if [ "$SKIP_INSTALL" -eq 1 ]; then
  step "의존성 (건너뜀)"
else
  step "의존성 설치"
  # 잠금 파일은 Windows에서 만들어졌지만 플랫폼별 항목까지 함께 기록되므로 대개 그대로 맞는다.
  # 그래도 어긋나면(다른 아키텍처 등) 잠금을 갱신하며 한 번 더 시도한다 — 여기서 멈추면
  # "받아서 바로 실행"이라는 목적 자체가 무너진다.
  if pnpm install --frozen-lockfile; then
    ok "설치 완료"
  else
    warn "잠금 파일 그대로는 설치되지 않았습니다 — 잠금을 갱신해 다시 시도합니다"
    pnpm install || die "의존성 설치에 실패했습니다. 위 오류를 확인해 주세요."
    ok "설치 완료(잠금 갱신됨)"
  fi
fi

# ── 4) 준비 ─────────────────────────────────────────────────────────────────
step "실행 준비"
# 세션 서명 키(.env.local), Prisma 클라이언트, 빈 폴더 — 저장소에 담을 수 없는 것만 만든다.
pnpm setup:local || die "준비 단계에서 실패했습니다."

# ── 4-b) 방화벽 ─────────────────────────────────────────────────────────────
#
# 0.0.0.0에 붙였다고 밖에서 들어올 수 있는 것은 아니다. 대부분의 배포판은 방화벽이 켜져 있어
# 포트가 막힌 채로 "서버는 떴는데 다른 기기에서만 안 되는" 상태가 된다 — 원인을 찾기 어려운
# 쪽이라 열어 준다(사용자 지정). 127.0.0.1에 붙을 때는 아무것도 하지 않는다: 밖에서 못 들어오는
# 것이 맞는 상태라 방화벽을 건드릴 이유가 없다.
#
# 켜져 있는 방화벽에만 규칙을 더한다. **꺼져 있는 방화벽을 켜지는 않는다** — SSH로 들어와
# 있는 서버에서 방화벽을 켜면 그 자리에서 자기 연결이 끊길 수 있다.
open_firewall_port() {
  # 'inactive'에도 'active'가 들어 있다 — 줄 전체를 맞춰야 꺼진 방화벽을 켜진 것으로 읽지 않는다.
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | head -1 | grep -qiE '^status:[[:space:]]+active[[:space:]]*$'; then
    info "ufw에 ${PORT}/tcp를 엽니다"
    if $SUDO ufw allow "${PORT}/tcp" comment 'WebApp_V1' >/dev/null 2>&1; then
      ok "ufw ${PORT}/tcp 열림"; return 0
    fi
    warn "ufw 규칙을 넣지 못했습니다 — 직접: sudo ufw allow ${PORT}/tcp"; return 1
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    info "firewalld에 ${PORT}/tcp를 엽니다"
    if $SUDO firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1 \
       && $SUDO firewall-cmd --reload >/dev/null 2>&1; then
      ok "firewalld ${PORT}/tcp 열림"; return 0
    fi
    warn "firewalld 규칙을 넣지 못했습니다 — 직접: sudo firewall-cmd --permanent --add-port=${PORT}/tcp && sudo firewall-cmd --reload"; return 1
  fi
  info "켜져 있는 방화벽(ufw·firewalld)을 찾지 못했습니다 — 열 것이 없습니다"
  return 0
}

# 서버를 띄우기 **직전**에 부른다 — 빌드가 깨졌는데 포트만 열려 있는 상태를 만들지 않는다.
maybe_open_port() {
  [ "$HOST" = "0.0.0.0" ] || return 0
  step "방화벽"
  if [ "$OPEN_PORT" -eq 0 ]; then
    info "--no-firewall — 방화벽은 건드리지 않습니다"
  elif [ -z "$SUDO" ] && [ "$(id -u)" -ne 0 ]; then
    warn "권한이 없어 열지 못했습니다 — 직접: sudo ufw allow ${PORT}/tcp"
  else
    open_firewall_port || true
  fi
}

# ── 5) 주소 ─────────────────────────────────────────────────────────────────
#
# 이 PC의 IP를 **나가는 경로에서** 찾는다. `hostname -I`의 첫 값을 쓰면 docker0·WSL·VPN 같은
# 가상 어댑터가 먼저 잡혀, 다른 기기에서 닿지도 않는 주소를 안내하게 된다(172.17.0.1 등).
# 커널에게 "1.1.1.1로 나갈 때 어느 주소를 쓰느냐"고 물으면 실제로 쓰이는 그 주소가 나온다.
lan_ip() {
  # 값을 받아서 본다 — `… | head -1 && 폴백`으로 쓰면 안 된다. head는 입력이 비어도 0을 돌려주어
  # 폴백이 한 번도 돌지 않는다(pnpm 자리표 때와 같은 종류의 착각이다).
  addr="$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1 || true)"
  [ -n "$addr" ] || addr="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  printf '%s' "$addr"
}

# 사설 대역인가 — 사설이면 그 주소는 이 망 안에서만 통한다.
is_private_ip() {
  case "$1" in
    10.*|192.168.*|127.*|169.254.*) return 0 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) return 0 ;;
    *) return 1 ;;
  esac
}

# 바깥에서 보이는 주소. 못 물어보면 빈 값 — 없다고 실행을 막지는 않는다.
public_ip() {
  command -v curl >/dev/null 2>&1 || return 0
  curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true
}

url_host="$HOST"
LAN_IP=''
if [ "$HOST" = "0.0.0.0" ]; then
  LAN_IP="$(lan_ip || true)"
  url_host="$LAN_IP"
fi
[ -n "$url_host" ] || url_host=localhost

# 어디로 들어올 수 있는지 **있는 그대로** 적는다.
#
# 포트를 열었다고 밖에서 닿는 것은 아니다. 이 PC가 사설 대역(192.168.·10.·172.16~31.)에 있으면
# 바깥에서 보이는 주소는 공유기의 것이고, 그 공유기가 이 PC로 넘겨 주지 않는 한 아무도 못 들어온다.
# 그 사실을 감추고 주소만 적어 두면 "열었다는데 안 된다"가 되므로, 무엇이 더 필요한지 함께 적는다.
show_addresses() {
  info "이 PC   http://localhost:${PORT}/home"
  [ "$HOST" = "0.0.0.0" ] || { info "관리자  http://localhost:${PORT}/admin  (admin / 123456)"; return 0; }

  if [ -n "$LAN_IP" ]; then
    info "같은 망  http://${LAN_IP}:${PORT}/home"
  else
    warn "이 PC의 주소를 찾지 못했습니다 — 같은 망에서 쓸 주소는 직접 확인해 주세요(ip addr)."
  fi

  wan="$(public_ip)"
  if [ -z "$wan" ]; then
    info "바깥 주소는 확인하지 못했습니다(인터넷에 못 물어봤습니다)."
  elif [ -n "$LAN_IP" ] && [ "$wan" = "$LAN_IP" ]; then
    # 이 기계가 공인 IP를 직접 달고 있다 — 방화벽만 열려 있으면 그대로 닿는다.
    info "인터넷   http://${wan}:${PORT}/home   (이 PC가 공인 IP를 직접 갖고 있습니다)"
  elif is_private_ip "${LAN_IP:-x}"; then
    info "인터넷   http://${wan}:${PORT}/  ← 지금은 닿지 않습니다"
    info "         이 PC는 사설 주소(${LAN_IP})라 공유기가 가로막고 있습니다. 둘 중 하나가 필요합니다:"
    info "           · 공유기에서 ${PORT} 포트를 ${LAN_IP} 로 넘기기(포트포워딩)"
    info "           · 또는 ./run.sh --host --tunnel  — 공유기를 건드리지 않고 https 주소를 받습니다"
  fi

  info "관리자  .../admin  (admin / 123456 — 바꾸려면 pnpm admin:password \"새 비밀번호\")"
}

# 공유기를 건드리지 않고 바깥에서 닿게 하는 길 — cloudflared의 임시 터널.
#
# 공인 IP도 포트포워딩도 없이 https 주소 하나를 받는다. 대신 **인터넷 전체에 열린다** —
# 그래서 옵션으로만 켜지고, 켤 때마다 비밀번호를 먼저 확인하라고 말한다.
start_tunnel() {
  if ! command -v cloudflared >/dev/null 2>&1; then
    warn "cloudflared가 없어 터널을 열지 못했습니다. 설치한 뒤 다시 실행해 주세요:"
    info "  curl -fsSL https://pkg.cloudflare.com/cloudflared-linux-amd64.deb -o /tmp/cf.deb && sudo dpkg -i /tmp/cf.deb"
    return 1
  fi
  warn "터널을 엽니다 — 이 주소는 **인터넷 누구나** 열 수 있습니다."
  warn "관리자 비밀번호를 아직 안 바꿨다면 지금 멈추고 바꾸세요: pnpm admin:password \"새 비밀번호\""
  : > "$TUNNEL_LOG"
  cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  # 주소가 로그에 찍힐 때까지 최대 20초 기다린다.
  for _ in $(seq 1 40); do
    url="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)"
    [ -n "$url" ] && break
    kill -0 "$TUNNEL_PID" 2>/dev/null || break
    sleep 0.5
  done
  if [ -n "${url:-}" ]; then
    ok "인터넷 주소: ${url}/home"
    info "  이 주소는 이 창을 닫으면 사라집니다(임시 터널)."
    return 0
  fi
  warn "터널 주소를 받지 못했습니다. 자세한 내용: $TUNNEL_LOG"
  return 1
}

TUNNEL_LOG="data/logs/tunnel.log"
mkdir -p "$(dirname "$TUNNEL_LOG")" 2>/dev/null || true
TUNNEL_PID=''
# 서버가 끝나면 터널도 함께 접는다 — 서버 없는 터널은 남겨 둘 이유가 없다.
cleanup_tunnel() { [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true; }
trap cleanup_tunnel EXIT INT TERM

if [ "$MODE" = "setup" ]; then
  step "준비 완료"
  info "실행: ./run.sh          (프로덕션)"
  info "      ./run.sh dev      (개발 서버)"
  exit 0
fi

if [ "$MODE" = "dev" ]; then
  maybe_open_port
  step "개발 서버 시작"
  show_addresses
  [ "$TUNNEL" -eq 1 ] && start_tunnel || true
  printf '  %s중지: Ctrl+C%s\n\n' "$C_DIM" "$C_OFF"
  exec pnpm exec next dev --turbopack -p "$PORT" -H "$HOST"
fi

if [ "$SKIP_BUILD" -eq 1 ]; then
  step "빌드 (건너뜀)"
  [ -f .next/BUILD_ID ] || die "빌드 산출물이 없습니다(.next). --skip-build 없이 다시 실행해 주세요."
else
  step "빌드"
  info "처음에는 1~3분쯤 걸립니다"
  pnpm build || die "빌드에 실패했습니다. 위 오류를 확인해 주세요."
  ok "빌드 완료"
fi

maybe_open_port

step "서버 시작"
show_addresses
if [ "$TUNNEL" -eq 1 ]; then
  # 터널은 서버가 뜬 뒤라야 붙는다 — 먼저 띄우고, 주소를 받은 다음 서버를 앞으로 끌어온다.
  pnpm exec next start -p "$PORT" -H "$HOST" &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && break
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.5
  done
  start_tunnel || true
  printf '  %s중지: Ctrl+C%s\n\n' "$C_DIM" "$C_OFF"
  wait "$SERVER_PID"
  exit $?
fi
if [ "$HOST" = "0.0.0.0" ]; then
  warn "관리자 비밀번호를 바꾸지 않았다면 먼저 바꾸세요."
fi
printf '  %s중지: Ctrl+C%s\n\n' "$C_DIM" "$C_OFF"
exec pnpm exec next start -p "$PORT" -H "$HOST"
