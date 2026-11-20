const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const ROOT_WHITELIST = path.join(REPO_ROOT, 'whitelist.json');
const BOT_WHITELIST = path.join(__dirname, 'whitelist.json');

function getWhitelistFilePath() {
    return ROOT_WHITELIST;
}

function getGitHubToken() {
    try {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const cfgPath = path.join(homeDir, '.bot_config');
        if (fs.existsSync(cfgPath)) {
            const m = fs.readFileSync(cfgPath, 'utf8').match(/GITHUB_TOKEN=["']?([^"'\r\n]+)["']?/);
            if (m) return m[1].trim();
        }
    } catch {}
    return process.env.GITHUB_TOKEN || null;
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

async function syncToGitHubApi(token, owner, repo, filePath, contentString, commitMessage) {
    if (!token) return false;
    try {
        const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
        const headers = {
            'Authorization': `token ${token.trim()}`,
            'User-Agent': 'Roblox-Whitelist-Sync',
            'Accept': 'application/vnd.github.v3+json'
        };

        let sha = null;
        const getRes = await fetch(getUrl, { headers });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
        }

        const putBody = {
            message: commitMessage || 'chore: update whitelist.json',
            content: Buffer.from(contentString, 'utf8').toString('base64')
        };
        if (sha) putBody.sha = sha;

        const putRes = await fetch(getUrl, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(putBody)
        });

        return putRes.ok;
    } catch {
        return false;
    }
}

async function saveWhitelist(data) {
    data.updated_at = new Date().toISOString();
    const str = JSON.stringify(data, null, 2);
    try { fs.writeFileSync(ROOT_WHITELIST, str, 'utf8'); } catch {}
    try { fs.writeFileSync(BOT_WHITELIST, str, 'utf8'); } catch {}

    const token = getGitHubToken();
    let synced = false;

    // 1. Coba sync via GitHub REST API jika ada token (cepat & tanpa git CLI)
    if (token) {
        const ok1 = await syncToGitHubApi(token, 'amelxly-blip', 'spoofers', 'whitelist.json', str);
        const ok2 = await syncToGitHubApi(token, 'QuantumHub-QH', 'apa-', 'whitelist.json', str);
        if (ok1 || ok2) synced = true;
    }

    // 2. Coba sync git lokal TANPA pernah memunculkan prompt username di terminal
    if (!synced) {
        try {
            const pushTarget = token
                ? `https://${token}@github.com/amelxly-blip/spoofers.git`
                : `origin`;
            execSync(`git -C "${REPO_ROOT}" add whitelist.json && git -C "${REPO_ROOT}" commit -m "chore(whitelist): update roblox script access" && git -C "${REPO_ROOT}" push ${pushTarget} main`, {
                stdio: 'ignore',
                timeout: 8000,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
            });
            synced = true;
        } catch {}
    }

    return synced;
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

    const isSynced = await saveWhitelist(data);

    return {
        roblox_id: idStr,
        roblox_username: username,
        wasAlreadyVip,
        addedDays: parseInt(days, 10),
        totalDaysLeft,
        until_date: finalDate.toLocaleDateString('id-ID'),
        isSynced
    };
}

async function removeRobloxVIP(robloxId) {
    const idStr = String(robloxId).trim();
    const data = loadWhitelist();
    if (!data.users[idStr]) return null;
    const removed = data.users[idStr];
    delete data.users[idStr];
    await saveWhitelist(data);
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
    fetchRobloxUsername,
    getGitHubToken
};
