const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const ROOT_WHITELIST = path.join(REPO_ROOT, 'whitelist.json');
const BOT_WHITELIST = path.join(__dirname, 'whitelist.json');

function getWhitelistFilePath() {
    return ROOT_WHITELIST;
}

function loadWhitelist() {
    const file = getWhitelistFilePath();
    if (!fs.existsSync(file)) {
        if (fs.existsSync(BOT_WHITELIST)) {
            try { return JSON.parse(fs.readFileSync(BOT_WHITELIST, 'utf8')); } catch {}
        }
        return { updated_at: new Date().toISOString(), users: {} };
    }
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!data.users || typeof data.users !== 'object') data.users = {};
        return data;
    } catch {
        return { updated_at: new Date().toISOString(), users: {} };
    }
}

function saveWhitelist(data) {
    data.updated_at = new Date().toISOString();
    const str = JSON.stringify(data, null, 2);
    try { fs.writeFileSync(ROOT_WHITELIST, str, 'utf8'); } catch {}
    try { fs.writeFileSync(BOT_WHITELIST, str, 'utf8'); } catch {}

    // Auto git sync jika ada git repo
    try {
        execSync(`git -C "${REPO_ROOT}" add whitelist.json && git -C "${REPO_ROOT}" commit -m "chore(whitelist): update roblox script access" && git -C "${REPO_ROOT}" push origin main`, {
            stdio: 'ignore',
            timeout: 10000
        });
    } catch {}
}

async function fetchRobloxUsername(robloxId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`, { timeout: 8000 });
        if (res.ok) {
            const json = await res.json();
            return json.name || json.displayName || String(robloxId);
        }
    } catch {}
    return String(robloxId);
}

async function addRobloxVIP(robloxId, days = 30) {
    const idStr = String(robloxId).trim();
    const data = loadWhitelist();
    const nowSec = Math.floor(Date.now() / 1000);

    let currentEntry = data.users[idStr];
    const wasAlreadyVip = currentEntry && currentEntry.until && currentEntry.until > nowSec;

    let baseMs = Date.now();
    if (wasAlreadyVip) {
        baseMs = currentEntry.until * 1000;
    }

    const addedMs = parseInt(days, 10) * 86400000;
    const finalDate = new Date(baseMs + addedMs);
    const finalSec = Math.floor(finalDate.getTime() / 1000);
    const totalDaysLeft = Math.max(1, Math.ceil((finalDate.getTime() - Date.now()) / 86400000));

    let username = currentEntry ? currentEntry.roblox_username : null;
    if (!username || username === idStr) {
        username = await fetchRobloxUsername(idStr);
    }

    data.users[idStr] = {
        roblox_id: idStr,
        roblox_username: username,
        until: finalSec,
        until_date: finalDate.toLocaleDateString('id-ID'),
        days_left: totalDaysLeft,
        created_at: currentEntry ? currentEntry.created_at : new Date().toISOString()
    };

    saveWhitelist(data);

    return {
        roblox_id: idStr,
        roblox_username: username,
        wasAlreadyVip,
        addedDays: parseInt(days, 10),
        totalDaysLeft,
        until_date: finalDate.toLocaleDateString('id-ID')
    };
}

function removeRobloxVIP(robloxId) {
    const idStr = String(robloxId).trim();
    const data = loadWhitelist();
    if (!data.users[idStr]) return null;
    const removed = data.users[idStr];
    delete data.users[idStr];
    saveWhitelist(data);
    return removed;
}

function getAllRobloxVIP() {
    const data = loadWhitelist();
    const nowSec = Math.floor(Date.now() / 1000);
    const list = [];

    for (const [id, u] of Object.entries(data.users)) {
        const exp = Number(u.until) || 0;
        if (exp > nowSec) {
            const daysLeft = Math.max(1, Math.ceil((exp * 1000 - Date.now()) / 86400000));
            list.push({
                roblox_id: id,
                roblox_username: u.roblox_username || id,
                days_left: daysLeft,
                until_date: u.until_date || new Date(exp * 1000).toLocaleDateString('id-ID')
            });
        }
    }

    return list;
}

module.exports = {
    loadWhitelist,
    saveWhitelist,
    addRobloxVIP,
    removeRobloxVIP,
    getAllRobloxVIP,
    fetchRobloxUsername
};
