#!/data/data/com.termux/files/usr/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/bot/panel.sh" ]; then
    cd "$SCRIPT_DIR/bot" && exec bash panel.sh "$@"
else
    echo "Folder bot tidak ditemukan!"
fi
