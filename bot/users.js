const fs = require('fs');
const path = require('path');
const USERS_DIR = path.join(__dirname, 'users');
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

const VIP_EVENTS_FILE = path.join(__dirname, 'vip_events.json');

function recordVipEvent(event) {
    let events = [];
    try {
        if (fs.existsSync(VIP_EVENTS_FILE)) {
            events = JSON.parse(fs.readFileSync(VIP_EVENTS_FILE, 'utf8'));
            if (!Array.isArray(events)) events = [];
        }
    } catch {}
    events.push(event);
    try {
        fs.writeFileSync(VIP_EVENTS_FILE, JSON.stringify(events, null, 2));
    } catch (e) {
        console.error('[Error recording VIP event]', e);
    }
}

function getUserFile(discordId) {
    return path.join(USERS_DIR, `${discordId}.json`);
}

function getUser(discordId) {
    if (!discordId) return null;
    const file = getUserFile(discordId);
    if (!fs.existsSync(file)) return null;
    try {
        let user = JSON.parse(fs.readFileSync(file, 'utf8'));
        user = checkVIP(user);
        user = checkAndResetQuota(user);
        return user;
    } catch {
        return null;
    }
}

function saveUser(discordId, data) {
    if (!discordId) return;
    try {
        fs.writeFileSync(getUserFile(discordId), JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving user:', e);
    }
}

function createUser(discordId, tag = '') {
    const data = {
        discord_id: String(discordId),
        tag: tag || '',
        api_key: null,
        user_id: null,
        creator_type: 'User', // 'User' | 'Group'
        roblox_username: null,
        roblox_display_name: null,
        group_id: null,
        group_name: null,
        role: 'free', // 'free' | 'vip'
        banned: false,
        quota: {
            used: 0,
            limit: 10,
            reset_at: null
        },
        vip_until: null,
        created_at: new Date().toISOString()
    };
    saveUser(discordId, data);
    return data;
}

function checkAndResetQuota(user) {
    if (!user || !user.quota) return user;
    if (user.quota.reset_at && new Date() >= new Date(user.quota.reset_at)) {
        user.quota.used = 0;
        user.quota.reset_at = null;
        saveUser(user.discord_id, user);
    }
    return user;
}

function checkVIP(user) {
    if (!user) return user;
    if (user.role === 'vip' && user.vip_until) {
        if (new Date() >= new Date(user.vip_until)) {
            user.role = 'free';
            user.vip_until = null;
            user.quota.limit = 10;
            saveUser(user.discord_id, user);
        }
    }
    return user;
}

function canUse(discordId) {
    let user = getUser(discordId);
    if (!user) return { ok: false, reason: 'not_registered' };
    if (user.banned) return { ok: false, reason: 'banned' };
    if (!user.api_key || (!user.user_id && !user.group_id)) return { ok: false, reason: 'no_account' };

    user = checkVIP(user);
    user = checkAndResetQuota(user);

    if (user.role === 'vip') return { ok: true, role: 'vip', user };
    if (user.quota.used >= user.quota.limit) {
        return { ok: false, reason: 'quota_habis', user };
    }
    return { ok: true, role: 'free', user };
}

function useQuota(discordId, count = 1) {
    let user = getUser(discordId);
    if (!user || user.role === 'vip') return;
    user.quota.used += count;
    if (!user.quota.reset_at) {
        const reset = new Date();
        reset.setHours(reset.getHours() + 24);
        user.quota.reset_at = reset.toISOString();
    }
    saveUser(discordId, user);
}

function addVIP(discordId, days = 30) {
    let user = getUser(discordId) || createUser(discordId);
    const wasAlreadyVip = user.role === 'vip' && user.vip_until && new Date(user.vip_until) > new Date();

    let baseDate = new Date();
    if (wasAlreadyVip) {
        baseDate = new Date(user.vip_until);
    }

    baseDate.setDate(baseDate.getDate() + parseInt(days, 10));
    user.role = 'vip';
    user.vip_until = baseDate.toISOString();
    user.quota.limit = 999999;
    user.quota.used = 0;
    saveUser(discordId, user);

    const totalDaysLeft = Math.max(1, Math.ceil((baseDate - new Date()) / (1000 * 60 * 60 * 24)));

    const eventData = {
        discordId: String(discordId),
        tag: user.tag || '',
        wasAlreadyVip,
        addedDays: parseInt(days, 10),
        totalDaysLeft,
        vip_until: user.vip_until,
        timestamp: Date.now()
    };

    recordVipEvent(eventData);

    return {
        ...user,
        wasAlreadyVip,
        addedDays: parseInt(days, 10),
        totalDaysLeft
    };
}

function removeVIP(discordId) {
    let user = getUser(discordId);
    if (!user) return null;
    user.role = 'free';
    user.vip_until = null;
    user.quota.limit = 10;
    saveUser(discordId, user);
    return user;
}

function getAllVIP() {
    if (!fs.existsSync(USERS_DIR)) return [];
    const files = fs.readdirSync(USERS_DIR);
    const vips = [];
    for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
            let u = JSON.parse(fs.readFileSync(path.join(USERS_DIR, f), 'utf8'));
            u = checkVIP(u);
            if (u && u.role === 'vip') {
                const diff = u.vip_until ? Math.ceil((new Date(u.vip_until) - new Date()) / 86400000) : 999;
                vips.push({
                    discord_id: String(u.discord_id || f.replace('.json', '')),
                    tag: String(u.tag || 'User'),
                    roblox: String(u.roblox_username || '-'),
                    days_left: Math.max(0, diff),
                    until: u.vip_until ? new Date(u.vip_until).toLocaleDateString('id-ID') : 'Permanen'
                });
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
    getAllVIP,
    checkVIP,
    checkAndResetQuota
};
