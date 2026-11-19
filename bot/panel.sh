#!/data/data/com.termux/files/usr/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$SCRIPT_DIR"
PID_FILE="$BOT_DIR/bot.pid"
LOG_FILE="$BOT_DIR/bot.log"
CONFIG_FILE="$HOME/.bot_config"
COOKIE_FILE="$HOME/.uploader_config.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m'

load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    fi
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
    load_config
    echo -e "${MAGENTA}====================================================${NC}"
    echo -e "${WHITE}       🎮  DISCORD ROBLOX SPOOFER CONTROL PANEL     ${NC}"
    echo -e "${MAGENTA}====================================================${NC}"
    if is_running; then
        echo -e "  Status Bot   : ${GREEN}● RUNNING (PID: $(cat "$PID_FILE"))${NC}"
    else
        echo -e "  Status Bot   : ${RED}○ STOPPED${NC}"
    fi

    if [ -n "$DISCORD_TOKEN" ]; then
        echo -e "  Discord Token: ${GREEN}✔ Terpasang${NC}"
    else
        echo -e "  Discord Token: ${RED}✘ Belum diset${NC}"
    fi

    # Cek cookie tumbal
    COOKIE=""
    if [ -f "$COOKIE_FILE" ]; then
        COOKIE=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$COOKIE_FILE')).cookie||'')}catch(e){}")
    fi
    if [ -n "$COOKIE" ]; then
        echo -e "  Cookie Tumbal: ${GREEN}✔ Terpasang${NC}"
    else
        echo -e "  Cookie Tumbal: ${RED}✘ Belum diset${NC}"
    fi

    if [ -n "$VIP_CHANNEL_ID" ]; then
        echo -e "  Channel VIP  : ${GREEN}✔ Terpasang ($VIP_CHANNEL_ID)${NC}"
    else
        echo -e "  Channel VIP  : ${YELLOW}Auto-detect (Channel Server)${NC}"
    fi
    echo -e "${MAGENTA}----------------------------------------------------${NC}"
}

setup_token() {
    header
    echo -e "${WHITE}  SETUP DISCORD BOT TOKEN${NC}"
    echo ""
    echo -e "  Dapatkan token dari: https://discord.com/developers/applications"
    echo -ne "  Masukkan Bot Token: "
    read -r TOKEN_INPUT
    TOKEN_INPUT=$(echo "$TOKEN_INPUT" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if [ -n "$TOKEN_INPUT" ]; then
        echo "DISCORD_TOKEN=\"$TOKEN_INPUT\"" > "$CONFIG_FILE"
        echo -e "\n${GREEN}  ✔ Token berhasil disimpan ke $CONFIG_FILE!${NC}"
    else
        echo -e "\n${RED}  Token tidak boleh kosong!${NC}"
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

setup_cookie() {
    header
    echo -e "${WHITE}  SETUP COOKIE ROBLOX (.ROBLOSECURITY BOT TUMBAL)${NC}"
    echo ""
    echo -ne "  Paste Cookie .ROBLOSECURITY: "
    read -r COOKIE_INPUT
    COOKIE_INPUT=$(echo "$COOKIE_INPUT" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if [ -n "$COOKIE_INPUT" ]; then
        node -e "
            const fs = require('fs');
            let cfg = {};
            try { cfg = JSON.parse(fs.readFileSync('$COOKIE_FILE')); } catch(e){}
            cfg.cookie = process.argv[1];
            fs.writeFileSync('$COOKIE_FILE', JSON.stringify(cfg, null, 2));
        " "$COOKIE_INPUT"
        echo -e "\n${GREEN}  ✔ Cookie Bot Tumbal berhasil disimpan!${NC}"
    else
        echo -e "\n${RED}  Cookie tidak boleh kosong!${NC}"
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

add_vip() {
    header
    echo -e "${WHITE}  TAMBAH / PERPANJANG VIP USER DISCORD${NC}"
    echo ""
    echo -ne "  Masukkan Discord User ID: "
    read -r TARGET_UID
    TARGET_UID=$(echo "$TARGET_UID" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if ! [[ "$TARGET_UID" =~ ^[0-9]{15,22}$ ]]; then
        echo -e "\n${RED}  Format Discord User ID tidak valid! (Harus 17-20 digit angka).${NC}"
        sleep 2
        menu_utama
        return
    fi

    echo ""
    echo -e "  Pilihan Durasi VIP:"
    echo -e "  [1] 3 Hari (Paket Hemat / Trial)"
    echo -e "  [2] 7 Hari (1 Minggu)"
    echo -e "  [3] 30 Hari (1 Bulan)"
    echo -e "  [4] 60 Hari (2 Bulan)"
    echo -e "  [5] 365 Hari (1 Tahun)"
    echo -e "  [6] Custom Hari"
    echo -ne "  Pilih durasi [1-6]: "
    read -r D_OPT

    DAYS=3
    case $D_OPT in
        1) DAYS=3 ;;
        2) DAYS=7 ;;
        3) DAYS=30 ;;
        4) DAYS=60 ;;
        5) DAYS=365 ;;
        6)
            echo -ne "  Masukkan jumlah hari: "
            read -r DAYS
            ;;
        *) DAYS=3 ;;
    esac

    node -e "
        const users = require('./users');
        const res = users.addVIP('$TARGET_UID', $DAYS);
        if (res.wasAlreadyVip) {
            console.log('\n  ✔ Sukses! User ID ' + '$TARGET_UID' + ' telah DIPERPANJANG VIP +' + $DAYS + ' hari.');
            console.log('  Total masa aktif sekarang: ' + res.totalDaysLeft + ' hari.');
        } else {
            console.log('\n  ✔ Sukses! User ID ' + '$TARGET_UID' + ' sekarang resmi VIP selama ' + $DAYS + ' hari.');
        }
        console.log('  Masa aktif s/d: ' + new Date(res.vip_until).toLocaleDateString('id-ID'));
        console.log('  📢 Pesan pengumuman ucapan selamat otomatis dikirim oleh bot ke Discord!');
    "
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

setup_vip_channel() {
    header
    echo -e "${WHITE}  SETUP CHANNEL PENGUMUMAN VIP DISCORD${NC}"
    echo ""
    echo -e "  Masukkan Channel ID Discord tempat bot mengirim pesan ucapan selamat & pengumuman saat ada pembelian / perpanjangan VIP."
    echo -e "  (Cara ambil: Klik kanan channel di Discord -> Copy Channel ID)"
    echo ""
    echo -ne "  Masukkan Channel ID Discord: "
    read -r CHAN_INPUT
    CHAN_INPUT=$(echo "$CHAN_INPUT" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if [ -n "$CHAN_INPUT" ]; then
        if [ -f "$CONFIG_FILE" ]; then
            grep -v "VIP_CHANNEL_ID=" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" 2>/dev/null
            mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        fi
        echo "VIP_CHANNEL_ID=\"$CHAN_INPUT\"" >> "$CONFIG_FILE"
        echo -e "\n${GREEN}  ✔ Channel ID berhasil disimpan ke $CONFIG_FILE!${NC}"
    else
        echo -e "\n${RED}  Channel ID tidak boleh kosong!${NC}"
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

remove_vip() {
    header
    echo -e "${WHITE}  HAPUS / CABUT STATUS VIP USER DISCORD${NC}"
    echo ""

    # Tampilkan daftar VIP dulu biar mudah pilih
    node -e "
        const users = require('./users');
        const list = users.getAllVIP();
        if (list.length === 0) {
            console.log('  (Belum ada member VIP aktif)');
        } else {
            console.log('  No. | DISCORD USER ID       | DISCORD TAG          | SISA HARI');
            console.log('  -----------------------------------------------------------------------');
            list.forEach((v, i) => {
                const noStr  = String(i + 1).padEnd(3);
                const idStr  = String(v.discord_id || '-').padEnd(21);
                const tagStr = String(v.tag || '-').padEnd(20);
                console.log('  ' + noStr + ' | ' + idStr + ' | ' + tagStr + ' | ' + v.days_left + ' hari (s/d ' + v.until + ')');
            });
            console.log('  -----------------------------------------------------------------------');
        }
    "
    echo ""
    echo -ne "  Masukkan Discord User ID yang ingin dicabut: "
    read -r TARGET_UID
    TARGET_UID=$(echo "$TARGET_UID" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if [ -n "$TARGET_UID" ]; then
        node -e "
            const users = require('./users');
            const res = users.removeVIP('$TARGET_UID');
            if (res) {
                console.log('\n  ✔ Status VIP untuk User ID ' + '$TARGET_UID' + ' telah dicabut.');
            } else {
                console.log('\n  User tidak ditemukan.');
            }
        "
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

list_vip() {
    header
    echo -e "${WHITE}  DAFTAR MEMBER VIP DISCORD AKTIF${NC}"
    echo ""
    node -e "
        const users = require('./users');
        const list = users.getAllVIP();
        if (list.length === 0) {
            console.log('  (Belum ada member VIP aktif)');
        } else {
            console.log('  No. | DISCORD USER ID       | DISCORD TAG          | USERNAME ROBLOX   | SISA HARI');
            console.log('  -----------------------------------------------------------------------------------------');
            list.forEach((v, i) => {
                const noStr  = String(i + 1).padEnd(3);
                const idStr  = String(v.discord_id || '-').padEnd(21);
                const tagStr = String(v.tag || '-').padEnd(20);
                const rbxStr = String(v.roblox || '-').padEnd(17);
                console.log('  ' + noStr + ' | ' + idStr + ' | ' + tagStr + ' | ' + rbxStr + ' | ' + v.days_left + ' hari (s/d ' + v.until + ')');
            });
            console.log('  -----------------------------------------------------------------------------------------');
            console.log('  Total VIP aktif: ' + list.length + ' user');
        }
    "
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

start_bot() {
    header
    if is_running; then
        echo -e "  ${YELLOW}Bot sudah berjalan dengan PID $(cat "$PID_FILE")${NC}"
    else
        echo -e "  ${CYAN}Memulai Bot Discord...${NC}"
        cd "$BOT_DIR" || exit
        nohup node discord_bot.js > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 2
        if is_running; then
            echo -e "  ${GREEN}✔ Bot berhasil dijalankan! (PID: $(cat "$PID_FILE"))${NC}"
        else
            echo -e "  ${RED}✘ Bot gagal jalan! Periksa log:${NC}"
            tail -n 10 "$LOG_FILE"
        fi
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

stop_bot() {
    header
    if is_running; then
        PID=$(cat "$PID_FILE")
        echo -e "  ${YELLOW}Menghentikan bot (PID: $PID)...${NC}"
        kill "$PID" 2>/dev/null
        rm -f "$PID_FILE"
        sleep 1
        echo -e "  ${GREEN}✔ Bot berhasil dihentikan.${NC}"
    else
        echo -e "  ${YELLOW}Bot tidak sedang berjalan.${NC}"
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

view_logs() {
    header
    echo -e "${WHITE}  LOG REAL-TIME BOT DISCORD (Tekan CTRL+C untuk kembali)${NC}"
    echo ""
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "Belum ada log file."
        sleep 2
    fi
    menu_utama
}

install_dependencies() {
    header
    echo -e "${WHITE}  INSTALL DEPENDENCIES (discord.js, python, yt-dlp, ffmpeg)${NC}"
    echo ""
    cd "$BOT_DIR" || exit
    echo -e "  ${CYAN}Installing discord.js...${NC}"
    npm install discord.js node-fetch --save
    echo -e "  ${GREEN}✔ Selesai!${NC}"
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

menu_utama() {
    header
    echo -e "${WHITE}  PILIH MENU:${NC}"
    echo ""
    echo -e "  ${CYAN}[1]${NC} Setup Discord Bot Token"
    echo -e "  ${CYAN}[2]${NC} Setup Cookie Bot Tumbal"
    echo -e "  ${MAGENTA}[3]${NC} Tambah / Perpanjang VIP User (Discord ID)"
    echo -e "  ${MAGENTA}[4]${NC} Hapus / Cabut VIP User"
    echo -e "  ${MAGENTA}[5]${NC} Cek List Member VIP Aktif"
    echo -e "  ${MAGENTA}[6]${NC} Setup Channel Pengumuman VIP (Discord)"
    echo -e "  ${GREEN}[7]${NC} Jalankan Bot Discord (Start)"
    echo -e "  ${RED}[8]${NC} Hentikan Bot Discord (Stop)"
    echo -e "  ${YELLOW}[9]${NC} Restart Bot Discord"
    echo -e "  ${WHITE}[10]${NC} Lihat Log Bot (Real-time)"
    echo -e "  ${WHITE}[11]${NC} Install Dependencies (npm install)"
    echo -e "  ${RED}[0]${NC} Keluar"
    echo ""
    echo -ne "  ${WHITE}Pilih menu: ${NC}"
    read -r CHOICE

    case $CHOICE in
        1) setup_token ;;
        2) setup_cookie ;;
        3) add_vip ;;
        4) remove_vip ;;
        5) list_vip ;;
        6) setup_vip_channel ;;
        7) start_bot ;;
        8) stop_bot ;;
        9) stop_bot; start_bot ;;
        10) view_logs ;;
        11) install_dependencies ;;
        0) clear; exit 0 ;;
        *) echo -e "\n${RED}  Pilihan tidak valid.${NC}"; sleep 1; menu_utama ;;
    esac
}

menu_utama
