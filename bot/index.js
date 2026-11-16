const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { getUser, saveUser, createUser, canUse, useQuota, addVIP, removeVIP, banUser, getAllVIP, checkVIP, checkAndResetQuota, getOwner, getOwnerList } = require('./users');
const { runSpoof, runYTUpload } = require('./spoofer');

// Cegah duplicate process yang menyebabkan "Key used already or never filled" dan loop disconnect
const pidFile = path.join(__dirname, 'bot.pid');
try {
    if (fs.existsSync(pidFile)) {
        const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        if (oldPid && oldPid !== process.pid) {
            try {
                process.kill(oldPid, 'SIGKILL');
                console.log(`[INIT] Mematikan instance bot lama (PID: ${oldPid})`);
            } catch {}
        }
    }
    fs.writeFileSync(pidFile, String(process.pid));
} catch {}

process.on('uncaughtException', (err) => {
    console.error('⚠️ [UNCAUGHT EXCEPTION]', err?.message || err);
});
process.on('unhandledRejection', (err) => {
    console.error('⚠️ [UNHANDLED REJECTION]', err?.message || err);
});

const SPEED_OPTIONS = {
    "1": { label: "0.8x", val: 0.8, rec: "1.25x" },
    "2": { label: "1.0x (Normal)", val: 1.0, rec: "1.00x" },
    "3": { label: "1.2x", val: 1.2, rec: "0.83x" },
    "4": { label: "1.5x ⭐ RECOMMENDED", val: 1.5, rec: "0.67x" },
    "5": { label: "1.8x", val: 1.8, rec: "0.56x" },
    "6": { label: "2.0x (Bypass Cepat)", val: 2.0, rec: "0.50x" },
    "7": { label: "2.3x", val: 2.3, rec: "0.43x" },
    "8": { label: "2.5x (Bypass Ekstrem)", val: 2.5, rec: "0.40x" },
    "9": { label: "3.0x (Bypass Max)", val: 3.0, rec: "0.33x" },
};

const pendingAction = new Map();

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function parseUrls(text) {
    const urls = [];
    const matches = text.match(/https?:\/\/[^\s,;]+/gi) || [];
    for (const m of matches) {
        const u = m.trim();
        if (u && !urls.includes(u)) {
            urls.push(u);
        }
    }
    return urls;
}

function parseIds(text) {
    const out = [];
    for (const tok of text.split(/[\s,;]+/)) {
        const t = tok.replace(/^rbxassetid:\/\//i, '').trim();
        if (/^\d{1,19}$/.test(t)) out.push(t);
    }
    return [...new Set(out)];
}

function getNomor(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function normalizeNomor(num) {
    if (!num) return '';
    let clean = String(num).replace(/[^0-9]/g, '');
    if (clean.startsWith('08')) clean = '628' + clean.slice(2);
    if (clean.startsWith('8')) clean = '628' + clean.slice(1);
    return clean;
}

function speedMenu(title, showSkipNote = true) {
    let menu = `🎵 *${title}*\n\n`;
    for (const [k, v] of Object.entries(SPEED_OPTIONS)) {
        menu += `${k}. ${v.label} (Playback: ${v.rec})\n`;
    }
    menu += `\n_Reply pesan ini dengan angka pilihan_`;
    if (showSkipNote) {
        menu += `\n_Ketik *0* untuk skip speed (Decal/Animasi otomatis skip)_`;
    }
    return menu;
}

let isReconnecting = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version } = await fetchLatestBaileysVersion();
    const groupCache = new Map();
    const lidToPhone = new Map();
    const phoneToLid = new Map();

    function updateLidMap(meta) {
        if (!meta || !Array.isArray(meta.participants)) return;
        for (const p of meta.participants) {
            const phone = getNomor(p.id);
            const lid = getNomor(p.lid);
            if (phone && lid) {
                lidToPhone.set(lid, phone);
                phoneToLid.set(phone, lid);
            }
        }
    }

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['SpooferBot', 'Chrome', '1.0.0'],
        cachedGroupMetadata: async (jid) => {
            let meta = groupCache.get(jid);
            if (!meta) {
                try {
                    meta = await sock.groupMetadata(jid);
                    if (meta) {
                        groupCache.set(jid, meta);
                        updateLidMap(meta);
                    }
                } catch {
                    return null;
                }
            }
            return meta;
        },
    });

    sock.ev.on('groups.update', async (groups) => {
        for (const g of groups) {
            if (g?.id) {
                try {
                    const meta = await sock.groupMetadata(g.id);
                    if (meta) {
                        groupCache.set(g.id, meta);
                        updateLidMap(meta);
                    }
                } catch {}
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('\n========== SCAN QR CODE INI ==========');
            qrcode.generate(qr, { small: true });
            console.log('=======================================\n');
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus. Reconnect:', shouldReconnect, 'Status:', statusCode);
            if (shouldReconnect && !isReconnecting) {
                isReconnecting = true;
                try { sock.ev.removeAllListeners(); } catch {}
                // Beri jeda 5 detik agar socket lama benar-benar bersih di server WhatsApp
                setTimeout(() => {
                    isReconnecting = false;
                    startBot();
                }, 5000);
            } else if (!shouldReconnect) {
                console.log('Logged out. Hapus folder auth dan scan QR ulang.');
            }
        } else if (connection === 'open') {
            isReconnecting = false;
            const botJid = sock.user?.id || '';
            const botNomor = getNomor(botJid);
            console.log(`✅ SpooferBot terhubung! Nomor Bot: ${botNomor || 'Terdeteksi'}`);
            try {
                const cfgFile = path.join(__dirname, '.bot_config');
                let cur = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, 'utf8') : '';
                if (botNomor) {
                    if (cur.includes('BOT_NOMOR=')) {
                        cur = cur.replace(/BOT_NOMOR="?[^"\n\r]*"?/, `BOT_NOMOR="${botNomor}"`);
                    } else {
                        cur += `\nBOT_NOMOR="${botNomor}"\n`;
                    }
                    fs.writeFileSync(cfgFile, cur);
                }
            } catch {}
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message) continue;

            // Ekstrak pesan murni (support Pesan Sementara / Ephemeral Messages di Grup WA)
            const inner = msg.message?.ephemeralMessage?.message ||
                          msg.message?.viewOnceMessage?.message ||
                          msg.message?.viewOnceMessageV2?.message ||
                          msg.message?.documentWithCaptionMessage?.message ||
                          msg.message;

            const text = (
                inner?.conversation ||
                inner?.extendedTextMessage?.text ||
                inner?.imageMessage?.caption ||
                inner?.videoMessage?.caption || ''
            ).trim();

            const isFromMe = Boolean(msg.key.fromMe);
            // Abaikan pesan jika dari bot sendiri KECUALI diawali perintah '.' (owner mengetik di HP bot)
            if (isFromMe && !text.startsWith('.')) continue;

            const jid = msg.key.remoteJid;
            const isGroup = jid.endsWith('@g.us');
            const isPrivate = jid.endsWith('@s.whatsapp.net');

            const currentOwner = (getOwner() || '').trim().replace(/[^0-9]/g, '');
            const ownerList = (typeof getOwnerList === 'function' ? getOwnerList() : ['6282174905591', '082174905591', '114246734070008']);
            const botJid = sock.user?.id || '';
            const botNomor = getNomor(botJid);

            let rawSender = isGroup ? (msg.key.participant || msg.participant || jid) : jid;
            if (isFromMe) {
                rawSender = botNomor || currentOwner || rawSender;
            }

            if (isGroup) {
                let meta = groupCache.get(jid);
                if (!meta) {
                    sock.groupMetadata(jid).then(m => {
                        if (m) {
                            groupCache.set(jid, m);
                            updateLidMap(m);
                        }
                    }).catch(() => {});
                } else {
                    updateLidMap(meta);
                }
            }

            let nomor = getNomor(rawSender);
            if (!nomor) continue;

            // Terjemahkan LID ke nomor HP jika diketahui
            if (lidToPhone.has(nomor)) {
                nomor = lidToPhone.get(nomor);
            } else if (nomor === '114246734070008') {
                nomor = '6282174905591';
            }

            const normUser = normalizeNomor(nomor);

            const isOwner = isFromMe || ownerList.some(ow => {
                const cleanOw = String(ow).trim().replace(/[^0-9]/g, '');
                if (!cleanOw) return false;
                if (nomor === cleanOw) return true;
                const normOw = normalizeNomor(cleanOw);
                if (normUser && normOw && normUser === normOw) return true;
                if (normUser.length >= 9 && normOw.length >= 9) {
                    if (normUser.endsWith(normOw) || normOw.endsWith(normUser)) return true;
                }
                return false;
            });

            console.log(`[MSG] Dari: ${nomor} (fromMe: ${isFromMe}) | OwnerList: [${ownerList.join(', ')}] | isOwner: ${isOwner} | Text: "${text}"`);

            const quoted = inner?.extendedTextMessage?.contextInfo;
            const reply = async (t, delayMs = 500) => {
                if (delayMs > 0) await sleep(delayMs);
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        return await sock.sendMessage(jid, { text: t });
                    } catch (sendErr) {
                        if (attempt === 1) {
                            await sleep(1500);
                        } else {
                            console.error('⚠️ Gagal kirim pesan WA:', sendErr?.message || sendErr);
                        }
                    }
                }
            };

            if (text.toLowerCase() === '.myid' || text.toLowerCase() === '.cekowner') {
                await reply(`📱 *INFO STATUS OWNER*\n\nNomor Anda: \`${nomor}\`\nPengirim Sendiri (fromMe): \`${isFromMe}\`\nDaftar Owner: \`${ownerList.join(', ')}\`\nStatus Akses Owner: *${isOwner ? '✅ AKTIF (ANDA OWNER)' : '❌ BUKAN OWNER'}*`, 0);
                continue;
            }

            // LOGOUT AKUN ROBLOX
            if (text.toLowerCase() === '.logout' || text.toLowerCase() === '.logoutakun') {
                let user = getUser(nomor);
                if (!user || (!user.api_key && !user.user_id)) {
                    await reply(`⚠️ Anda belum menghubungkan akun Roblox apapun.\nKetik *.setupakun* untuk menghubungkan akun.`);
                    continue;
                }
                const oldName = user.roblox_username || user.user_id;
                user.api_key = null;
                user.user_id = null;
                user.roblox_username = null;
                saveUser(nomor, user);
                await reply(`🚪 *LOGOUT BERHASIL!*\n\nAkun Roblox *${oldName}* telah berhasil diputus dari bot ini.\n\nKetik *.setupakun* kapan saja jika ingin menghubungkan akun kembali.`);
                continue;
            }

            // SETUP AKUN - langsung balas tanpa DM
            if (text.toLowerCase() === '.setupakun') {
                await reply(
                    `📱 *SETUP AKUN ROBLOX*\n\n` +
                    `Kirim pesan berikut dalam *satu pesan* ke bot ini:\n\n` +
                    `\`.apikey[API Key kamu]\n.userid[User ID kamu]\`\n\n` +
                    `Contoh:\n\`.apikeyabc123xxx\n.userid12345678\`\n\n` +
                    `📌 *Cara dapat API Key:*\n` +
                    `1. Buka create.roblox.com\n` +
                    `2. Credentials → API Keys\n` +
                    `3. Buat key, centang Assets Read & Write`
                );
                continue;
            }

            // APIKEY + USERID dalam satu pesan, tanpa spasi, tanpa titik dua
            if (text.toLowerCase().startsWith('.apikey') && text.includes('\n') && text.toLowerCase().includes('.userid')) {
                const lines = text.trim().split('\n');
                const apiKeyLine = lines.find(l => l.toLowerCase().startsWith('.apikey'));
                const userIdLine = lines.find(l => l.toLowerCase().startsWith('.userid'));

                if (!apiKeyLine || !userIdLine) {
                    await reply(`❌ Format salah!\n\nKirim dalam satu pesan:\n\`.apikeyAPIKEYKAMU\n.useridUSERIDKAMU\``);
                    continue;
                }

                const apiKey = apiKeyLine.slice(7).trim();
                const userId = userIdLine.slice(7).trim();

                if (!apiKey || !userId) {
                    await reply(`❌ API Key atau User ID kosong!\n\nContoh:\n\`.apikeyabc123\n.userid12345678\``);
                    continue;
                }

                let user = getUser(nomor) || createUser(nomor);
                user.api_key = apiKey;
                user.user_id = userId;

                try {
                    const r = await fetch(`https://users.roblox.com/v1/users/${userId}`);
                    const data = await r.json();
                    if (data.name) {
                        user.roblox_username = data.name;
                        saveUser(nomor, user);
                        await reply(`🎉 *Selamat!* Akun berhasil terhubung!\n\n👤 Username: *${data.name}*\n🆔 ID: ${userId}\n\nKetik *.help* untuk tutorial lengkap.`);
                    } else {
                        saveUser(nomor, user);
                        await reply(`⚠️ Akun tersimpan tapi username tidak ditemukan.\nCek User ID kamu ya!\n\nKetik *.help* untuk tutorial.`);
                    }
                } catch {
                    saveUser(nomor, user);
                    await reply(`✅ Akun tersimpan!\nKetik *.help* untuk tutorial.`);
                }
                continue;
            }

            if (text.toLowerCase() === '.cekstatus') {
                let user = getUser(nomor);
                if (!user && phoneToLid.has(nomor)) user = getUser(phoneToLid.get(nomor));
                if (!user && lidToPhone.has(nomor)) user = getUser(lidToPhone.get(nomor));

                if (!user) { await reply(`❌ Belum daftar. Ketik *.setupakun* dulu!`); continue; }
                user = checkVIP(user); user = checkAndResetQuota(user);

                const isVip = isOwner || user.role === 'vip';
                if (isVip) {
                    user.role = 'vip';
                    user.quota.limit = 999999;
                }
                saveUser(nomor, user);

                const role = isVip ? '👑 VIP' : '🆓 Free';
                const quota = isVip ? 'Unlimited ♾️' : `${user.quota.used}/${user.quota.limit}`;
                const vipUntil = isOwner ? 'Selamanya (Owner 👑)' : (user.vip_until ? new Date(user.vip_until).toLocaleDateString('id-ID') : '-');
                const resetAt = user.quota.reset_at ? new Date(user.quota.reset_at).toLocaleString('id-ID') : '-';
                await reply(
                    `📊 *STATUS AKUN*\n\n` +
                    `👤 Username: ${user.roblox_username || 'Belum konek'}\n` +
                    `🆔 Roblox ID: ${user.user_id || '-'}\n` +
                    `⭐ Role: ${role}\n` +
                    `📦 Kuota: ${quota}\n` +
                    `⏰ Reset kuota: ${resetAt}\n` +
                    `💎 VIP hingga: ${vipUntil}`
                );
                continue;
            }

            if (text.toLowerCase() === '.help') {
                await reply(
                    `🔥 *SPOOFER BOT - TUTORIAL*\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 *KONEK AKUN ROBLOX*\n` +
                    `1. Ketik *.setupakun*\n` +
                    `2. Ikuti instruksi bot\n` +
                    `3. Kirim dalam satu pesan:\n` +
                    `   .apikey[API Key]\n` +
                    `   .userid[User ID]\n\n` +
                    `📌 *CARA DAPAT API KEY*\n` +
                    `1. Buka create.roblox.com\n` +
                    `2. Credentials → API Keys\n` +
                    `3. Buat key, centang Assets Read & Write\n\n` +
                    `📌 *SPOOF ANIMASI/AUDIO/DECAL*\n` +
                    `*.spoof [ID1,ID2,ID3]*\n` +
                    `Contoh: .spoof 123456,789012\n\n` +
                    `📌 *UPLOAD AUDIO DARI YOUTUBE*\n` +
                    `*.upload [link YouTube]*\n` +
                    `Contoh 1 lagu: .upload https://youtu.be/xxx\n` +
                    `Multi upload : .upload https://youtu.be/link1, https://youtu.be/link2\n\n` +
                    `📌 *KUOTA*\n` +
                    `🆓 Free: 10x upload/hari\n` +
                    `👑 VIP: Unlimited\n` +
                    `Beli VIP: wa.me/${currentOwner}\n\n` +
                    `📌 *COMMAND LAIN*\n` +
                    `*.cekstatus* — lihat status akun\n` +
                    `*.setupakun* — konek akun Roblox\n` +
                    `*.logout* — putus/logout akun Roblox\n` +
                    `━━━━━━━━━━━━━━━━━━━━`
                );
                continue;
            }

            if (text.toLowerCase().startsWith('.spoof')) {
                const idPart = text.slice(6).trim();
                const ids = parseIds(idPart);
                if (!ids.length) { await reply(`❌ Format salah!\nContoh: .spoof 123456789,987654321`); continue; }

                const check = canUse(nomor);
                if (check.reason === 'not_registered') { await reply(`❌ Belum daftar!\nKetik *.setupakun* dulu.`); continue; }
                if (check.reason === 'banned') { await reply(`🚫 Akun kamu dibanned. Hubungi admin.`); continue; }
                if (check.reason === 'no_account') { await reply(`❌ Akun Roblox belum terhubung!\nKetik *.setupakun* dulu.`); continue; }
                if (check.reason === 'quota_habis') {
                    await reply(`⛔ *KUOTA HARIAN ANDA TELAH HABIS*\n\nSegera BUY VIP ke nomor:\n📱 *${currentOwner}*\n\nAtau tunggu *24 jam* untuk melakukan spoof kembali.`);
                    continue;
                }

                const user = getUser(nomor);
                pendingAction.set(nomor, {
                    type: 'spoof_type_select',
                    ids,
                    api_key: user.api_key,
                    user_id: user.user_id,
                    jid,
                    msg
                });

                let menu = `📦 *PILIH JENIS TARGET SPOOF*\n\n`;
                menu += `Total Asset: *${ids.length} ID*\n\n`;
                menu += `1. Audio 🔊 (Bisa atur speed bypass)\n`;
                menu += `2. Animasi 🎬 (.rbxm)\n`;
                menu += `3. Decal 🖼️ (Gambar/Texture)\n`;
                menu += `4. Otomatis ⚡ (Auto-detect)\n\n`;
                menu += `_Reply pesan ini dengan angka pilihan (1/2/3/4)_`;
                await reply(menu);
                continue;
            }

            if (text.toLowerCase().startsWith('.upload')) {
                const urls = parseUrls(text);
                if (!urls.length) {
                    await reply(`❌ Format salah!\n\nContoh upload 1 lagu:\n.upload https://youtu.be/xxx\n\nContoh upload banyak sekaligus:\n.upload https://youtu.be/link1, https://youtu.be/link2`);
                    continue;
                }

                const check = canUse(nomor);
                if (check.reason === 'not_registered') { await reply(`❌ Belum daftar!\nKetik *.setupakun* dulu.`); continue; }
                if (check.reason === 'banned') { await reply(`🚫 Akun kamu dibanned. Hubungi admin.`); continue; }
                if (check.reason === 'no_account') { await reply(`❌ Akun Roblox belum terhubung!\nKetik *.setupakun* dulu.`); continue; }
                if (check.reason === 'quota_habis') {
                    await reply(`⛔ *KUOTA HARIAN ANDA TELAH HABIS*\n\nSegera BUY VIP ke nomor:\n📱 *${currentOwner}*\n\nAtau tunggu *24 jam* untuk melakukan upload kembali.`);
                    continue;
                }

                let user = getUser(nomor);
                const remainingQuota = user.role === 'vip' ? 999999 : Math.max(0, user.quota.limit - user.quota.used);
                let toProcess = urls;
                let skippedCount = 0;

                if (user.role !== 'vip' && urls.length > remainingQuota) {
                    toProcess = urls.slice(0, remainingQuota);
                    skippedCount = urls.length - remainingQuota;
                }

                pendingAction.set(nomor, {
                    type: 'yt',
                    urls: toProcess,
                    skippedCount,
                    totalRequested: urls.length,
                    api_key: user.api_key,
                    user_id: user.user_id,
                    jid,
                    msg
                });

                let menuTitle = 'Pilih Speed Bypass Audio YT';
                if (toProcess.length > 1) {
                    menuTitle += ` (${toProcess.length} Lagu)`;
                }
                await reply(speedMenu(menuTitle));
                continue;
            }

            if (quoted && pendingAction.has(nomor)) {
                const pending = pendingAction.get(nomor);
                const choice = text.trim();

                // TAHAP 1: PEMILIHAN JENIS ASSET (AUDIO / ANIMASI / DECAL / OTOMATIS)
                if (pending.type === 'spoof_type_select') {
                    if (choice === '1') {
                        // Audio -> Tampilkan menu pilihan speed!
                        pendingAction.set(nomor, {
                            type: 'spoof_audio_speed',
                            ids: pending.ids,
                            api_key: pending.api_key,
                            user_id: pending.user_id,
                            jid,
                            msg
                        });
                        await reply(speedMenu(`Pilih Speed Bypass Audio (${pending.ids.length} ID)`));
                        continue;
                    } else if (choice === '2' || choice === '3' || choice === '4') {
                        // Animasi (2), Decal (3), atau Otomatis (4) -> LANGSUNG PROSES TANPA SPEED
                        pendingAction.delete(nomor);
                        const TYPE_MAP = { '2': 'Animation', '3': 'Decal', '4': 'auto' };
                        const LABEL_MAP = { '2': 'Animasi 🎬', '3': 'Decal 🖼️', '4': 'Asset (Otomatis) ⚡' };
                        const assetType = TYPE_MAP[choice];
                        const typeLabel = LABEL_MAP[choice];

                        await reply(`⏳ Memproses spoof *${pending.ids.length} ${typeLabel}*... Mohon tunggu!`, 1000);
                        try {
                            const results = await runSpoof(pending.ids, pending.api_key, pending.user_id, null, assetType);
                            const ok = results.filter(r => r.ok);
                            const fail = results.filter(r => !r.ok);
                            useQuota(nomor, ok.length);

                            const TYPE_EMOJI = {
                                'Audio': '🔊',
                                'Animation': '🎬',
                                'Decal': '🖼️',
                                'Image': '🖼️',
                                'Model': '📦',
                                'Mesh': '📦',
                                'MeshPart': '📦',
                                'Plugin': '🔧',
                                'Video': '🎥',
                            };

                            let res = `✅ *HASIL SPOOF ${typeLabel.toUpperCase()}*\n\n`;
                            res += `Berhasil: ${ok.length} | Gagal: ${fail.length} | Total: ${results.length}\n\n`;
                            for (const r of ok) {
                                const emoji = TYPE_EMOJI[r.type] || '📄';
                                const typeName = r.type || assetType;
                                res += `${emoji} *${r.name}*\n`;
                                res += `   Tipe     : ${typeName}\n`;
                                res += `   ID Lama  : ${r.id}\n`;
                                res += `   ID Baru  : \`${r.new_id}\`\n\n`;
                            }
                            for (const r of fail) {
                                res += `❌ ID ${r.id} (${r.name || 'Unknown'}): ${r.error || 'Gagal spoof'}\n\n`;
                            }

                            const user = getUser(nomor);
                            const sisa = (isOwner || user.role === 'vip') ? 'Unlimited ♾️' : `${user.quota.limit - user.quota.used}x`;
                            res += `📦 Sisa kuota: ${sisa}`;
                            await reply(res.trim(), 2000);
                        } catch (e) {
                            await reply(`❌ Error saat spoof: ${e.message}`, 2000);
                        }
                        continue;
                    } else {
                        await reply(`❌ Pilihan tidak valid. Silakan reply dengan angka:\n1 = Audio 🔊\n2 = Animasi 🎬\n3 = Decal 🖼️\n4 = Otomatis ⚡`);
                        continue;
                    }
                }

                // TAHAP 2: PEMILIHAN SPEED AUDIO / YT UPLOAD
                let speedVal = null;
                if (choice === '0') {
                    speedVal = null;
                } else if (SPEED_OPTIONS[choice]) {
                    speedVal = SPEED_OPTIONS[choice].val;
                } else {
                    await reply(`❌ Pilihan tidak valid. Ketik angka 0-9.`);
                    continue;
                }

                pendingAction.delete(nomor);

                if (pending.type === 'spoof_audio_speed' || pending.type === 'spoof') {
                    await reply(`⏳ Memproses spoof *${pending.ids.length} Audio 🔊*... Mohon tunggu!`, 1000);
                    try {
                        const results = await runSpoof(pending.ids, pending.api_key, pending.user_id, speedVal, 'Audio');
                        const ok = results.filter(r => r.ok);
                        const fail = results.filter(r => !r.ok);
                        useQuota(nomor, ok.length);

                        let res = `✅ *HASIL SPOOF AUDIO*\n\n`;
                        res += `Berhasil: ${ok.length} | Gagal: ${fail.length} | Total: ${results.length}\n\n`;
                        for (const r of ok) {
                            res += `🔊 *${r.name}*\n`;
                            res += `   Tipe     : Audio\n`;
                            res += `   ID Lama  : ${r.id}\n`;
                            res += `   ID Baru  : \`${r.new_id}\`\n`;
                            if (speedVal) {
                                res += `   Speed    : ${SPEED_OPTIONS[choice]?.label}\n`;
                                res += `   Playback : ${SPEED_OPTIONS[choice]?.rec}\n`;
                            }
                            res += `\n`;
                        }
                        for (const r of fail) {
                            res += `❌ ID ${r.id} (${r.name || 'Unknown'}): ${r.error || 'Gagal spoof'}\n\n`;
                        }

                        const user = getUser(nomor);
                        const sisa = (isOwner || user.role === 'vip') ? 'Unlimited ♾️' : `${user.quota.limit - user.quota.used}x`;
                        res += `📦 Sisa kuota: ${sisa}`;
                        await reply(res.trim(), 2000);
                    } catch (e) {
                        await reply(`❌ Error saat spoof: ${e.message}`, 2000);
                    }
                    continue;

                } else if (pending.type === 'yt') {
                    const totalSongs = pending.urls.length;
                    const songWord = totalSongs > 1 ? `${totalSongs} audio` : `audio`;
                    await reply(`⏳ Downloading & processing ${songWord} dari YouTube...\nMohon tunggu ya!`, 2000);

                    const successList = [];
                    const failList = [];

                    for (let i = 0; i < pending.urls.length; i++) {
                        const songUrl = pending.urls[i];
                        try {
                            const result = await runYTUpload(songUrl, pending.api_key, pending.user_id, speedVal);
                            if (result && result.success) {
                                useQuota(nomor, 1);
                                successList.push(result);
                            } else {
                                failList.push({ url: songUrl, error: result?.error || 'Gagal upload' });
                            }
                        } catch (err) {
                            failList.push({ url: songUrl, error: err.message });
                        }
                    }

                    const user = getUser(nomor);
                    const sisaKuota = user.role === 'vip' ? 'Unlimited ♾️' : `${user.quota.limit - user.quota.used}x`;

                    let res = '';
                    if (successList.length > 0) {
                        res += `✅ *UPLOAD BERHASIL!*\n\n`;
                        for (const item of successList) {
                            res += `🎵 Judul: *${item.title}*\n` +
                                   `🆔 Asset ID: \`${item.asset_id}\`\n`;
                            if (speedVal) {
                                res += `🎚️ Speed: ${SPEED_OPTIONS[choice]?.label}\n` +
                                       `📻 Playback in-game: ${SPEED_OPTIONS[choice]?.rec}\n`;
                            }
                            res += `\n`;
                        }
                    }

                    if (failList.length > 0) {
                        res += `❌ *GAGAL UPLOAD*\n`;
                        for (const f of failList) {
                            res += `• ${f.url}: ${f.error}\n`;
                        }
                        res += `\n`;
                    }

                    if (pending.skippedCount > 0) {
                        res += `⚠️ *${pending.skippedCount} lagu tidak diproses* karena melebihi sisa kuota harian kamu.\n\n`;
                    }

                    res += `📦 Sisa kuota: ${sisaKuota}`;

                    await reply(res.trim(), 4000);
                }
                continue;
            }

            if (!isOwner) continue;

            // Dukung 2 cara:
            // 1. Reply / Quote chat member di grup lalu ketik: .addpremium 30
            // 2. Ketik langsung: .addpremium @6282174905591_30day atau .addpremium 6282174905591 30
            let targetNomor = null;
            let days = 30;

            const quotedParticipant = quoted?.participant || inner?.extendedTextMessage?.contextInfo?.participant;
            const quoteMatch = text.match(/^\.addpremium(?:\s+(\d+)\s*(?:day|hari)?)?$/i);
            if (quoteMatch && quotedParticipant) {
                targetNomor = getNomor(quotedParticipant);
                if (quoteMatch[1]) days = parseInt(quoteMatch[1], 10);
            } else {
                const addPremMatch = text.match(/^\.addpremium\s*@?(\d+)[_\s]*(\d+)?\s*(?:day|hari)?$/i);
                if (addPremMatch) {
                    targetNomor = addPremMatch[1];
                    if (addPremMatch[2]) days = parseInt(addPremMatch[2], 10);
                }
            }

            if (targetNomor) {
                if (lidToPhone.has(targetNomor)) {
                    targetNomor = lidToPhone.get(targetNomor);
                }
                const normTarget = normalizeNomor(targetNomor) || targetNomor;

                addVIP(normTarget, days);
                // Sinkronkan juga ke targetNomor asli jika formatnya berbeda
                if (normTarget !== targetNomor) addVIP(targetNomor, days);
                // Jika target punya alias LID, sinkronkan juga
                if (phoneToLid.has(normTarget)) addVIP(phoneToLid.get(normTarget), days);
                if (phoneToLid.has(targetNomor)) addVIP(phoneToLid.get(targetNomor), days);

                await reply(`👑 *SUKSES UPGRADE VIP!*\n\n📱 Target: \`@${normTarget}\`\n⏳ Durasi: *${days} Hari*\n📦 Kuota: *Unlimited ♾️*`, 1000);
                continue;
            }

            const delPremMatch = text.match(/^\.delpremium\s*@?(\d+)$/i);
            if (delPremMatch) {
                const targetNomor = delPremMatch[1];
                removeVIP(targetNomor);
                await reply(`✅ Berhasil! Status VIP @${targetNomor} telah dicabut.`, 2000);
                continue;
            }

            const banMatch = text.match(/^\.ban\s*@?(\d+)$/i);
            if (banMatch) {
                const targetNomor = banMatch[1];
                banUser(targetNomor);
                await reply(`🚫 Berhasil! User @${targetNomor} telah dibanned.`, 2000);
                continue;
            }

            if (text.toLowerCase() === '.ceklistvip') {
                const vips = getAllVIP();
                if (!vips.length) { await reply(`📋 Belum ada user VIP.`); continue; }
                let list = `👑 *DAFTAR USER VIP*\n\n`;
                for (const v of vips) list += `📱 ${v.nomor}\n👤 ${v.username || '-'}\n⏰ Sisa: ${v.days_left} hari\n\n`;
                await reply(list);
                continue;
            }
        }
    });
}

startBot();
