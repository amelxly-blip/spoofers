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

    if [ -n "$GITHUB_TOKEN" ]; then
        echo -e "  GitHub Token : ${GREEN}✔ Terpasang (Auto-sync Whitelist Aktif)${NC}"
    else
        echo -e "  GitHub Token : ${YELLOW}○ Belum diset (Simpan Lokal)${NC}"
    fi
    echo -e "${MAGENTA}----------------------------------------------------${NC}"
}

setup_github_token() {
    header
    echo -e "${WHITE}  SETUP GITHUB PERSONAL ACCESS TOKEN (PAT)${NC}"
    echo ""
    echo -e "  Token ini digunakan agar saat menambah VIP script Roblox, daftar whitelist"
    echo -e "  otomatis tersinkron ke GitHub secara online tanpa pernah meminta username lagi."
    echo ""
    echo -e "  Cara buat token di GitHub (1 kali saja):"
    echo -e "  1. Buka browser: https://github.com/settings/tokens"
    echo -e "  2. Klik 'Generate new token (classic)'"
    echo -e "  3. Centang kotak 'repo'"
    echo -e "  4. Klik 'Generate token' lalu salin kodenya (ghp_...)"
    echo ""
    echo -ne "  Paste GitHub Token: "
    read -r GH_INPUT
    GH_INPUT=$(echo "$GH_INPUT" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if [ -n "$GH_INPUT" ]; then
        if [ -f "$CONFIG_FILE" ]; then
            grep -v "GITHUB_TOKEN=" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" 2>/dev/null
            mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        fi
        echo "GITHUB_TOKEN=\"$GH_INPUT\"" >> "$CONFIG_FILE"
        git -C "$BOT_DIR/.." remote set-url origin "https://$GH_INPUT@github.com/amelxly-blip/spoofers.git" 2>/dev/null
        git config --global credential.helper store 2>/dev/null
        echo -e "\n${GREEN}  ✔ GitHub Token berhasil disimpan! Auto-sync online aktif.${NC}"
    else
        echo -e "\n${RED}  Token tidak boleh kosong!${NC}"
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
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
        (async () => {
            const users = require('./users');
            const res = users.addVIP('$TARGET_UID', $DAYS);
            let u = users.getUser('$TARGET_UID');
            let name = u ? (u.discord_name || u.tag) : '';
            if (!name || name === 'User' || name === '-') {
                const fetched = await users.fetchDiscordDisplayName('$TARGET_UID', '$DISCORD_TOKEN');
                if (fetched && u) {
                    name = fetched;
                    u.discord_name = fetched;
                    u.tag = fetched;
                    users.saveUser('$TARGET_UID', u);
                }
            }
            const display = name ? name + ' (' + '$TARGET_UID' + ')' : '$TARGET_UID';
            if (res.wasAlreadyVip) {
                console.log('\n  ✔ Sukses! User ' + display + ' telah DIPERPANJANG VIP +' + $DAYS + ' hari.');
                console.log('  Total masa aktif sekarang: ' + res.totalDaysLeft + ' hari.');
            } else {
                console.log('\n  ✔ Sukses! User ' + display + ' sekarang resmi VIP selama ' + $DAYS + ' hari.');
            }
            console.log('  Masa aktif s/d: ' + new Date(res.vip_until).toLocaleDateString('id-ID'));
            console.log('  📢 Pesan pengumuman ucapan selamat otomatis dikirim oleh bot ke Discord!');
        })();
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
        (async () => {
            const users = require('./users');
            const list = await users.getAllVIPWithNames('$DISCORD_TOKEN');
            if (list.length === 0) {
                console.log('  (Belum ada member VIP aktif)');
            } else {
                console.log('  No. | DISCORD USER ID       | NAMA DISCORD           | SISA HARI');
                console.log('  -----------------------------------------------------------------------');
                list.forEach((v, i) => {
                    const noStr   = String(i + 1).padEnd(3);
                    const idStr   = String(v.discord_id || '-').padEnd(21);
                    const nameStr = String(v.name || '-').padEnd(22);
                    console.log('  ' + noStr + ' | ' + idStr + ' | ' + nameStr + ' | ' + v.days_left + ' hari (s/d ' + v.until + ')');
                });
                console.log('  -----------------------------------------------------------------------');
            }
        })();
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
        (async () => {
            const users = require('./users');
            const list = await users.getAllVIPWithNames('$DISCORD_TOKEN');
            if (list.length === 0) {
                console.log('  (Belum ada member VIP aktif)');
            } else {
                console.log('  No. | DISCORD USER ID       | NAMA DISCORD           | SISA HARI');
                console.log('  -----------------------------------------------------------------------');
                list.forEach((v, i) => {
                    const noStr   = String(i + 1).padEnd(3);
                    const idStr   = String(v.discord_id || '-').padEnd(21);
                    const nameStr = String(v.name || '-').padEnd(22);
                    console.log('  ' + noStr + ' | ' + idStr + ' | ' + nameStr + ' | ' + v.days_left + ' hari (s/d ' + v.until + ')');
                });
                console.log('  -----------------------------------------------------------------------');
                console.log('  Total VIP aktif: ' + list.length + ' user');
            }
        })();
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

add_roblox_vip() {
    header
    echo -e "${WHITE}  TAMBAH / PERPANJANG AKSES SCRIPT ROBLOX (USER ID)${NC}"
    echo ""
    echo -ne "  Masukkan Roblox User ID: "
    read -r TARGET_RID
    TARGET_RID=$(echo "$TARGET_RID" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if ! [[ "$TARGET_RID" =~ ^[0-9]{3,15}$ ]]; then
        echo -e "\n${RED}  Format Roblox User ID tidak valid! (Harus berupa angka).${NC}"
        sleep 2
        menu_utama
        return
    fi

    echo ""
    echo -e "  Pilihan Durasi Akses Script:"
    echo -e "  [1] 3 Hari (Trial / Hemat)"
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
        (async () => {
            const rw = require('./roblox_whitelist');
            const res = await rw.addRobloxVIP('$TARGET_RID', $DAYS);
            console.log('\n  ✔ Sukses! Akun Roblox: ' + res.roblox_username + ' (' + res.roblox_id + ')');
            if (res.wasAlreadyVip) {
                console.log('  Status: DIPERPANJANG +' + res.addedDays + ' Hari');
            } else {
                console.log('  Status: AKTIF BARU selama ' + res.addedDays + ' Hari');
            }
            console.log('  Total Sisa Hari: ' + res.totalDaysLeft + ' Hari (s/d ' + res.until_date + ')');
            if (res.isSynced) {
                console.log('  ✔ Whitelist otomatis disinkronkan ke GitHub secara online!');
            } else {
                console.log('  ✔ Whitelist berhasil disimpan di file lokal.');
                console.log('  ℹ Pasang GitHub Token di menu [3] jika ingin auto-sync online ke GitHub.');
            }
        })();
    "
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

remove_roblox_vip() {
    header
    echo -e "${WHITE}  HAPUS / CABUT AKSES SCRIPT ROBLOX (USER ID)${NC}"
    echo ""
    node -e "
        const rw = require('./roblox_whitelist');
        const list = rw.getAllRobloxVIP();
        if (list.length === 0) {
            console.log('  (Belum ada member Roblox script aktif)');
        } else {
            console.log('  No. | ROBLOX USER ID  | USERNAME ROBLOX      | SISA HARI');
            console.log('  ------------------------------------------------------------------');
            list.forEach((v, i) => {
                const noStr  = String(i + 1).padEnd(3);
                const idStr  = String(v.roblox_id).padEnd(16);
                const uStr   = String(v.roblox_username).padEnd(20);
                console.log('  ' + noStr + ' | ' + idStr + ' | ' + uStr + ' | ' + v.days_left + ' hari (s/d ' + v.until_date + ')');
            });
            console.log('  ------------------------------------------------------------------');
        }
    "
    echo ""
    echo -ne "  Masukkan Roblox User ID yang ingin dicabut: "
    read -r TARGET_RID
    TARGET_RID=$(echo "$TARGET_RID" | sed 's/^[ \t]*//;s/[ \t]*$//')

    if [ -n "$TARGET_RID" ]; then
        node -e "
            const rw = require('./roblox_whitelist');
            const res = rw.removeRobloxVIP('$TARGET_RID');
            if (res) {
                console.log('\n  ✔ Akses untuk Roblox ID ' + '$TARGET_RID' + ' (' + res.roblox_username + ') berhasil DICABUT.');
                console.log('  ✔ Whitelist otomatis disinkronkan ke GitHub!');
            } else {
                console.log('\n  User ID Roblox tidak ditemukan dalam daftar aktif.');
            }
        "
    fi
    echo ""
    echo -ne "  Tekan Enter untuk kembali..."
    read -r
    menu_utama
}

list_roblox_vip() {
    header
    echo -e "${WHITE}  DAFTAR MEMBER AKSES SCRIPT ROBLOX AKTIF${NC}"
    echo ""
    node -e "
        const rw = require('./roblox_whitelist');
        const list = rw.getAllRobloxVIP();
        if (list.length === 0) {
            console.log('  (Belum ada member Roblox script aktif)');
        } else {
            console.log('  No. | ROBLOX USER ID  | USERNAME ROBLOX      | SISA HARI');
            console.log('  ------------------------------------------------------------------');
            list.forEach((v, i) => {
                const noStr  = String(i + 1).padEnd(3);
                const idStr  = String(v.roblox_id).padEnd(16);
                const uStr   = String(v.roblox_username).padEnd(20);
                console.log('  ' + noStr + ' | ' + idStr + ' | ' + uStr + ' | ' + v.days_left + ' hari (s/d ' + v.until_date + ')');
            });
            console.log('  ------------------------------------------------------------------');
            console.log('  Total member Roblox aktif: ' + list.length + ' user');
        }
    "
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
    echo -e "  ${CYAN}[3]${NC} Setup GitHub Token (Auto-Sync Whitelist Online)"
    echo -e "  ${MAGENTA}[4]${NC} Tambah / Perpanjang VIP User (Discord ID)"
    echo -e "  ${MAGENTA}[5]${NC} Hapus / Cabut VIP User (Discord ID)"
    echo -e "  ${MAGENTA}[6]${NC} Cek List Member VIP Aktif (Discord ID)"
    echo -e "  ${MAGENTA}[7]${NC} Setup Channel Pengumuman VIP (Discord)"
    echo -e "  ${YELLOW}[8]${NC} Tambah / Perpanjang Akses Script (Roblox User ID)"
    echo -e "  ${YELLOW}[9]${NC} Hapus / Cabut Akses Script (Roblox User ID)"
    echo -e "  ${YELLOW}[10]${NC} Cek List Member Akses Script Roblox Aktif"
    echo -e "  ${GREEN}[11]${NC} Jalankan Bot Discord (Start)"
    echo -e "  ${RED}[12]${NC} Hentikan Bot Discord (Stop)"
    echo -e "  ${YELLOW}[13]${NC} Restart Bot Discord"
    echo -e "  ${WHITE}[14]${NC} Lihat Log Bot (Real-time)"
    echo -e "  ${WHITE}[15]${NC} Install Dependencies (npm install)"
    echo -e "  ${RED}[0]${NC} Keluar"
    echo ""
    echo -ne "  ${WHITE}Pilih menu: ${NC}"
    read -r CHOICE

    case $CHOICE in
        1) setup_token ;;
        2) setup_cookie ;;
        3) setup_github_token ;;
        4) add_vip ;;
        5) remove_vip ;;
        6) list_vip ;;
        7) setup_vip_channel ;;
        8) add_roblox_vip ;;
        9) remove_roblox_vip ;;
        10) list_roblox_vip ;;
        11) start_bot ;;
        12) stop_bot ;;
        13) stop_bot; start_bot ;;
        14) view_logs ;;
        15) install_dependencies ;;
        0) clear; exit 0 ;;
        *) echo -e "\n${RED}  Pilihan tidak valid.${NC}"; sleep 1; menu_utama ;;
    esac
}

menu_utama
