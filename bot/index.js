const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { getUser, saveUser, createUser, canUse, useQuota, addVIP, removeVIP, banUser, getAllVIP, checkVIP, checkAndResetQuota, OWNER } = require('./users');
const { runSpoof, runYTUpload } = require('./spoofer');

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

function parseIds(text) {
    const out = [];
    for (const tok of text.split(/[\s,;]+/)) {
        const t = tok.replace(/^rbxassetid:\/\//i, '').trim();
        if (/^\d{1,19}$/.test(t)) out.push(t);
    }
    return [...new Set(out)];
}

function getNomor(jid) { return jid.split('@')[0].replace(/[^0-9]/g, ''); }

function speedMenu(title) {
    let menu = `🎵 *${title}*\n\n`;
    for (const [k, v] of Object.entries(SPEED_OPTIONS)) {
        menu += `${k}. ${v.label} (Playback: ${v.rec})\n`;
    }
    menu += `\n_Reply pesan ini dengan angka pilihan_\n_Ketik *0* untuk skip (animasi/decal)_`;
    return menu;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['SpooferBot', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('\n========== SCAN QR CODE INI ==========');
            qrcode.generate(qr, { small: true });
            console.log('=======================================\n');
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus. Reconnect:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => startBot(), 3000);
            } else {
                console.log('Logged out. Hapus folder auth dan scan QR ulang.');
            }
        } else if (connection === 'open') {
            console.log('✅ SpooferBot terhubung!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const jid = msg.key.remoteJid;
            const isGroup = jid.endsWith('@g.us');
            const isPrivate = jid.endsWith('@s.whatsapp.net');
            const nomor = getNomor(isGroup ? (msg.key.participant || jid) : jid);
            if (!nomor) continue;
            const isOwner = nomor === OWNER;
            const text = (
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption || ''
            ).trim();
            const quoted = msg.message?.extendedTextMessage?.contextInfo;
            const reply = async (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

            if (text.toLowerCase() === '.setupakun') {
                if (!isPrivate) {
                    await sock.sendMessage(jid, { text: `📩 Cek DM bot ini ya! Setup akun di chat pribadi.` }, { quoted: msg });
                    await sock.sendMessage(`${nomor}@s.whatsapp.net`, {
                        text: `Halo! 👋\n\nUntuk konek akun Roblox kamu, kirim:\n\n*.apikey: [API Key kamu]*\n*.userid: [User ID kamu]*\n\nContoh:\n.apikey: abc123xxx\n.userid: 12345678\n\n🔒 _Pesan ini hanya kamu yang bisa lihat_`
                    });
                } else {
                    await reply(`Kirim:\n*.apikey: [API Key kamu]*\n*.userid: [User ID kamu]*`);
                }
                continue;
            }

            if (isPrivate && text.toLowerCase().startsWith('.apikey:')) {
                const apiKey = text.slice(8).trim();
                let user = getUser(nomor) || createUser(nomor);
                user.api_key = apiKey;
                saveUser(nomor, user);
                await reply(`✅ API Key tersimpan!\n\nSekarang kirim:\n*.userid: [User ID kamu]*`);
                continue;
            }

            if (isPrivate && text.toLowerCase().startsWith('.userid:')) {
                const userId = text.slice(8).trim();
                let user = getUser(nomor) || createUser(nomor);
                user.user_id = userId;
                try {
                    const r = await fetch(`https://users.roblox.com/v1/users/${userId}`);
                    const data = await r.json();
                    if (data.name) {
                        user.roblox_username = data.name;
                        saveUser(nomor, user);
                        await reply(`🎉 *Selamat!* Akun berhasil terhubung!\n\n👤 Username: *${data.name}*\n🆔 ID: ${userId}\n\nKetik *.help* untuk tutorial lengkap.`);
                    } else {
                        await reply(`❌ User ID tidak ditemukan!`);
                    }
                } catch {
                    saveUser(nomor, user);
                    await reply(`✅ User ID tersimpan!\nKetik *.help* untuk tutorial.`);
                }
                continue;
            }

            if (text.toLowerCase() === '.cekstatus') {
                let user = getUser(nomor);
                if (!user) { await reply(`❌ Belum daftar. Ketik *.setupakun* dulu!`); continue; }
                user = checkVIP(user); user = checkAndResetQuota(user); saveUser(nomor, user);
                const role = user.role === 'vip' ? '👑 VIP' : '🆓 Free';
                const quota = user.role === 'vip' ? 'Unlimited ♾️' : `${user.quota.used}/${user.quota.limit}`;
                const vipUntil = user.vip_until ? new Date(user.vip_until).toLocaleDateString('id-ID') : '-';
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
                    `2. Bot DM kamu\n` +
                    `3. Kirim di DM bot:\n` +
                    `   .apikey: [API Key]\n` +
                    `   .userid: [User ID]\n\n` +
                    `📌 *CARA DAPAT API KEY*\n` +
                    `1. Buka create.roblox.com\n` +
                    `2. Credentials → API Keys\n` +
                    `3. Buat key, centang Assets Read & Write\n\n` +
                    `📌 *SPOOF ANIMASI/AUDIO/DECAL*\n` +
                    `*.spoof [ID1,ID2,ID3]*\n` +
                    `Contoh: .spoof 123456,789012\n\n` +
                    `📌 *UPLOAD AUDIO DARI YOUTUBE*\n` +
                    `*.upload [link YouTube]*\n` +
                    `Contoh: .upload https://youtu.be/xxx\n\n` +
                    `📌 *KUOTA*\n` +
                    `🆓 Free: 10x upload/hari\n` +
                    `👑 VIP: Unlimited\n` +
                    `Beli VIP: wa.me/${OWNER}\n\n` +
                    `📌 *COMMAND LAIN*\n` +
                    `*.cekstatus* — lihat status akun\n` +
                    `*.setupakun* — konek akun Roblox\n` +
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
                    await reply(`⛔ *KUOTA HARIAN ANDA TELAH HABIS*\n\nSegera BUY VIP ke nomor:\n📱 *${OWNER}*\n\nAtau tunggu *24 jam* untuk melakukan spoof kembali.`);
                    continue;
                }

                const user = getUser(nomor);
                pendingAction.set(nomor, { type: 'spoof', ids, api_key: user.api_key, user_id: user.user_id, jid, msg });
                await reply(speedMenu('Pilih Speed Bypass Audio'));
                continue;
            }

            if (text.toLowerCase().startsWith('.upload')) {
                const url = text.slice(7).trim();
                if (!url.startsWith('http')) { await reply(`❌ Format salah!\nContoh: .upload https://youtu.be/xxx`); continue; }

                const check = canUse(nomor);
                if (check.reason === 'not_registered') { await reply(`❌ Belum daftar!\nKetik *.setupakun* dulu.`); continue; }
                if (check.reason === 'banned') { await reply(`🚫 Akun kamu dibanned. Hubungi admin.`); continue; }
                if (check.reason === 'no_account') { await reply(`❌ Akun Roblox belum terhubung!\nKetik *.setupakun* dulu.`); continue; }
                if (check.reason === 'quota_habis') {
                    await reply(`⛔ *KUOTA HARIAN ANDA TELAH HABIS*\n\nSegera BUY VIP ke nomor:\n📱 *${OWNER}*\n\nAtau tunggu *24 jam* untuk melakukan spoof kembali.`);
                    continue;
                }

                const user = getUser(nomor);
                pendingAction.set(nomor, { type: 'yt', url, api_key: user.api_key, user_id: user.user_id, jid, msg });
                await reply(speedMenu('Pilih Speed Bypass Audio YT'));
                continue;
            }

            if (quoted && pendingAction.has(nomor)) {
                const pending = pendingAction.get(nomor);
                const choice = text.trim();
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

                if (pending.type === 'spoof') {
                    await sock.sendMessage(pending.jid, { text: `⏳ Memproses ${pending.ids.length} ID... Mohon tunggu!` }, { quoted: pending.msg });
                    try {
                        const assetType = speedVal ? 'Audio' : 'auto';
                        const results = await runSpoof(pending.ids, pending.api_key, pending.user_id, speedVal, assetType);
                        const ok = results.filter(r => r.ok);
                        const fail = results.filter(r => !r.ok);
                        useQuota(nomor, ok.length);

                        let res = `✅ *HASIL SPOOF*\n\n`;
                        res += `Berhasil: ${ok.length} | Gagal: ${fail.length} | Total: ${results.length}\n\n`;
                        for (const r of ok) res += `✅ *${r.name}*\n   ID Lama: ${r.id}\n   ID Baru: \`${r.new_id}\`\n\n`;
                        for (const r of fail) res += `❌ ${r.name || r.id}: ${r.error}\n\n`;

                        const user = getUser(nomor);
                        if (user.role === 'free') res += `📦 Sisa kuota: ${user.quota.limit - user.quota.used}x`;
                        await sock.sendMessage(pending.jid, { text: res }, { quoted: pending.msg });
                    } catch (e) {
                        await sock.sendMessage(pending.jid, { text: `❌ Error: ${e.message}` }, { quoted: pending.msg });
                    }

                } else if (pending.type === 'yt') {
                    await sock.sendMessage(pending.jid, { text: `⏳ Downloading & processing audio dari YouTube...\nMohon tunggu!` }, { quoted: pending.msg });
                    try {
                        const result = await runYTUpload(pending.url, pending.api_key, pending.user_id, speedVal);
                        if (result.success) {
                            useQuota(nomor, 1);
                            const speedInfo = speedVal ? `\n🎚️ Speed: ${SPEED_OPTIONS[choice]?.label}\n📻 Playback in-game: ${SPEED_OPTIONS[choice]?.rec}` : '';
                            const user = getUser(nomor);
                            const sisaKuota = user.role === 'free' ? `\n📦 Sisa kuota: ${user.quota.limit - user.quota.used}x` : '';
                            await sock.sendMessage(pending.jid, {
                                text: `✅ *UPLOAD BERHASIL!*\n\n` +
                                      `🎵 Judul: *${result.title}*\n` +
                                      `🆔 Asset ID: \`${result.asset_id}\`` +
                                      speedInfo + sisaKuota
                            }, { quoted: pending.msg });
                        } else {
                            await sock.sendMessage(pending.jid, { text: `❌ Gagal upload: ${result.error}` }, { quoted: pending.msg });
                        }
                    } catch (e) {
                        await sock.sendMessage(pending.jid, { text: `❌ Error: ${e.message}` }, { quoted: pending.msg });
                    }
                }
                continue;
            }

            if (!isOwner) continue;

            const addPremMatch = text.match(/^\.addpremium@(\d+)_(\d+)day$/i);
            if (addPremMatch) { addVIP(addPremMatch[1], parseInt(addPremMatch[2])); await reply(`✅ @${addPremMatch[1]} upgrade VIP ${addPremMatch[2]} hari!`); continue; }

            const delPremMatch = text.match(/^\.delpremium@(\d+)$/i);
            if (delPremMatch) { removeVIP(delPremMatch[1]); await reply(`✅ VIP @${delPremMatch[1]} dihapus.`); continue; }

            const banMatch = text.match(/^\.ban@(\d+)$/i);
            if (banMatch) { banUser(banMatch[1]); await reply(`🚫 @${banMatch[1]} dibanned.`); continue; }

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
