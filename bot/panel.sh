#!/data/data/com.termux/files/usr/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/index.js" ]; then
    BOT_DIR="$SCRIPT_DIR"
elif [ -d "$HOME/bot" ]; then
    BOT_DIR="$HOME/bot"
else
    BOT_DIR="$SCRIPT_DIR"
fi
LOG_FILE="$BOT_DIR/bot.log"
PID_FILE="$BOT_DIR/bot.pid"
CONFIG_FILE="$BOT_DIR/.bot_config"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m'

load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    fi
    # Auto-detect nomor bot dari session auth jika ada
    if [ -f "$BOT_DIR/auth/creds.json" ]; then
        DETECTED=$(grep -o '"id":"[0-9]*' "$BOT_DIR/auth/creds.json" | head -1 | cut -d'"' -f4)
        if [ -n "$DETECTED" ]; then
            BOT_NOMOR="$DETECTED (Auto QR)"
        fi
    fi
}

save_config() {
    cat > "$CONFIG_FILE" <<EOF
BOT_COOKIE="$BOT_COOKIE"
BOT_OWNER="$BOT_OWNER"
EOF
}

is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

header() {
    clear
    echo -e "${MAGENTA}"
    echo "  ███╗   ███╗███████╗██╗     ██╗     ███████╗"
    echo "  ████╗ ████║██╔════╝██║     ██║     ██╔════╝"
    echo "  ██╔████╔██║█████╗  ██║     ██║     ███████╗"
    echo "  ██║╚██╔╝██║██╔══╝  ██║     ██║     ╚════██║"
    echo "  ██║ ╚═╝ ██║███████╗███████╗███████╗███████║"
    echo "  ╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝╚══════╝"
    echo -e "${CYAN}          SpooferBot Panel by mells${NC}"
    echo -e "${BLUE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    load_config
    if is_running; then
        echo -e "  Status Bot : ${GREEN}● RUNNING${NC} (PID: $(cat $PID_FILE))"
    else
        echo -e "  Status Bot : ${RED}● STOPPED${NC}"
    fi
    NOMOR_DISPLAY="${BOT_NOMOR:-belum terhubung (scan QR)}"
    OWNER_DISPLAY="${BOT_OWNER:-belum diset}"
    COOKIE_DISPLAY="${BOT_COOKIE:+sudah diset}"
    COOKIE_DISPLAY="${COOKIE_DISPLAY:-belum diset}"
    echo -e "  Nomor Bot  : ${YELLOW}$NOMOR_DISPLAY${NC}"
    echo -e "  Nomor Owner: ${YELLOW}$OWNER_DISPLAY${NC}"
    echo -e "  Cookie     : ${YELLOW}$COOKIE_DISPLAY${NC}"
    echo -e "${BLUE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

menu_utama() {
    header
    echo -e "${WHITE}  MENU UTAMA${NC}"
    echo ""
    echo -e "  ${CYAN}[1]${NC} Setup Nomor Owner / Admin"
    echo -e "  ${CYAN}[2]${NC} Setup Cookie Roblox"
    echo -e "  ${CYAN}[3]${NC} Lihat Config Tersimpan"
    echo -e "  ${CYAN}[4]${NC} Jalankan Bot"
    echo -e "  ${CYAN}[5]${NC} Hentikan Bot"
    echo -e "  ${CYAN}[6]${NC} Restart Bot"
    echo -e "  ${CYAN}[7]${NC} Lihat Log Bot"
    echo -e "  ${CYAN}[8]${NC} Install / Update Dependencies"
    echo -e "  ${CYAN}[9]${NC} Scan QR Code (Login WA)"
    echo -e "  ${RED}[0]${NC} Keluar"
    echo ""
    echo -ne "  ${WHITE}Pilih menu: ${NC}"
    read -r CHOICE
    case $CHOICE in
        1) setup_owner ;;
        2) setup_cookie ;;
        3) lihat_config ;;
        4) jalankan_bot ;;
        5) hentikan_bot ;;
        6) restart_bot ;;
        7) lihat_log ;;
        8) install_deps ;;
        9) scan_qr ;;
        0) echo -e "\n${GREEN}  Sampai jumpa!${NC}\n"; exit 0 ;;
        *) echo -e "\n${RED}  Pilihan tidak valid.${NC}"; sleep 1; menu_utama ;;
    esac
}

setup_nomor() {
    header
    echo -e "${WHITE}  SETUP NOMOR BOT WHATSAPP${NC}"
    echo ""
    echo -e "  Masukkan nomor WA bot (format: 628xxxxxxxxxx)"
    echo -e "  ${YELLOW}Tanpa + dan tanpa spasi${NC}"
    echo ""
    echo -ne "  Nomor Bot: "
    read -r INPUT_NOMOR
    if [[ "$INPUT_NOMOR" =~ ^[0-9]{10,15}$ ]]; then
        BOT_NOMOR="$INPUT_NOMOR"
        save_config
        echo ""
        echo -e "  ${GREEN}✅ Nomor Bot berhasil disimpan: $BOT_NOMOR${NC}"
    else
        echo ""
        echo -e "  ${RED}❌ Format nomor salah. Contoh: 628123456789${NC}"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

setup_owner() {
    header
    echo -e "${WHITE}  SETUP NOMOR OWNER / ADMIN${NC}"
    echo ""
    echo -e "  Nomor ini dipakai sebagai kontak saat user kehabisan kuota / beli VIP,"
    echo -e "  dan pemegang nomor ini punya akses perintah admin (.addpremium, dll)."
    echo -e "  Format: 628xxxxxxxxxx (${YELLOW}tanpa + dan tanpa spasi${NC})"
    echo ""
    echo -ne "  Nomor Owner: "
    read -r INPUT_OWNER
    if [[ "$INPUT_OWNER" =~ ^[0-9]{10,15}$ ]]; then
        BOT_OWNER="$INPUT_OWNER"
        save_config
        echo ""
        echo -e "  ${GREEN}✅ Nomor Owner berhasil disimpan: $BOT_OWNER${NC}"
    else
        echo ""
        echo -e "  ${RED}❌ Format nomor salah. Contoh: 628123456789${NC}"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

setup_cookie() {
    header
    echo -e "${WHITE}  SETUP COOKIE ROBLOX${NC}"
    echo ""
    echo -e "  Cookie .ROBLOSECURITY dipakai bot untuk download asset."
    echo ""
    echo -e "  ${YELLOW}Cara dapat cookie:${NC}"
    echo -e "  1. Buka roblox.com di browser, login"
    echo -e "  2. F12 → Application → Cookies → .ROBLOSECURITY"
    echo -e "  3. Copy value-nya (panjang banget, wajar)"
    echo ""
    echo -ne "  Paste cookie di sini: "
    read -r INPUT_COOKIE
    if [ -n "$INPUT_COOKIE" ]; then
        BOT_COOKIE="$INPUT_COOKIE"
        save_config
        # Simpan ke .uploader_config.json di home
        python3 -c "
import json, os
cfg_path = os.path.expanduser('~/.uploader_config.json')
data = {}
if os.path.exists(cfg_path):
    try: data = json.loads(open(cfg_path).read())
    except: pass
data['cookie'] = '$INPUT_COOKIE'
open(cfg_path, 'w').write(json.dumps(data, indent=2))
print('OK')
" 2>/dev/null
        echo ""
        echo -e "  ${GREEN}✅ Cookie berhasil disimpan ke ~/.uploader_config.json${NC}"
    else
        echo ""
        echo -e "  ${RED}❌ Cookie tidak boleh kosong.${NC}"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

lihat_config() {
    header
    echo -e "${WHITE}  CONFIG TERSIMPAN${NC}"
    echo ""
    load_config
    echo -e "  Nomor Bot  : ${YELLOW}${BOT_NOMOR:-belum diset}${NC}"
    echo -e "  Nomor Owner: ${YELLOW}${BOT_OWNER:-belum diset}${NC}"
    if [ -n "$BOT_COOKIE" ]; then
        PREVIEW="${BOT_COOKIE:0:30}..."
        echo -e "  Cookie     : ${YELLOW}$PREVIEW${NC}"
    else
        echo -e "  Cookie     : ${RED}belum diset${NC}"
    fi
    echo ""
    if [ -f "$HOME/.uploader_config.json" ]; then
        echo -e "  ${GREEN}✅ ~/.uploader_config.json ada${NC}"
    else
        echo -e "  ${RED}❌ ~/.uploader_config.json belum ada${NC}"
    fi
    if [ -d "$BOT_DIR/auth" ]; then
        echo -e "  ${GREEN}✅ Folder auth ada (sudah scan QR sebelumnya)${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Folder auth belum ada (belum scan QR)${NC}"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

jalankan_bot() {
    header
    if is_running; then
        echo -e "  ${YELLOW}⚠️  Bot sudah running (PID: $(cat $PID_FILE))${NC}"
        echo -e "  Gunakan menu Restart jika mau reload."
        echo ""
        echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
        read -r
        menu_utama
        return
    fi
    load_config
    echo -e "  ${CYAN}Menjalankan bot di background...${NC}"
    mkdir -p "$BOT_DIR"
    cd "$BOT_DIR" || exit
    nohup node index.js > "$LOG_FILE" 2>&1 &
    BOT_PID=$!
    echo $BOT_PID > "$PID_FILE"
    sleep 2
    if is_running; then
        echo -e "  ${GREEN}✅ Bot berhasil dijalankan! PID: $BOT_PID${NC}"
        echo -e "  ${GREEN}✅ Log: $LOG_FILE${NC}"
        echo ""
        echo -e "  ${YELLOW}Jika belum pernah scan QR, pilih menu 9 untuk lihat QR.${NC}"
    else
        echo -e "  ${RED}❌ Bot gagal jalan. Cek log:${NC}"
        tail -20 "$LOG_FILE"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

hentikan_bot() {
    header
    if is_running; then
        PID=$(cat "$PID_FILE")
        kill "$PID" 2>/dev/null
        rm -f "$PID_FILE"
        echo -e "  ${GREEN}✅ Bot dihentikan (PID: $PID)${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Bot tidak sedang running.${NC}"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

restart_bot() {
    header
    echo -e "  ${CYAN}Merestart bot...${NC}"
    if is_running; then
        PID=$(cat "$PID_FILE")
        kill "$PID" 2>/dev/null
        rm -f "$PID_FILE"
        echo -e "  ${YELLOW}Bot lama dihentikan.${NC}"
        sleep 2
    fi
    rm -f "$HOME/yt_uploader_runner.py"
    cd "$BOT_DIR" || exit
    nohup node index.js > "$LOG_FILE" 2>&1 &
    BOT_PID=$!
    echo $BOT_PID > "$PID_FILE"
    sleep 2
    if is_running; then
        echo -e "  ${GREEN}✅ Bot berhasil direstart! PID: $BOT_PID${NC}"
    else
        echo -e "  ${RED}❌ Bot gagal jalan. Cek log.${NC}"
        tail -10 "$LOG_FILE"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

lihat_log() {
    header
    echo -e "${WHITE}  LOG BOT (50 baris terakhir)${NC}"
    echo -e "${BLUE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    if [ -f "$LOG_FILE" ]; then
        tail -50 "$LOG_FILE"
    else
        echo -e "  ${YELLOW}Log belum ada. Jalankan bot dulu.${NC}"
    fi
    echo ""
    echo -e "${BLUE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -ne "  ${CYAN}[f] Follow log realtime  |  Enter untuk kembali: ${NC}"
    read -r OPT
    if [ "$OPT" = "f" ]; then
        echo -e "  ${YELLOW}Ctrl+C untuk stop follow${NC}"
        tail -f "$LOG_FILE"
    fi
    menu_utama
}

install_deps() {
    header
    echo -e "${WHITE}  INSTALL / UPDATE DEPENDENCIES${NC}"
    echo ""
    cd "$BOT_DIR" || exit
    echo -e "  ${CYAN}Menginstall npm packages...${NC}"
    npm config set allow-git all
    echo "allow-git=all" > "$BOT_DIR/.npmrc"
    npm install --ignore-scripts 2>&1 | tail -5
    echo ""
    echo -e "  ${CYAN}Approve install scripts baileys...${NC}"
    npm install-scripts approve @whiskeysockets/baileys protobufjs 2>&1 | tail -3
    npm rebuild 2>&1 | tail -3
    echo ""
    echo -e "  ${CYAN}Install qrcode-terminal...${NC}"
    npm install qrcode-terminal 2>&1 | tail -3
    echo ""
    echo -e "  ${CYAN}Cek ffmpeg...${NC}"
    if ! command -v ffmpeg >/dev/null 2>&1; then
        pkg install ffmpeg -y 2>&1 | tail -3
    fi
    echo ""
    echo -e "  ${CYAN}Cek python dependencies...${NC}"
    pip install aiohttp yt-dlp --break-system-packages -q 2>&1 | tail -3
    rm -f "$HOME/yt_uploader_runner.py" "$HOME/spoofer_bot_runner.py"
    echo ""
    echo -e "  ${GREEN}✅ Selesai!${NC}"
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

scan_qr() {
    header
    echo -e "${WHITE}  SCAN QR CODE${NC}"
    echo ""
    if ! is_running; then
        echo -e "  ${RED}❌ Bot tidak sedang running. Jalankan bot dulu (Menu 4).${NC}"
    else
        echo -e "  ${CYAN}Menampilkan QR dari log...${NC}"
        echo ""
        if [ -f "$LOG_FILE" ]; then
            grep -A 30 "QR" "$LOG_FILE" | tail -35
        fi
        echo ""
        echo -e "  ${YELLOW}Jika QR tidak muncul, coba lihat log realtime (Menu 7 → f)${NC}"
    fi
    echo ""
    echo -ne "  ${CYAN}Tekan Enter untuk kembali...${NC}"
    read -r
    menu_utama
}

# Pastikan folder bot ada
mkdir -p "$BOT_DIR"

menu_utama
