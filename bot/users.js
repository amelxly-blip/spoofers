const fs = require('fs');
const path = require('path');
const USERS_DIR = path.join(__dirname, 'users');
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR);

const DEFAULT_OWNERS = ['6282174905591', '082174905591', '114246734070008'];

function getOwnerList() {
    const list = new Set(DEFAULT_OWNERS);
    const paths = [
        path.join(__dirname, '.bot_config'),
        path.join(process.cwd(), '.bot_config'),
        path.join(require('os').homedir(), '.bot_config'),
        path.join(require('os').homedir(), 'bot', '.bot_config')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            try {
                const raw = fs.readFileSync(p, 'utf8');
                const matches = [...raw.matchAll(/BOT_OWNER="?([^"\n\r]+)"?/g)];
                for (const m of matches) {
                    const val = m[1].trim();
                    for (const item of val.split(/[\s,;]+/)) {
                        const clean = item.replace(/[^0-9]/g, '');
                        if (clean) list.add(clean);
                    }
                }
            } catch {}
        }
    }
    return Array.from(list);
}

function getOwner() {
    const owners = getOwnerList();
    return owners[0] || '6282174905591';
}

function getUserFile(nomor) { return path.join(USERS_DIR, `${nomor}.json`); }

function getUser(nomor) {
    const file = getUserFile(nomor);
    if (!fs.existsSync(file)) return null;
    try { return JSON.parse(fs.readFileSync(file)); } catch { return null; }
}

function saveUser(nomor, data) { fs.writeFileSync(getUserFile(nomor), JSON.stringify(data, null, 2)); }

function createUser(nomor) {
    const data = {
        nomor, api_key: null, user_id: null, roblox_username: null,
        role: 'free', banned: false,
        quota: { used: 0, limit: 10, reset_at: null },
        vip_until: null
    };
    saveUser(nomor, data);
    return data;
}

function checkAndResetQuota(user) {
    if (!user.quota.reset_at) return user;
    if (new Date() >= new Date(user.quota.reset_at)) {
        user.quota.used = 0;
        user.quota.reset_at = null;
    }
    return user;
}

function checkVIP(user) {
    if (user.role !== 'vip' || !user.vip_until) return user;
    if (new Date() >= new Date(user.vip_until)) {
        user.role = 'free';
        user.vip_until = null;
        user.quota.limit = 10;
    }
    return user;
}

function canUse(nomor) {
    let user = getUser(nomor);
    if (!user) return { ok: false, reason: 'not_registered' };
    if (user.banned) return { ok: false, reason: 'banned' };
    if (!user.api_key || !user.user_id) return { ok: false, reason: 'no_account' };
    user = checkVIP(user); user = checkAndResetQuota(user);
    saveUser(nomor, user);
    if (user.role === 'vip') return { ok: true };
    if (user.quota.used >= user.quota.limit) return { ok: false, reason: 'quota_habis' };
    return { ok: true };
}

function useQuota(nomor, count = 1) {
    let user = getUser(nomor);
    if (!user || user.role === 'vip') return;
    user.quota.used += count;
    if (!user.quota.reset_at) {
        const reset = new Date();
        reset.setHours(reset.getHours() + 24);
        user.quota.reset_at = reset.toISOString();
    }
    saveUser(nomor, user);
}

function addVIP(nomor, days) {
    let user = getUser(nomor) || createUser(nomor);
    user.role = 'vip';
    const until = new Date();
    until.setDate(until.getDate() + days);
    user.vip_until = until.toISOString();
    user.quota.limit = 999999;
    saveUser(nomor, user);
    return user;
}

function removeVIP(nomor) {
    let user = getUser(nomor);
    if (!user) return null;
    user.role = 'free'; user.vip_until = null; user.quota.limit = 10;
    saveUser(nomor, user); return user;
}

function banUser(nomor) {
    let user = getUser(nomor) || createUser(nomor);
    user.banned = true; saveUser(nomor, user);
}

function getAllVIP() {
    const files = fs.readdirSync(USERS_DIR);
    const vips = [];
    for (const f of files) {
        try {
            let u = JSON.parse(fs.readFileSync(path.join(USERS_DIR, f)));
            u = checkVIP(u);
            if (u.role === 'vip') {
                const diff = Math.ceil((new Date(u.vip_until) - new Date()) / 86400000);
                vips.push({ nomor: u.nomor, username: u.roblox_username, days_left: diff });
            }
        } catch {}
    }
    return vips;
}

module.exports = {
    getUser,
    saveUser,
    createUser,
    canUse,
    useQuota,
    addVIP,
    removeVIP,
    banUser,
    getAllVIP,
    checkVIP,
    checkAndResetQuota,
    getOwner,
    getOwnerList,
    get OWNER() { return getOwner(); }
};
