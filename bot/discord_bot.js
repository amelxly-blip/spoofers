const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');
const users = require('./users');
const { runSpoof, runYTUpload } = require('./spoofer');
const { parsePlaceId, ripGame, getTrending, getGameDetails } = require('./game_ripper');

const CONFIG_PATH = path.join(require('os').homedir(), '.bot_config');
let BOT_TOKEN = process.env.DISCORD_TOKEN || '';
let CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';

if (fs.existsSync(CONFIG_PATH)) {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const tokenMatch = raw.match(/DISCORD_TOKEN="?([^"\n\r]+)"?/);
        const clientMatch = raw.match(/DISCORD_CLIENT_ID="?([^"\n\r]+)"?/);
        if (tokenMatch) BOT_TOKEN = tokenMatch[1].trim();
        if (clientMatch) CLIENT_ID = clientMatch[1].trim();
    } catch {}
}

if (!BOT_TOKEN) {
    console.error('[ERROR] DISCORD_TOKEN belum diisi di ~/.bot_config!');
    console.log('Jalankan: bash panel.sh untuk memasukkan Discord Bot Token.');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Tangani error client dan shard agar bot tidak crash tanpa jejak
client.on('error', (err) => {
    console.error('[Discord Client Error]', err);
});

client.on('shardError', (error, shardId) => {
    console.error(`[Discord Shard Error] Shard ${shardId}:`, error);
});

client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[Discord Disconnected] Shard ${shardId} code ${event.code}: ${event.reason}`);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]', err);
});

// ==========================================
// FIFO QUEUE SYSTEM (ANTI-SPAM FREE USER)
// ==========================================
const taskQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || taskQueue.length === 0) return;
    isProcessingQueue = true;

    while (taskQueue.length > 0) {
        const currentTask = taskQueue.shift();
        try {
            await currentTask();
        } catch (err) {
            console.error('[Queue Error]', err);
        }
        // Jeda kecil antar antrean
        await new Promise(r => setTimeout(r, 1500));
    }

    isProcessingQueue = false;
}

function enqueueTask(taskFn, isVip = false) {
    if (isVip) {
        // VIP langsung di depan antrean
        taskQueue.unshift(taskFn);
    } else {
        // Free user mengantre di belakang
        taskQueue.push(taskFn);
    }
    processQueue();
}

// ==========================================
// SLASH COMMANDS DEFINITIONS
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Hubungkan akun Roblox uploader (Akun Pribadi atau Komunitas/Group)'),

    new SlashCommandBuilder()
        .setName('spoof')
        .setDescription('Bypass asset Roblox (Audio / Animasi / Decal)')
        .addStringOption(opt =>
            opt.setName('asset_id')
                .setDescription('Roblox Asset ID (bisa beberapa ID dipisah koma/spasi)')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('ytupload')
        .setDescription('Unduh audio YouTube (320kbps) & upload ke Roblox')
        .addStringOption(opt =>
            opt.setName('url')
                .setDescription('Link video YouTube (bisa beberapa link dipisah koma/spasi)')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Cek status akun Roblox, sisa kuota, dan role VIP kamu'),

    new SlashCommandBuilder()
        .setName('tutorial')
        .setDescription('Panduan lengkap setup akun, bikin API Key Roblox, upload YouTube, & spoof asset'),

    new SlashCommandBuilder()
        .setName('hapusakun')
        .setDescription('Putuskan koneksi akun Roblox uploader kamu dari bot'),

    new SlashCommandBuilder()
        .setName('gamesoundriperaudio')
        .setDescription('Scan & ambil semua Sound ID musik dari game Roblox (Place ID / Link)')
        .addStringOption(opt =>
            opt.setName('game')
                .setDescription('Link game Roblox atau Place ID (Contoh: https://roblox.com/games/4924922222)')
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('jumlah')
                .setDescription('Jumlah lagu yang ingin di-rip (Pilihan: 10, 25, 50, 100)')
                .setRequired(false)
                .addChoices(
                    { name: '10 Lagu', value: 10 },
                    { name: '25 Lagu (Rekomendasi)', value: 25 },
                    { name: '50 Lagu (Map Dugem / Club)', value: 50 },
                    { name: '100 Lagu (Maksimal Full Album)', value: 100 }
                )
        ),

    new SlashCommandBuilder()
        .setName('gamesoundriperdance')
        .setDescription('Scan & ambil semua Animation / Dance ID dari game Roblox (Place ID / Link)')
        .addStringOption(opt =>
            opt.setName('game')
                .setDescription('Link game Roblox atau Place ID (Contoh: https://roblox.com/games/4924922222)')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('trending')
        .setDescription('Daftar audio & dance yang lagi viral di Roblox + 1-klik spoof')
        .addStringOption(opt =>
            opt.setName('kategori')
                .setDescription('Pilih kategori trending yang ingin dilihat')
                .setRequired(true)
                .addChoices(
                    { name: '🎵 Trending Audio (Musik / Phonk / Breakbeat)', value: 'audio' },
                    { name: '🎬 Trending Dance (Emote / Animasi)', value: 'dance' }
                )
        ),

    new SlashCommandBuilder()
        .setName('grantmusic')
        .setDescription('Izinkan lagu Roblox kamu agar bisa diputar di game target tanpa error (Khusus VIP)')
        .addStringOption(opt =>
            opt.setName('game')
                .setDescription('Link game Roblox atau Place ID target (Contoh: https://roblox.com/games/4924922222)')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('asset_id')
                .setDescription('ID Audio Roblox (pisahkan koma jika banyak), atau ketik "all" untuk SEMUA lagu kamu')
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('vip')
        .setDescription('Lihat daftar harga paket VIP Spoofer & cara pembelian'),

    new SlashCommandBuilder()
        .setName('addvip')
        .setDescription('👑 [Owner] Tambah masa aktif VIP untuk user Discord')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User Discord yang ingin diberi VIP')
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('durasi')
                .setDescription('Pilih durasi VIP')
                .setRequired(true)
                .addChoices(
                    { name: '⚡ 3 Hari (Paket Hemat / Trial)', value: 3 },
                    { name: '📅 7 Hari (1 Minggu)', value: 7 },
                    { name: '🌟 30 Hari (1 Bulan)', value: 30 },
                    { name: '💎 60 Hari (2 Bulan)', value: 60 },
                    { name: '👑 365 Hari (1 Tahun)', value: 365 }
                )
        ),

    new SlashCommandBuilder()
        .setName('removevip')
        .setDescription('👑 [Owner] Cabut status VIP user Discord')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('User Discord yang ingin dicabut status VIP-nya')
                .setRequired(true)
        )
].map(c => c.toJSON());

// ==========================================
// REGISTER SLASH COMMANDS
// ==========================================
async function registerCommands(appId) {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        const targetId = appId || CLIENT_ID || client.user?.id;
        if (!targetId) {
            console.warn('[Discord] Application ID belum siap, lewati registrasi...');
            return;
        }
        console.log(`[Discord] Refreshing application (/) commands for App ID: ${targetId}...`);
        // 1. Bersihkan global commands agar tidak duplikat dengan guild commands
        try {
            await rest.put(Routes.applicationCommands(targetId), { body: [] });
        } catch (e) {
            console.warn('[Discord] Global commands clear error:', e.message);
        }

        // 2. Registrasi Guild Commands agar langsung muncul detik itu juga (0 delay) dan tidak double
        if (client.guilds && client.guilds.cache.size > 0) {
            for (const [guildId, guild] of client.guilds.cache) {
                try {
                    await rest.put(Routes.applicationGuildCommands(targetId, guildId), { body: commands });
                    console.log(`[Discord] Instant commands registered to guild: ${guild.name}`);
                } catch (gErr) {
                    console.warn(`[Discord] Failed guild commands for ${guildId}:`, gErr.message);
                }
            }
        }

        console.log('[Discord] Successfully reloaded application (/) commands!');
    } catch (err) {
        console.error('[Discord] Error registering commands:', err);
    }
}

// Helper fetch Roblox user profile
async function fetchRobloxUser(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}`, { timeout: 8000 });
        if (res.ok) {
            return await res.json();
        }
    } catch {}
    return null;
}

// Helper fetch Roblox group profile
async function fetchRobloxGroup(groupId) {
    try {
        const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`, { timeout: 8000 });
        if (res.ok) {
            return await res.json();
        }
    } catch {}
    return null;
}

function buildUserSetupModal() {
    const modal = new ModalBuilder()
        .setCustomId('modal_setup_user')
        .setTitle('SETUP AKUN ROBLOX');

    const apiKeyInput = new TextInputBuilder()
        .setCustomId('input_api_key')
        .setLabel('Roblox Open Cloud API Key')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Paste API Key dari Creator Hub di sini...')
        .setRequired(true);

    const userIdInput = new TextInputBuilder()
        .setCustomId('input_user_id')
        .setLabel('User ID atau Group ID kamu')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Contoh: 123456789 (Hanya angka)')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(apiKeyInput),
        new ActionRowBuilder().addComponents(userIdInput)
    );
    return modal;
}

function buildGroupSetupModal() {
    const modal = new ModalBuilder()
        .setCustomId('modal_setup_group')
        .setTitle('SETUP GROUP / KOMUNITAS ROBLOX');

    const apiKeyInput = new TextInputBuilder()
        .setCustomId('input_api_key')
        .setLabel('Roblox Open Cloud API Key')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Paste API Key Creator Hub di sini...')
        .setRequired(true);

    const groupIdInput = new TextInputBuilder()
        .setCustomId('input_group_id')
        .setLabel('Roblox Group ID (Komunitas)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Contoh: 1200769 (Hanya angka)')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(apiKeyInput),
        new ActionRowBuilder().addComponents(groupIdInput)
    );
    return modal;
}

// Helper fetch all audio assets owned by a Roblox user or group
async function fetchUserAllAudios(userId, maxCount = 100, creatorType = 'User') {
    if (!userId) return [];
    let allIds = [];
    let cursor = '';
    const cParam = String(creatorType).toLowerCase() === 'group' ? '&creatorType=Group' : '';
    while (allIds.length < maxCount) {
        const curParam = cursor ? '&cursor=' + encodeURIComponent(cursor) : '';
        const url = `https://apis.roblox.com/toolbox-service/v1/marketplace/3?creatorId=${userId}${cParam}&num=50${curParam}`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const r = await fetch(url, {
                headers: { 'User-Agent': 'Roblox/WinInet' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!r.ok) break;
            const d = await r.json();
            const ids = (d.data || []).map(x => String(x.id));
            if (!ids.length) break;
            allIds.push(...ids);
            if (!d.nextPageCursor) break;
            cursor = d.nextPageCursor;
        } catch { break; }
    }
    return [...new Set(allIds)].slice(0, maxCount);
}

// Helper grant asset permissions via Roblox Open Cloud API
async function grantAudioPermissions(apiKey, universeId, assetIds) {
    if (!assetIds || assetIds.length === 0) return { success: false, error: 'Tidak ada Asset ID yang diberikan.' };

    const BATCH_SIZE = 50;
    let totalSuccess = 0;
    let failedReason = null;

    for (let i = 0; i < assetIds.length; i += BATCH_SIZE) {
        const chunk = assetIds.slice(i, i + BATCH_SIZE);
        const requests = chunk.map(aid => ({
            assetId: String(aid),
            subject: {
                subjectType: 'Universe',
                subjectId: String(universeId)
            },
            action: 'Use'
        }));

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const res = await fetch('https://apis.roblox.com/asset-permissions-api/v1/assets/permissions', {
                method: 'PATCH',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requests }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                totalSuccess += chunk.length;
            } else {
                const body = await res.text();
                if (res.status === 403 || res.status === 401) {
                    return {
                        success: false,
                        error: 'API Key kamu belum memiliki izin **Asset Permissions (Write)**!\n\n**Cara Mengaktifkan:**\n1. Buka [Roblox Creator Hub](https://create.roblox.com/dashboard/credentials)\n2. Klik tombol Edit pada API Key kamu\n3. Di bagian **Access Permissions**, centang **Asset Permissions** ➔ pilih **Write**\n4. Klik **Save Changes** lalu coba lagi!'
                    };
                }
                failedReason = `HTTP ${res.status}: ${body.slice(0, 100)}`;
            }
        } catch (e) {
            failedReason = e.message;
        }
    }

    if (totalSuccess === 0 && failedReason) {
        return { success: false, error: failedReason };
    }

    return {
        success: true,
        totalSuccess,
        totalRequested: assetIds.length
    };
}

const OWNER_DISCORD_ID = '1309112913331748915';
const pendingSessions = new Map();
// Map untuk menyimpan data setup sementara saat ambiguous (ID match User & Group sekaligus)
const pendingSetupSessions = new Map();

function buildSpoofTypeUI(sessionId, assetIds) {
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🎮 PILIH TIPE ASET ROBLOX')
        .setDescription(
            `Asset ID: \`${assetIds.join(', ')}\`\n\n` +
            'Silakan pilih jenis tipe aset yang ingin kamu spoof / bypass:\n\n' +
            '• **[1] 🎵 Audio (MP3)** — Dilengkapi pilihan speed & pitch bypass\n' +
            '• **[2] 🎬 Animasi (.rbxm)** — Otomatis aktifkan **Asset Permissions Write** agar dance jalan in-game\n' +
            '• **[3] 🖼️ Decal (PNG)** — Bypass gambar & tekstur Roblox'
        )
        .setFooter({ text: 'Klik nomor pada tombol atau pilih dari menu box di bawah' })
        .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`type_select:${sessionId}`)
        .setPlaceholder('Pilih Tipe Aset (1. Audio / 2. Animasi / 3. Decal)...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('1. 🎵 Audio (MP3)')
                .setDescription('Bypass audio MP3 dengan pitch/speed shift')
                .setValue('audio'),
            new StringSelectMenuOptionBuilder()
                .setLabel('2. 🎬 Animasi (.rbxm - Auto Permission Write)')
                .setDescription('Bypass animasi dance & auto engine write permissions')
                .setValue('animation'),
            new StringSelectMenuOptionBuilder()
                .setLabel('3. 🖼️ Decal (PNG)')
                .setDescription('Bypass gambar / decal tekstur Roblox')
                .setValue('decal')
        );

    const rowDropdown = new ActionRowBuilder().addComponents(selectMenu);

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`type_btn:audio:${sessionId}`).setLabel('[1] 🎵 Audio').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`type_btn:animation:${sessionId}`).setLabel('[2] 🎬 Animasi').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`type_btn:decal:${sessionId}`).setLabel('[3] 🖼️ Decal').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [rowDropdown, rowButtons] };
}

function buildSpeedUI(sessionId, titleText) {
    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🎵 PILIH SPEED & PITCH BYPASS AUDIO')
        .setDescription(
            `${titleText}\n\n` +
            'Pilih kecepatan bypass & pitch agar audio lolos deteksi hak cipta Roblox:\n\n' +
            '• **[1] 1.5x (⭐ Recommended)** — Playback 0.67x *(Pitch naik seimbang)*\n' +
            '• **[2] 2.0x (⚡ Bypass Cepat)** — Playback 0.50x *(Pitch tinggi)*\n' +
            '• **[3] 1.0x (Normal)** — Playback 1.00x *(Asli tanpa pitch shift)*\n' +
            '• **[4] 1.2x** — Playback 0.83x | **[5] 1.8x** — Playback 0.56x\n' +
            '• **[6] 2.3x** — Playback 0.43x | **[7] 2.5x** — Playback 0.40x | **[8] 3.0x** — Playback 0.33x'
        )
        .setFooter({ text: 'Klik salah satu tombol nomor atau pilih dari menu box di bawah' })
        .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`speed_select:${sessionId}`)
        .setPlaceholder('Pilih Speed & Pitch Bypass Audio (1 - 8)...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('1. 1.5x (⭐ Recommended - Playback 0.67x)')
                .setDescription('Bypass standar terbaik, nada suara jernih')
                .setValue('1.5'),
            new StringSelectMenuOptionBuilder()
                .setLabel('2. 2.0x (⚡ Bypass Cepat - Playback 0.50x)')
                .setDescription('Bypass cepat untuk lagu sensitif copyright')
                .setValue('2.0'),
            new StringSelectMenuOptionBuilder()
                .setLabel('3. 1.0x (Normal - Playback 1.00x)')
                .setDescription('Asli original tanpa pitch shift')
                .setValue('1.0'),
            new StringSelectMenuOptionBuilder()
                .setLabel('4. 1.2x (Pitch Ringan - Playback 0.83x)')
                .setDescription('Sedikit percepat & pitch naik ringan')
                .setValue('1.2'),
            new StringSelectMenuOptionBuilder()
                .setLabel('5. 1.8x (Pitch Tinggi - Playback 0.56x)')
                .setDescription('Pitch tinggi lolos copyright ketat')
                .setValue('1.8'),
            new StringSelectMenuOptionBuilder()
                .setLabel('6. 2.3x (Pitch Ekstrem - Playback 0.43x)')
                .setDescription('Bypass tinggi audio')
                .setValue('2.3'),
            new StringSelectMenuOptionBuilder()
                .setLabel('7. 2.5x (Bypass Ekstrem - Playback 0.40x)')
                .setDescription('Ekstrem bypass audio')
                .setValue('2.5'),
            new StringSelectMenuOptionBuilder()
                .setLabel('8. 3.0x (Bypass Max - Playback 0.33x)')
                .setDescription('Bypass level maksimal')
                .setValue('3.0')
        );

    const rowDropdown = new ActionRowBuilder().addComponents(selectMenu);

    const rowButtons1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`speed_btn:1.5:${sessionId}`).setLabel('[1] 1.5x ⭐').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`speed_btn:2.0:${sessionId}`).setLabel('[2] 2.0x ⚡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`speed_btn:1.0:${sessionId}`).setLabel('[3] 1.0x Normal').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`speed_btn:1.2:${sessionId}`).setLabel('[4] 1.2x').setStyle(ButtonStyle.Secondary)
    );

    const rowButtons2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`speed_btn:1.8:${sessionId}`).setLabel('[5] 1.8x').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`speed_btn:2.3:${sessionId}`).setLabel('[6] 2.3x').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`speed_btn:2.5:${sessionId}`).setLabel('[7] 2.5x Ekstrem').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`speed_btn:3.0:${sessionId}`).setLabel('[8] 3.0x Max').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [rowDropdown, rowButtons1, rowButtons2] };
}

async function executeSpoofTask(interaction, session, speedVal, assetType) {
    const { discordId, ids, userObj, isVip } = session;
    const position = isVip ? 'Prioritas VIP ⚡' : `${taskQueue.length + 1}`;

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle('⏳ MEMASUKKAN KE ANTREAN SPOOF')
                .setDescription(`Asset ID: \`${ids.join(', ')}\`\nSpeed: \`${speedVal}x\` | Tipe: \`${assetType.toUpperCase()}\``)
                .addFields(
                    { name: 'Status Antrean', value: isVip ? '🌟 **VIP (Langsung Diproses)**' : `Posisi Antrean: **#${position}**`, inline: true }
                )
        ],
        components: []
    });

    enqueueTask(async () => {
        const total = ids.length;
        // Gunakan workers=4 agar cepat & tetap aman dari rate limit Roblox Open Cloud (limit 50 req/menit)
        const WORKERS = Math.min(4, Math.max(1, total));
        // Batch size untuk live update progress: proses sekelompok workers per batch
        const BATCH = WORKERS;

        function buildProgressBar(done, total) {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const filled = Math.round(pct / 10);
            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
            return `\`[${bar}] ${pct}% (${done}/${total})\``;
        }

        function buildProgressEmbed(done, allResults) {
            const ok = allResults.filter(r => r.ok).length;
            const fail = allResults.filter(r => !r.ok).length;
            const pbar = buildProgressBar(done, total);
            let desc = `${pbar}\n\n`;
            desc += `⚡ **Kecepatan:** ${WORKERS} worker paralel (Cepat & Anti-Rate Limit)\n`;
            desc += `📊 **Status:** ✅ **${ok}** berhasil  |  ❌ **${fail}** gagal  |  ⏳ **${total - done}** sisa\n\n`;
            if (allResults.length > 0) {
                desc += '**Progres Terakhir:**\n';
                for (const r of allResults.slice(-5)) { // tampilkan 5 terakhir
                    if (r.ok && r.new_id) {
                        const creator = r.creator ? ` | Creator: ${r.creator}` : '';
                        desc += `• **${r.name || 'Asset'}** | ID: \`${r.new_id}\`${creator}\n`;
                    } else {
                        desc += `• ❌ \`${r.id}\`: ${r.error || 'Gagal'}\n`;
                    }
                }
                if (allResults.length > 5) desc += `_...dan ${allResults.length - 5} lainnya_\n`;
            }
            const uploaderLabel = userObj.creator_type === 'Group' ? `👥 Group: ${userObj.roblox_username}` : `@${userObj.roblox_username}`;
            return new EmbedBuilder()
                .setColor('#f39c12')
                .setTitle(`⚙️ MEMPROSES SPOOF... (${done}/${total})`)
                .setDescription(desc)
                .setFooter({ text: `Akun: ${uploaderLabel} | Speed: ${WORKERS}x Paralel` })
                .setTimestamp();
        }

        try {
            const allResults = [];
            let doneSoFar = 0;

            // Tampilkan progress awal 0%
            await interaction.editReply({ embeds: [buildProgressEmbed(0, [])] });

            // Proses per batch paralel agar bot bisa update progress live
            for (let i = 0; i < total; i += BATCH) {
                const chunk = ids.slice(i, i + BATCH);
                const chunkResults = await runSpoof(chunk, userObj.api_key, userObj.user_id, speedVal, assetType, WORKERS, session.sourcePlaceId, userObj.creator_type || 'User');
                allResults.push(...chunkResults);
                doneSoFar += chunk.length;

                // Update progress bar live setelah tiap batch selesai
                if (doneSoFar < total) {
                    try {
                        await interaction.editReply({ embeds: [buildProgressEmbed(doneSoFar, allResults)] });
                    } catch (_) {}
                }
            }

            if (!allResults || allResults.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#e74c3c')
                            .setTitle('❌ SPOOF GAGAL')
                            .setDescription('Bot tidak dapat mengunduh atau mengunggah aset ke Roblox. Periksa kembali cookie bot tumbal / API key.')
                    ]
                });
            }

            // Bangun hasil final compact: 1 pesan, 1 baris per ID
            let successCount = 0;
            const lines = [];
            for (const item of allResults) {
                if (item.ok && item.new_id) {
                    successCount++;
                    const creatorPart = (item.creator && String(item.creator).trim()) ? ` | Creator: ${item.creator}` : '';
                    lines.push(`${item.name || 'Asset'} | ID: ${item.new_id}${creatorPart}`);
                } else {
                    lines.push(`❌ Gagal: ${item.name || 'Asset'} (ID: ${item.id}) - ${item.error || 'Gagal diproses'}`);
                }
            }

            const okCount = allResults.filter(r => r.ok).length;
            const failCount = allResults.length - okCount;
            const summary = `Berhasil: **${okCount}** | Gagal: **${failCount}** | Total: **${allResults.length}**`;
            const listText = lines.join('\n');
            const description = summary + '\n' + '─'.repeat(32) + '\n**📋 DAFTAR HASIL SPOOF:**\n' + listText;

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('🔥 HASIL SPOOF ASSET ROBLOX')
                .setDescription(description.length <= 4000 ? description : (description.slice(0, 3950) + '\n...dan seterusnya'))
                .setTimestamp();

            if (assetType === 'audio' && speedVal) {
                const recPlayback = (1.0 / parseFloat(speedVal)).toFixed(2);
                embed.addFields({
                    name: '⚙️ Setting In-Game',
                    value: `• **Speed Bypass:** \`${speedVal}x\` (High Pitch)\n• **Playback In-Game:** \`${recPlayback}x\` *(Atur Sound.PlaybackSpeed)*`,
                    inline: true
                });
            } else if (assetType === 'animation') {
                embed.addFields({
                    name: '⚙️ Permissions',
                    value: '`Permissions Write Activated (Dance Ready)`',
                    inline: true
                });
            }

            if (successCount > 0 && !isVip) {
                users.useQuota(discordId, successCount);
            }

            const sisa = isVip ? 'Unlimited' : `${Math.max(0, 10 - userObj.quota.used - successCount)}/10`;
            embed.setFooter({ text: `Akun: @${userObj.roblox_username} | Sisa Kuota: ${sisa}` });

            // Kirim listText langsung di pesan agar tinggal 1-klik copy tanpa kata-kata ribet
            const replyOptions = { embeds: [embed] };
            if (listText.length <= 1850) {
                replyOptions.content = `📋 **DAFTAR HASIL SPOOF:**\n` + listText;
            }

            await interaction.editReply(replyOptions);

        } catch (err) {
            console.error('[Spoof Error]', err);
            await interaction.editReply({
                content: `❌ Terjadi kesalahan saat memproses: ${err.message}`
            });
        }
    }, isVip);
}

async function executeYTUploadTask(interaction, session, speedVal) {
    const { discordId, urls, userObj, isVip } = session;
    const total = urls.length;
    const position = isVip ? 'Prioritas VIP ⚡' : `${taskQueue.length + 1}`;

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle('⏳ MEMASUKKAN KE ANTREAN YOUTUBE UPLOAD')
                .setDescription(`Jumlah Link: **${urls.length} audio**\nSpeed Bypass: \`${speedVal}x\` (High Pitch)`)
                .addFields(
                    { name: 'Status Antrean', value: isVip ? '🌟 **VIP (Langsung Diproses)**' : `Posisi Antrean: **#${position}**`, inline: true }
                )
        ],
        components: []
    });

    enqueueTask(async () => {
        function buildProgressBar(done, totalCount) {
            const pct = totalCount > 0 ? Math.round((done / totalCount) * 100) : 0;
            const filled = Math.round(pct / 10);
            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
            return `\`[${bar}] ${pct}% (${done}/${totalCount})\``;
        }

        function buildProgressEmbed(done, currentStage, allResults) {
            const ok = allResults.filter(r => r.ok).length;
            const fail = allResults.filter(r => !r.ok).length;
            const pbar = buildProgressBar(done, total);
            let desc = `${pbar}\n\n`;
            desc += `⚡ **Speed Bypass:** \`${speedVal}x\` (High Pitch Anti-Copyright)\n`;
            desc += `🔄 **Tahap Sekarang:** ${currentStage}\n`;
            desc += `📊 **Status:** ✅ **${ok}** berhasil  |  ❌ **${fail}** gagal  |  ⏳ **${total - done}** sisa\n\n`;
            if (allResults.length > 0) {
                desc += '**Progres Terakhir:**\n';
                for (const r of allResults.slice(-5)) {
                    if (r.ok && r.asset_id) {
                        desc += `• **${r.title || 'Audio'}** | ID: \`${r.asset_id}\`\n`;
                    } else {
                        desc += `• ❌ ${r.title || 'Audio'}: ${r.error || 'Gagal'}\n`;
                    }
                }
                if (allResults.length > 5) desc += `_...dan ${allResults.length - 5} lainnya_\n`;
            }
            const uploaderLabel = userObj.creator_type === 'Group' ? `👥 Group: ${userObj.roblox_username}` : `@${userObj.roblox_username}`;
            return new EmbedBuilder()
                .setColor('#f39c12')
                .setTitle(`⚙️ MEMPROSES YOUTUBE UPLOAD... (${done}/${total})`)
                .setDescription(desc)
                .setFooter({ text: `Akun Uploader: ${uploaderLabel} | Kualitas: 320kbps HD` })
                .setTimestamp();
        }

        try {
            const allResults = [];
            let doneSoFar = 0;

            // Tampilkan progress awal 0%
            await interaction.editReply({
                embeds: [buildProgressEmbed(0, 'Memulai download audio dari YouTube (320kbps)...', [])]
            });

            for (let i = 0; i < total; i++) {
                const currentUrl = urls[i];
                const stageText = `Mengunduh audio #${i + 1} (320kbps) & upload ke Roblox...`;

                // Update stage live sebelum proses URL
                try {
                    await interaction.editReply({
                        embeds: [buildProgressEmbed(doneSoFar, stageText, allResults)]
                    });
                } catch (_) {}

                try {
                    const res = await runYTUpload(currentUrl, userObj.api_key, userObj.user_id, speedVal, 180000, userObj.creator_type || 'User');
                    if (res && res.success && res.asset_id) {
                        allResults.push({
                            ok: true,
                            asset_id: res.asset_id,
                            title: res.title || `Audio #${i + 1}`,
                            url: currentUrl
                        });
                    } else {
                        allResults.push({
                            ok: false,
                            title: res?.title || `Audio #${i + 1}`,
                            error: res?.error || 'Gagal download / upload',
                            url: currentUrl
                        });
                    }
                } catch (itemErr) {
                    allResults.push({
                        ok: false,
                        title: `Audio #${i + 1}`,
                        error: itemErr.message || 'Error processing audio',
                        url: currentUrl
                    });
                }

                doneSoFar++;

                // Update progress bar live setelah tiap URL selesai
                if (doneSoFar < total) {
                    try {
                        await interaction.editReply({
                            embeds: [buildProgressEmbed(doneSoFar, `Selesai audio #${doneSoFar}, lanjut ke audio berikutnya...`, allResults)]
                        });
                    } catch (_) {}
                }
            }

            const successCount = allResults.filter(r => r.ok).length;
            const failCount = allResults.length - successCount;

            // Bangun hasil final compact: 1 pesan, 1 baris per ID
            const lines = [];
            for (const item of allResults) {
                if (item.ok && item.asset_id) {
                    lines.push(`${item.title || 'Audio'} | ID: ${item.asset_id}`);
                } else {
                    lines.push(`❌ Gagal: ${item.title || 'Audio'} - ${item.error || 'Gagal diproses'}`);
                }
            }

            const recPlayback = (1.0 / parseFloat(speedVal)).toFixed(2);
            const summary = `Berhasil: **${successCount}** | Gagal: **${failCount}** | Total: **${allResults.length}**`;
            const listText = lines.join('\n');
            const description = summary + '\n' + '─'.repeat(32) + '\n**📋 DAFTAR HASIL YOUTUBE UPLOAD:**\n' + listText;

            const finalEmbed = new EmbedBuilder()
                .setColor(successCount > 0 ? '#2ecc71' : '#e74c3c')
                .setTitle('🎵 HASIL UPLOAD AUDIO YOUTUBE KE ROBLOX')
                .setDescription(description.length <= 4000 ? description : (description.slice(0, 3950) + '\n...dan seterusnya'))
                .addFields({
                    name: '⚙️ Setting In-Game',
                    value: `• **Speed Bypass:** \`${speedVal}x\` (High Pitch)\n• **Playback In-Game:** \`${recPlayback}x\` *(Atur Sound.PlaybackSpeed)*\n• **Kualitas:** \`320kbps HD\``,
                    inline: true
                })
                .setTimestamp();

            if (successCount > 0 && !isVip) {
                users.useQuota(discordId, successCount);
            }

            const sisa = isVip ? 'Unlimited' : `${Math.max(0, 10 - userObj.quota.used - successCount)}/10`;
            finalEmbed.setFooter({ text: `Akun Uploader: @${userObj.roblox_username} | Sisa Kuota: ${sisa}` });

            const replyOptions = { embeds: [finalEmbed] };
            if (listText.length <= 1850) {
                replyOptions.content = `📋 **DAFTAR HASIL YOUTUBE UPLOAD:**\n` + listText;
            }

            await interaction.editReply(replyOptions);

        } catch (err) {
            console.error('[YT Upload Error]', err);
            await interaction.editReply({
                content: `❌ Terjadi kesalahan saat memproses: ${err.message}`
            });
        }
    }, isVip);
}

async function sendQuotaExceededReply(interaction) {
    let ownerUser = null;
    try {
        ownerUser = await client.users.fetch(OWNER_DISCORD_ID);
    } catch (e) {
        console.error('[Fetch Owner Error]', e);
    }

    const ownerName = ownerUser ? (ownerUser.globalName || ownerUser.username) : 'Owner';
    const ownerAvatar = ownerUser ? ownerUser.displayAvatarURL({ dynamic: true, size: 512 }) : null;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(`Chat / DM ${ownerName} (Beli Premium)`)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/users/${OWNER_DISCORD_ID}`)
            .setEmoji('💎')
    );

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('⛔ KUOTA HARIAN KAMU HABIS!')
        .setDescription(
            `### ⚠️ KUOTA HARIAN KAMU HABIS SEGERA BELI PREMIUM ANDA KE OWNER VIA DM\n\n` +
            `Sebagai **Free User**, kamu memiliki batas **10 upload per 24 jam**.\n` +
            `Semua kuota gratis kamu hari ini telah terpakai.`
        )
        .addFields(
            {
                name: '👑 Hubungi Owner',
                value: `**Mention:** <@${OWNER_DISCORD_ID}>\n**Username:** \`${ownerName}\`\n**User ID:** \`${OWNER_DISCORD_ID}\``,
                inline: false
            },
            {
                name: '💎 Keuntungan Akun VIP / Premium',
                value: (
                    '⚡ **Unlimited Kuota** (Bypass & upload tanpa batas harian)\n' +
                    '🚀 **Prioritas Antrean #1** (Langsung diproses tanpa antre)\n' +
                    '🎵 **Support YouTube Audio 320kbps + Multi Asset Spoof**\n' +
                    '🛡️ **Bypass Anti Hak Cipta & Aman Banned**'
                ),
                inline: false
            },
            {
                name: '💎 Daftar Harga Paket VIP',
                value: (
                    '• ⚡ **Rp 15.000** ➔ **3 HARI** *(Paket Hemat)*\n' +
                    '• 📅 **Rp 30.000** ➔ **1 MINGGU** *(Paket Populer)*\n' +
                    '• 🌟 **Rp 60.000** ➔ **1 BULAN** *(Paket Best Value)*\n' +
                    '• 👑 **Rp 100.000** ➔ **2 BULAN** *(Paket Sultan)*\n' +
                    '*Klik tombol di bawah untuk langsung DM Owner & aktivasi instant!*'
                ),
                inline: false
            }
        )
        .setFooter({
            text: `Klik tombol di bawah untuk langsung membuka profil / DM ke ${ownerName}`,
            iconURL: ownerAvatar || undefined
        })
        .setTimestamp();

    if (ownerAvatar) {
        embed.setThumbnail(ownerAvatar);
        embed.setAuthor({
            name: `${ownerName} (Owner Spoofer)`,
            iconURL: ownerAvatar,
            url: `https://discord.com/users/${OWNER_DISCORD_ID}`
        });
    }

    return interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });
}

async function sendVipOnlyReply(interaction) {
    let ownerUser = null;
    try {
        ownerUser = await client.users.fetch(OWNER_DISCORD_ID);
    } catch (e) {
        console.error('[Fetch Owner Error]', e);
    }

    const ownerName = ownerUser ? (ownerUser.globalName || ownerUser.username) : 'Owner';
    const ownerAvatar = ownerUser ? ownerUser.displayAvatarURL({ dynamic: true, size: 512 }) : null;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(`Chat / DM ${ownerName} (Beli Premium / VIP)`)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/users/${OWNER_DISCORD_ID}`)
            .setEmoji('💎')
    );

    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('⛔ FREE USER DILARANG PAKE!')
        .setDescription(
            `### ⚠️ FREE USER DILARANG PAKE SEGERA DM AKUN DISCORD INI UNTUK PREMIUM\n\n` +
            `Fitur **Game Sound/Dance Ripper** dan **Trending Assets Hub** merupakan fitur eksklusif khusus **Member VIP / Premium**.\n` +
            `Member gratis (Free User) tidak diizinkan menggunakan fitur ini.`
        )
        .addFields(
            {
                name: '👑 Hubungi Owner Untuk Beli VIP',
                value: `**Mention:** <@${OWNER_DISCORD_ID}>\n**Username:** \`${ownerName}\`\n**User ID:** \`${OWNER_DISCORD_ID}\``,
                inline: false
            },
            {
                name: '💎 Keuntungan Jadi Member VIP',
                value: (
                    '⚡ **Akses Fitur Game Sound Ripper** (Rip lagu Brookhaven, Da Hood, dll)\n' +
                    '🎬 **Akses Fitur Game Dance Ripper** (Rip animasi dance in-game)\n' +
                    '🔥 **Akses Trending Assets Hub** (1-klik spoof lagu & dance viral)\n' +
                    '♾️ **Unlimited Kuota Harian** (Bypass tanpa batas)\n' +
                    '🚀 **Prioritas Antrean #1 (Langsung diproses tanpa antre)**'
                ),
                inline: false
            },
            {
                name: '💎 Daftar Harga Paket VIP',
                value: (
                    '• ⚡ **Rp 15.000** ➔ **3 HARI** *(Paket Hemat)*\n' +
                    '• 📅 **Rp 30.000** ➔ **1 MINGGU** *(Paket Populer)*\n' +
                    '• 🌟 **Rp 60.000** ➔ **1 BULAN** *(Paket Best Value)*\n' +
                    '• 👑 **Rp 100.000** ➔ **2 BULAN** *(Paket Sultan)*\n' +
                    '*Klik tombol di bawah untuk langsung DM Owner & aktivasi instant!*'
                ),
                inline: false
            }
        )
        .setFooter({
            text: `Klik tombol di bawah untuk langsung membuka DM ke ${ownerName}`,
            iconURL: ownerAvatar || undefined
        })
        .setTimestamp();

    if (ownerAvatar) {
        embed.setThumbnail(ownerAvatar);
        embed.setAuthor({
            name: `${ownerName} (Owner Spoofer)`,
            iconURL: ownerAvatar,
            url: `https://discord.com/users/${OWNER_DISCORD_ID}`
        });
    }

    if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
}

// ==========================================
// CLIENT EVENTS
// ==========================================
client.once('ready', async () => {
    console.log(`[Discord] Bot online as ${client.user.tag}! (ID: ${client.user.id})`);
    await registerCommands(client.user.id);
    client.user.setActivity('/spoof | /setup', { type: 2 });
});

client.on('interactionCreate', async (interaction) => {
    // 1. Handle Modal Submission (Setup Roblox)
    if (interaction.isModalSubmit()) {
        // === Modal: Setup Akun Roblox (auto-detect User / Group — cek parallel) ===
        if (interaction.customId === 'modal_setup_user' || interaction.customId === 'modal_setup_roblox') {
            await interaction.deferReply({ ephemeral: true });

            const apiKey = interaction.fields.getTextInputValue('input_api_key').trim();
            const inputId = interaction.fields.getTextInputValue('input_user_id').trim();

            if (!/^\d+$/.test(inputId)) {
                return interaction.editReply({
                    content: '❌ **ID tidak valid!** Pastikan hanya angka. (Contoh User ID: `123456789` / Group ID: `1200769`)'
                });
            }

            // Cek KEDUANYA secara parallel sekaligus
            const [profile, group] = await Promise.all([
                fetchRobloxUser(inputId),
                fetchRobloxGroup(inputId)
            ]);

            const isUser  = !!(profile && profile.name);
            const isGroup = !!(group && group.name);

            // Kasus 1: Hanya ketemu sebagai User
            if (isUser && !isGroup) {
                let user = users.getUser(interaction.user.id) || users.createUser(interaction.user.id, interaction.user.tag);
                user.api_key = apiKey;
                user.user_id = inputId;
                user.roblox_username = profile.name;
                user.roblox_display_name = profile.displayName || profile.name;
                user.creator_type = 'User';
                user.group_id = null;
                user.group_name = null;
                users.saveUser(interaction.user.id, user);

                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('✅ AKUN ROBLOX BERHASIL TERHUBUNG')
                    .setDescription('Akun uploader Roblox kamu telah berhasil dikonfigurasi secara private.')
                    .addFields(
                        { name: '👤 Username', value: `[@${profile.name}](https://www.roblox.com/users/${inputId}/profile)`, inline: true },
                        { name: '🏷️ Display Name', value: profile.displayName || profile.name, inline: true },
                        { name: '🆔 User ID', value: `\`${inputId}\``, inline: true },
                        { name: '🔑 API Key', value: '`••••••••••••••••••` *(Tersimpan aman)*', inline: false },
                        { name: '💎 Status', value: user.role === 'vip' ? '🌟 **VIP (Unlimited)**' : `🆓 **Free** (Sisa Kuota: ${10 - user.quota.used}/10)`, inline: false }
                    )
                    .setFooter({ text: '👤 Akun Pribadi • Siap pakai /spoof' })
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Kasus 2: Hanya ketemu sebagai Group
            if (isGroup && !isUser) {
                const ownerName = group.owner ? (group.owner.username || group.owner.displayName || 'Unknown') : 'Unknown';
                let user = users.getUser(interaction.user.id) || users.createUser(interaction.user.id, interaction.user.tag);
                user.api_key = apiKey;
                user.user_id = inputId;
                user.group_id = inputId;
                user.group_name = group.name;
                user.roblox_username = group.name;
                user.roblox_display_name = group.name;
                user.creator_type = 'Group';
                users.saveUser(interaction.user.id, user);

                const embed = new EmbedBuilder()
                    .setColor('#9b59b6')
                    .setTitle('✅ KOMUNITAS / GROUP BERHASIL TERHUBUNG')
                    .setDescription('Group Roblox kamu telah berhasil dikonfigurasi sebagai akun uploader.')
                    .addFields(
                        { name: '👥 Nama Group', value: `[${group.name}](https://www.roblox.com/groups/${inputId})`, inline: true },
                        { name: '👑 Owner', value: ownerName, inline: true },
                        { name: '🆔 Group ID', value: `\`${inputId}\``, inline: true },
                        { name: '👥 Member', value: `${(group.memberCount || 0).toLocaleString()} orang`, inline: true },
                        { name: '🔑 API Key', value: '`••••••••••••••••••` *(Tersimpan aman)*', inline: false },
                        { name: '💎 Status', value: user.role === 'vip' ? '🌟 **VIP (Unlimited)**' : `🆓 **Free** (Sisa Kuota: ${10 - user.quota.used}/10)`, inline: false }
                    )
                    .setFooter({ text: '👥 Komunitas / Group • Semua upload & spoof pakai akun Group ini' })
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Kasus 3: ID match KEDUANYA (User & Group punya angka yang sama) → tanya user
            if (isUser && isGroup) {
                const setupSessId = 'setup_' + interaction.user.id + '_' + Date.now();
                pendingSetupSessions.set(setupSessId, {
                    apiKey,
                    inputId,
                    profile,
                    group,
                    discordId: interaction.user.id,
                    discordTag: interaction.user.tag
                });
                // Expire session setelah 5 menit
                setTimeout(() => pendingSetupSessions.delete(setupSessId), 5 * 60 * 1000);

                const ownerName = group.owner ? (group.owner.username || group.owner.displayName || 'Unknown') : 'Unknown';
                const embed = new EmbedBuilder()
                    .setColor('#f39c12')
                    .setTitle('⚠️ ID Ditemukan di Dua Tempat!')
                    .setDescription(
                        `ID \`${inputId}\` cocok dengan **Akun Pribadi** sekaligus **Group Roblox**.\n` +
                        `Pilih salah satu di bawah sesuai yang kamu maksud:`
                    )
                    .addFields(
                        { name: '👤 Akun Pribadi', value: `@${profile.name} (${profile.displayName || profile.name})`, inline: true },
                        { name: '👥 Group', value: `${group.name} • ${(group.memberCount || 0).toLocaleString()} member (Owner: ${ownerName})`, inline: true }
                    )
                    .setFooter({ text: 'Pilih tombol di bawah dalam 5 menit' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`setup_pick_user:${setupSessId}`)
                        .setLabel(`👤 Pakai Akun Pribadi (@${profile.name})`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`setup_pick_group:${setupSessId}`)
                        .setLabel(`👥 Pakai Group (${group.name})`)
                        .setStyle(ButtonStyle.Primary)
                );
                return interaction.editReply({ embeds: [embed], components: [row] });
            }

            // Kasus 4: Tidak ketemu sama sekali
            return interaction.editReply({
                content: '❌ **ID tidak ditemukan!** Pastikan ID yang kamu masukkan benar.\n• **Akun Pribadi** → masukkan **User ID** Roblox kamu\n• **Komunitas/Group** → masukkan **Group ID** komunitas kamu'
            });
        }

        // === Modal: Setup Group (legacy/langsung — customId lama) ===
        if (interaction.customId === 'modal_setup_group') {
            await interaction.deferReply({ ephemeral: true });
            const apiKey = interaction.fields.getTextInputValue('input_api_key').trim();
            const groupId = interaction.fields.getTextInputValue('input_group_id').trim();
            if (!/^\d+$/.test(groupId)) {
                return interaction.editReply({ content: '❌ **Group ID tidak valid!** Pastikan hanya angka.' });
            }
            const group = await fetchRobloxGroup(groupId);
            if (!group || !group.name) {
                return interaction.editReply({ content: '❌ **Gagal menemukan Group!** Periksa kembali Group ID kamu.' });
            }
            const ownerName = group.owner ? (group.owner.username || group.owner.displayName || 'Unknown') : 'Unknown';
            let user = users.getUser(interaction.user.id) || users.createUser(interaction.user.id, interaction.user.tag);
            user.api_key = apiKey;
            user.user_id = groupId;
            user.group_id = groupId;
            user.group_name = group.name;
            user.roblox_username = group.name;
            user.roblox_display_name = group.name;
            user.creator_type = 'Group';
            users.saveUser(interaction.user.id, user);
            const embed = new EmbedBuilder()
                .setColor('#9b59b6')
                .setTitle('✅ KOMUNITAS / GROUP BERHASIL TERHUBUNG')
                .addFields(
                    { name: '👥 Nama Group', value: `[${group.name}](https://www.roblox.com/groups/${groupId})`, inline: true },
                    { name: '👑 Owner', value: ownerName, inline: true },
                    { name: '🆔 Group ID', value: `\`${groupId}\``, inline: true },
                    { name: '🔑 API Key', value: '`••••••••••••••••••` *(Tersimpan aman)*', inline: false }
                )
                .setFooter({ text: '👥 Komunitas / Group • Siap pakai /spoof' })
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        return;
    }

    // 2. Handle Interactive Buttons & Select Menus (Spoof Type & Speed Bypass)
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const customId = interaction.customId;

        // === Setup Disambiguate: User pilih Akun Pribadi ===
        if (customId.startsWith('setup_pick_user:')) {
            const sessId = customId.split(':')[1];
            const sess = pendingSetupSessions.get(sessId);
            if (!sess) {
                return interaction.reply({ content: '⏰ Sesi sudah expired. Silakan jalankan `/setup` lagi.', ephemeral: true });
            }
            if (interaction.user.id !== sess.discordId) {
                return interaction.reply({ content: '⛔ Bukan sesimu.', ephemeral: true });
            }
            pendingSetupSessions.delete(sessId);

            let user = users.getUser(interaction.user.id) || users.createUser(interaction.user.id, interaction.user.tag);
            user.api_key = sess.apiKey;
            user.user_id = sess.inputId;
            user.roblox_username = sess.profile.name;
            user.roblox_display_name = sess.profile.displayName || sess.profile.name;
            user.creator_type = 'User';
            user.group_id = null;
            user.group_name = null;
            users.saveUser(interaction.user.id, user);

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ AKUN PRIBADI BERHASIL TERHUBUNG')
                .addFields(
                    { name: '👤 Username', value: `[@${sess.profile.name}](https://www.roblox.com/users/${sess.inputId}/profile)`, inline: true },
                    { name: '🏷️ Display Name', value: sess.profile.displayName || sess.profile.name, inline: true },
                    { name: '🆔 User ID', value: `\`${sess.inputId}\``, inline: true },
                    { name: '🔑 API Key', value: '`••••••••••••••••••` *(Tersimpan aman)*', inline: false },
                    { name: '💎 Status', value: user.role === 'vip' ? '🌟 **VIP (Unlimited)**' : `🆓 **Free** (Sisa Kuota: ${10 - user.quota.used}/10)`, inline: false }
                )
                .setFooter({ text: '👤 Akun Pribadi • Siap pakai /spoof' })
                .setTimestamp();
            return interaction.update({ embeds: [embed], components: [] });
        }

        // === Setup Disambiguate: User pilih Group ===
        if (customId.startsWith('setup_pick_group:')) {
            const sessId = customId.split(':')[1];
            const sess = pendingSetupSessions.get(sessId);
            if (!sess) {
                return interaction.reply({ content: '⏰ Sesi sudah expired. Silakan jalankan `/setup` lagi.', ephemeral: true });
            }
            if (interaction.user.id !== sess.discordId) {
                return interaction.reply({ content: '⛔ Bukan sesimu.', ephemeral: true });
            }
            pendingSetupSessions.delete(sessId);

            const ownerName = sess.group.owner ? (sess.group.owner.username || sess.group.owner.displayName || 'Unknown') : 'Unknown';
            let user = users.getUser(interaction.user.id) || users.createUser(interaction.user.id, interaction.user.tag);
            user.api_key = sess.apiKey;
            user.user_id = sess.inputId;
            user.group_id = sess.inputId;
            user.group_name = sess.group.name;
            user.roblox_username = sess.group.name;
            user.roblox_display_name = sess.group.name;
            user.creator_type = 'Group';
            users.saveUser(interaction.user.id, user);

            const embed = new EmbedBuilder()
                .setColor('#9b59b6')
                .setTitle('✅ KOMUNITAS / GROUP BERHASIL TERHUBUNG')
                .addFields(
                    { name: '👥 Nama Group', value: `[${sess.group.name}](https://www.roblox.com/groups/${sess.inputId})`, inline: true },
                    { name: '👑 Owner', value: ownerName, inline: true },
                    { name: '🆔 Group ID', value: `\`${sess.inputId}\``, inline: true },
                    { name: '👥 Member', value: `${(sess.group.memberCount || 0).toLocaleString()} orang`, inline: true },
                    { name: '🔑 API Key', value: '`••••••••••••••••••` *(Tersimpan aman)*', inline: false },
                    { name: '💎 Status', value: user.role === 'vip' ? '🌟 **VIP (Unlimited)**' : `🆓 **Free** (Sisa Kuota: ${10 - user.quota.used}/10)`, inline: false }
                )
                .setFooter({ text: '👥 Komunitas / Group • Semua upload & spoof pakai akun Group ini' })
                .setTimestamp();
            return interaction.update({ embeds: [embed], components: [] });
        }

        // A. Pilihan Tipe Aset (/spoof)
        if (customId.startsWith('type_btn:') || customId.startsWith('type_select:')) {
            let assetType = '';
            let sessionId = '';
            if (interaction.isButton()) {
                const parts = customId.split(':');
                assetType = parts[1];
                sessionId = parts[2];
            } else {
                assetType = interaction.values[0];
                sessionId = customId.split(':')[1];
            }

            const session = pendingSessions.get(sessionId);
            if (!session) {
                return interaction.reply({ content: '⚠️ Sesi ini telah kedaluwarsa. Silakan ketik ulang perintah.', ephemeral: true });
            }
            if (interaction.user.id !== session.discordId) {
                return interaction.reply({ content: '⛔ Hanya pengguna yang menjalankan perintah ini yang dapat memilih.', ephemeral: true });
            }

            if (assetType === 'audio') {
                session.type = 'audio';
                const speedUI = buildSpeedUI(sessionId, `Asset ID: \`${session.ids.join(', ')}\` (Audio)`);
                return interaction.update(speedUI);
            } else {
                session.type = assetType;
                return executeSpoofTask(interaction, session, '1.0', assetType);
            }
        }

        // B. Pilihan Speed & Pitch Bypass (/ytupload atau /spoof Audio)
        if (customId.startsWith('speed_btn:') || customId.startsWith('speed_select:')) {
            let speedVal = '1.5';
            let sessionId = '';
            if (interaction.isButton()) {
                const parts = customId.split(':');
                speedVal = parts[1];
                sessionId = parts[2];
            } else {
                speedVal = interaction.values[0];
                sessionId = customId.split(':')[1];
            }

            const session = pendingSessions.get(sessionId);
            if (!session) {
                return interaction.reply({ content: '⚠️ Sesi ini telah kedaluwarsa. Silakan ketik ulang perintah.', ephemeral: true });
            }
            if (interaction.user.id !== session.discordId) {
                return interaction.reply({ content: '⛔ Hanya pengguna yang menjalankan perintah ini yang dapat memilih.', ephemeral: true });
            }

            if (session.isYT) {
                return executeYTUploadTask(interaction, session, speedVal);
            } else {
                return executeSpoofTask(interaction, session, speedVal, 'audio');
            }
        }

        // C. Spoof dari Game Sound/Dance Ripper
        if (customId.startsWith('btn_rip_spoof:')) {
            const sessionId = customId.split(':')[1];
            const session = pendingSessions.get(sessionId);
            if (!session) {
                return interaction.reply({ content: '⚠️ Sesi ini telah kedaluwarsa. Silakan ketik ulang perintah.', ephemeral: true });
            }
            if (interaction.user.id !== session.discordId) {
                return interaction.reply({ content: '⛔ Hanya pengguna yang menjalankan perintah ini yang dapat memilih.', ephemeral: true });
            }

            const check = users.canUse(interaction.user.id);
            if (check.role !== 'vip') {
                return sendVipOnlyReply(interaction);
            }
            if (!check.ok) {
                if (check.reason === 'no_account' || check.reason === 'not_registered') {
                    return interaction.reply({ content: '⚠️ Kamu belum menghubungkan akun Roblox uploader! Ketik `/setup` dulu.', ephemeral: true });
                }
                if (check.reason === 'quota_habis') return sendQuotaExceededReply(interaction);
                if (check.reason === 'banned') return interaction.reply({ content: '🚫 Akun diblokir.', ephemeral: true });
            }

            session.userObj = check.user;
            session.isVip = true;

            if (session.type === 'audio') {
                const speedUI = buildSpeedUI(sessionId, `Rip dari Game (Total: ${session.ids.length} Audio)`);
                return interaction.update(speedUI);
            } else {
                return executeSpoofTask(interaction, session, '1.0', 'animation');
            }
        }

        // D. Salin ID dari Game Ripper (VIP ONLY)
        if (customId.startsWith('btn_rip_copy:')) {
            const sessionId = customId.split(':')[1];
            const session = pendingSessions.get(sessionId);
            if (!session || !session.ids) {
                return interaction.reply({ content: '⚠️ Sesi tidak ditemukan.', ephemeral: true });
            }
            if (interaction.user.id !== session.discordId) {
                return interaction.reply({ content: '⛔ Hanya pengguna yang menjalankan perintah ini yang dapat memilih.', ephemeral: true });
            }

            // VIP check — fitur salin ID juga eksklusif VIP
            const checkCopy = users.canUse(interaction.user.id);
            if (checkCopy.role !== 'vip') {
                return sendVipOnlyReply(interaction);
            }

            const rawList = session.ids.join(', ');
            if (rawList.length <= 1900) {
                return interaction.reply({
                    content: `📋 **Daftar ID (${session.type}) - Total ${session.ids.length} ID:**\n\`\`\`\n${rawList}\n\`\`\``,
                    ephemeral: true
                });
            } else {
                const attach = new AttachmentBuilder(Buffer.from(rawList, 'utf-8'), {
                    name: `daftar_id_${session.type}.txt`
                });
                return interaction.reply({
                    content: `📋 **Daftar ID (${session.type}) - Total ${session.ids.length} ID:**\nFile teks daftar ID terlampir:`,
                    files: [attach],
                    ephemeral: true
                });
            }
        }

        // E. Spoof dari Trending Hub
        if (customId.startsWith('btn_trending_spoof:')) {
            const sessionId = customId.split(':')[1];
            const session = pendingSessions.get(sessionId);
            if (!session) {
                return interaction.reply({ content: '⚠️ Sesi ini telah kedaluwarsa. Silakan ketik ulang perintah.', ephemeral: true });
            }
            if (interaction.user.id !== session.discordId) {
                return interaction.reply({ content: '⛔ Hanya pengguna yang menjalankan perintah ini yang dapat memilih.', ephemeral: true });
            }

            const check = users.canUse(interaction.user.id);
            if (check.role !== 'vip') {
                return sendVipOnlyReply(interaction);
            }
            if (!check.ok) {
                if (check.reason === 'no_account' || check.reason === 'not_registered') {
                    return interaction.reply({ content: '⚠️ Kamu belum menghubungkan akun Roblox uploader! Ketik `/setup` dulu.', ephemeral: true });
                }
                if (check.reason === 'quota_habis') return sendQuotaExceededReply(interaction);
                if (check.reason === 'banned') return interaction.reply({ content: '🚫 Akun diblokir.', ephemeral: true });
            }

            session.userObj = check.user;
            session.isVip = true;

            if (session.type === 'audio') {
                const speedUI = buildSpeedUI(sessionId, `Trending Roblox (Total: ${session.ids.length} Audio)`);
                return interaction.update(speedUI);
            } else {
                return executeSpoofTask(interaction, session, '1.0', 'animation');
            }
        }
        return;
    }

    // 3. Handle Slash Commands
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const discordId = interaction.user.id;

    // === /setup ===
    if (commandName === 'setup') {
        return interaction.showModal(buildUserSetupModal());
    }

    // === /status ===
    if (commandName === 'status') {
        const user = users.getUser(discordId);
        if (!user || !user.api_key) {
            return interaction.reply({
                content: '⚠️ **Kamu belum menghubungkan akun Roblox!**\nGunakan `/setup` untuk menghubungkan akun secara private.',
                ephemeral: true
            });
        }

        const isVip = user.role === 'vip';
        const isGroup = user.creator_type === 'Group';
        const sisa = isVip ? 'Unlimited' : `${Math.max(0, user.quota.limit - user.quota.used)}/${user.quota.limit}`;

        const robloxLabel = isGroup
            ? `[👥 ${user.group_name || user.roblox_username}](https://www.roblox.com/groups/${user.group_id})`
            : `[@${user.roblox_username || '-'}](https://www.roblox.com/users/${user.user_id}/profile)`;

        const idLabel = isGroup
            ? `Group ID: \`${user.group_id}\``
            : `User ID: \`${user.user_id}\``;

        const tipeLabel = isGroup ? '👥 **Komunitas / Group**' : '👤 **Akun Pribadi**';

        const embed = new EmbedBuilder()
            .setColor(isVip ? '#f1c40f' : '#3498db')
            .setTitle('📊 STATUS AKUN SPOOFER')
            .addFields(
                { name: isGroup ? '👥 Group Roblox' : '👤 Akun Roblox', value: robloxLabel, inline: true },
                { name: '🔗 Tipe Akun', value: tipeLabel, inline: true },
                { name: '🆔 ID', value: idLabel, inline: true },
                { name: '💎 Role', value: isVip ? '🌟 **VIP Member**' : '🆓 **Free User**', inline: true },
                { name: '⚡ Sisa Kuota Harian', value: `\`${sisa}\``, inline: true },
                { name: '⏳ Masa Aktif VIP', value: isVip && user.vip_until ? `<t:${Math.floor(new Date(user.vip_until).getTime() / 1000)}:R>` : 'Tidak Aktif', inline: true }
            )
            .setFooter({ text: 'Roblox Spoofer Bot v2.0' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // === /tutorial ===
    if (commandName === 'tutorial') {
        let ownerUser = null;
        try {
            ownerUser = await client.users.fetch(OWNER_DISCORD_ID);
        } catch {}
        const ownerName = ownerUser ? (ownerUser.globalName || ownerUser.username) : 'Owner';
        const ownerAvatar = ownerUser ? ownerUser.displayAvatarURL({ dynamic: true, size: 256 }) : null;

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('📖 PANDUAN PENGGUNAAN DISCORD ROBLOX SPOOFER')
            .setDescription('Berikut panduan lengkap langkah demi langkah menggunakan bot Roblox Spoofer:')
            .addFields(
                {
                    name: '1️⃣ Setup Akun Roblox (/setup)',
                    value: (
                        '• Ketik perintah `/setup` di channel mana saja.\n' +
                        '• Akan muncul jendela formulir **Private / Rahasia** (hanya kamu yang bisa melihat).\n' +
                        '• Masukkan **Roblox Open Cloud API Key** dan **Roblox User ID** akun uploader kamu.\n' +
                        '• Bot otomatis memvalidasi ke Roblox dan menyimpan kredensial kamu dengan aman.'
                    )
                },
                {
                    name: '2️⃣ Cara Membuat API Key di Roblox Creator Hub (Cukup 1 API Key)',
                    value: (
                        '1. Buka browser: **[create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials)**\n' +
                        '2. Login dengan akun Roblox uploader kamu.\n' +
                        '3. Klik tombol biru **`Create API Key`** di pojok kanan atas.\n' +
                        '4. Beri nama API Key (contoh: `RobloxSpoofer`).\n' +
                        '5. Pada bagian **Access Permissions** (Aktifkan 2 Izin ini):\n' +
                        '   • **Assets** -> Centang izin **`Read`** dan **`Write`**\n' +
                        '   • **Asset Permissions** -> Centang izin **`Write`**\n' +
                        '   *(Izin Asset Permissions Write wajib aktif agar animasi/dance otomatis diaktifkan dan bisa dimainkan di game!)*\n' +
                        '6. Pada bagian **IP Restrictions**:\n' +
                        '   • Pilih **`Allow all IP addresses`** (0.0.0.0/0) agar tidak terblokir IP.\n' +
                        '7. Klik **`Save & Generate Key`** lalu salin kodenya ke `/setup`.'
                    )
                },
                {
                    name: '3️⃣ Cara Spoof / Bypass Asset Roblox (/spoof)',
                    value: (
                        '• Ketik perintah `/spoof` dan masukkan Asset ID Roblox (bisa multi ID pisah koma/spasi).\n' +
                        '• Bot membalas di channel publik dengan pilihan tipe: `[1] Audio`, `[2] Animasi`, atau `[3] Decal`.\n' +
                        '• **Jika pilih Animasi**: Bot otomatis menembak engine API Key Asset Permissions Write agar animasi/dance jalan lancar di game.\n' +
                        '• **Jika pilih Audio**: Bot memunculkan menu box speed bypass (1.0x s/d 3.0x).'
                    )
                },
                {
                    name: '4️⃣ Cara Upload Audio dari YouTube (/ytupload)',
                    value: (
                        '• Ketik perintah `/ytupload`.\n' +
                        '• Masukkan link video YouTube (misal: `https://www.youtube.com/watch?v=...` atau `https://youtu.be/...`).\n' +
                        '• Pilih opsi **Speed** bypass audio.\n' +
                        '• Bot akan otomatis mengunduh audio kualitas studio 320kbps dan langsung mengunggahnya ke akun Roblox kamu.'
                    )
                },
                {
                    name: '5️⃣ Cek Status & Kuota (/status)',
                    value: (
                        '• Ketik `/status` untuk melihat sisa kuota harian kamu, status role (Free / VIP), dan masa aktif VIP.'
                    )
                }
            )
            .setFooter({
                text: `Roblox Spoofer Bot • Hubungi Owner (${ownerName}) untuk aktivasi VIP`,
                iconURL: ownerAvatar || undefined
            })
            .setTimestamp();

        if (ownerAvatar) {
            embed.setThumbnail(ownerAvatar);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Buka Creator Hub Roblox')
                .setStyle(ButtonStyle.Link)
                .setURL('https://create.roblox.com/dashboard/credentials')
                .setEmoji('🔗'),
            new ButtonBuilder()
                .setLabel(`Chat Owner (${ownerName})`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${OWNER_DISCORD_ID}`)
                .setEmoji('💎')
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // === /hapusakun ===
    if (commandName === 'hapusakun') {
        let user = users.getUser(discordId);
        if (!user || !user.api_key) {
            return interaction.reply({ content: 'Kamu belum menghubungkan akun apapun.', ephemeral: true });
        }
        user.api_key = null;
        user.user_id = null;
        user.roblox_username = null;
        users.saveUser(discordId, user);
        return interaction.reply({ content: '✅ **Akun Roblox uploader kamu berhasil diputuskan dari bot!**', ephemeral: true });
    }

    // === /spoof ===
    if (commandName === 'spoof') {
        const check = users.canUse(discordId);
        if (!check.ok) {
            if (check.reason === 'no_account' || check.reason === 'not_registered') {
                return interaction.reply({
                    content: '⚠️ **Kamu belum menghubungkan akun Roblox uploader!**\nGunakan perintah `/setup` terlebih dahulu.',
                    ephemeral: true
                });
            }
            if (check.reason === 'quota_habis') {
                return sendQuotaExceededReply(interaction);
            }
            if (check.reason === 'banned') {
                return interaction.reply({ content: '🚫 Akun kamu diblokir dari bot ini.', ephemeral: true });
            }
        }

        const rawIds = interaction.options.getString('asset_id');
        const ids = rawIds.split(/[\r\n,\s]+/).map(x => x.trim()).filter(x => /^\d+$/.test(x));
        if (!ids.length) {
            return interaction.reply({ content: '❌ **Format Asset ID tidak valid!** Masukkan angka ID yang benar.', ephemeral: true });
        }

        const isVip = check.role === 'vip';
        const userObj = check.user;
        const sessionId = 'sp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        pendingSessions.set(sessionId, {
            discordId,
            ids,
            userObj,
            isVip,
            isYT: false
        });

        // Balas secara PUBLIK dengan pilihan tipe aset
        const typeUI = buildSpoofTypeUI(sessionId, ids);
        return interaction.reply(typeUI);
    }

    // === /ytupload ===
    if (commandName === 'ytupload') {
        const check = users.canUse(discordId);
        if (!check.ok) {
            if (check.reason === 'no_account' || check.reason === 'not_registered') {
                return interaction.reply({
                    content: '⚠️ **Kamu belum menghubungkan akun Roblox uploader!**\nGunakan `/setup` terlebih dahulu.',
                    ephemeral: true
                });
            }
            if (check.reason === 'quota_habis') {
                return sendQuotaExceededReply(interaction);
            }
            if (check.reason === 'banned') {
                return interaction.reply({ content: '🚫 Akun kamu diblokir.', ephemeral: true });
            }
        }

        const rawUrls = interaction.options.getString('url');
        const isVip = check.role === 'vip';
        const userObj = check.user;

        // Pisahkan multi link YouTube jika dipisah koma, spasi, atau enter
        const urls = rawUrls
            .split(/[\r\n,\s]+/)
            .map(x => x.trim())
            .filter(x => x.length > 5 && (x.startsWith('http://') || x.startsWith('https://') || x.includes('youtube.com') || x.includes('youtu.be')));

        if (!urls.length) {
            return interaction.reply({
                content: '❌ **Link YouTube tidak valid!** Masukkan URL YouTube yang benar (contoh: `https://youtu.be/...`).',
                ephemeral: true
            });
        }

        const sessionId = 'yt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        pendingSessions.set(sessionId, {
            discordId,
            urls,
            userObj,
            isVip,
            isYT: true
        });

        // Balas secara PUBLIK dengan pilihan speed & pitch bypass
        const speedUI = buildSpeedUI(sessionId, `Link YouTube: \`${urls.join(', ')}\``);
        return interaction.reply(speedUI);
    }

    // === /gamesoundriperaudio ===
    if (commandName === 'gamesoundriperaudio') {
        const check = users.canUse(discordId);
        if (check.role !== 'vip') {
            return sendVipOnlyReply(interaction);
        }

        const rawGame = interaction.options.getString('game');
        const jumlahOpt = interaction.options.getInteger('jumlah');
        const placeId = parsePlaceId(rawGame);
        if (!placeId) {
            return interaction.reply({
                content: '❌ **Link game atau Place ID tidak valid!** Masukkan link game Roblox atau Place ID yang benar (contoh: `https://roblox.com/games/4924922222` atau `4924922222`).',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const result = await ripGame(placeId, 'audio', jumlahOpt);
        if (!result.success) {
            return interaction.editReply({ content: `❌ ${result.error}` });
        }

        const sessionId = 'rip_aud_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        pendingSessions.set(sessionId, {
            discordId,
            ids: result.assets.map(a => a.id),
            type: 'audio',
            sourcePlaceId: placeId,
            isYT: false
        });

        let listText = '';
        const previewLimit = Math.min(15, result.assets.length);
        for (let i = 0; i < previewLimit; i++) {
            const a = result.assets[i];
            listText += `${i + 1}. **${a.name}** | ID: \`${a.id}\`\n`;
        }
        if (result.assets.length > previewLimit) {
            listText += `\n_...dan **${result.assets.length - previewLimit}** lagu lainnya terlampir di file txt!_`;
        }

        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`🎵 GAME SOUND RIPPER — ${result.game.name}`)
            .setDescription(
                `🎮 **Game:** [${result.game.name}](https://www.roblox.com/games/${placeId})\n` +
                `👤 **Creator:** \`${result.game.creator}\`\n` +
                `🆔 **Place ID:** \`${placeId}\`\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Ditemukan **${result.assets.length} Sound ID** musik di game ini:\n\n` +
                listText
            )
            .setFooter({ text: 'Klik tombol hijau di bawah untuk langsung spoof semua lagu ini ke akun Roblox kamu!' })
            .setTimestamp();

        if (result.game.iconUrl) embed.setThumbnail(result.game.iconUrl);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_rip_spoof:${sessionId}`)
                .setLabel(`⚡ Spoof Semua Sound Game Ini (${result.assets.length} Lagu)`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`btn_rip_copy:${sessionId}`)
                .setLabel(`📋 Salin Semua ID (${result.assets.length})`)
                .setStyle(ButtonStyle.Secondary)
        );

        const replyPayload = { embeds: [embed], components: [row] };
        if (result.assets.length > 15) {
            const fullTxt = result.assets.map((a, idx) => `${idx + 1}. ${a.name} | ID: ${a.id}`).join('\n');
            replyPayload.files = [
                new AttachmentBuilder(Buffer.from(fullTxt, 'utf-8'), { name: `playlist_${placeId}.txt` })
            ];
        }

        return interaction.editReply(replyPayload);
    }

    // === /gamesoundriperdance ===
    if (commandName === 'gamesoundriperdance') {
        const check = users.canUse(discordId);
        if (check.role !== 'vip') {
            return sendVipOnlyReply(interaction);
        }

        const rawGame = interaction.options.getString('game');
        const placeId = parsePlaceId(rawGame);
        if (!placeId) {
            return interaction.reply({
                content: '❌ **Link game atau Place ID tidak valid!** Masukkan link game Roblox atau Place ID yang benar.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const result = await ripGame(placeId, 'dance');
        if (!result.success) {
            return interaction.editReply({ content: `❌ ${result.error}` });
        }

        const sessionId = 'rip_dnc_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        pendingSessions.set(sessionId, {
            discordId,
            ids: result.assets.map(a => a.id),
            type: 'animation',
            sourcePlaceId: placeId,
            isYT: false
        });

        let listText = '';
        for (let i = 0; i < result.assets.length; i++) {
            const a = result.assets[i];
            listText += `${i + 1}. **${a.name}** | ID: \`${a.id}\`\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle(`🎬 GAME DANCE RIPPER — ${result.game.name}`)
            .setDescription(
                `🎮 **Game:** [${result.game.name}](https://www.roblox.com/games/${placeId})\n` +
                `👤 **Creator:** \`${result.game.creator}\`\n` +
                `🆔 **Place ID:** \`${placeId}\`\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Ditemukan **${result.assets.length} Animation / Dance ID** di game ini:\n\n` +
                listText
            )
            .setFooter({ text: 'Klik tombol di bawah untuk langsung spoof semua dance & aktifkan permissions write!' })
            .setTimestamp();

        if (result.game.iconUrl) embed.setThumbnail(result.game.iconUrl);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_rip_spoof:${sessionId}`)
                .setLabel(`⚡ Spoof Semua Dance Game Ini (${result.assets.length})`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`btn_rip_copy:${sessionId}`)
                .setLabel('📋 Salin ID')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // === /trending ===
    if (commandName === 'trending') {
        const check = users.canUse(discordId);
        if (check.role !== 'vip') {
            return sendVipOnlyReply(interaction);
        }

        const kategori = interaction.options.getString('kategori') || 'audio';
        const data = getTrending(kategori);

        const sessionId = 'trd_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        pendingSessions.set(sessionId, {
            discordId,
            ids: data.assets.map(a => a.id),
            type: kategori === 'dance' ? 'animation' : 'audio',
            isYT: false
        });

        let listText = '';
        for (let i = 0; i < data.assets.length; i++) {
            const a = data.assets[i];
            const creator = a.creator ? ` | Creator: ${a.creator}` : '';
            listText += `${i + 1}. **${a.name}** | ID: \`${a.id}\`${creator}\n`;
        }

        const isAudio = kategori === 'audio';
        const embed = new EmbedBuilder()
            .setColor(isAudio ? '#e67e22' : '#9b59b6')
            .setTitle(`🔥 TOP TRENDING ROBLOX ${kategori.toUpperCase()} (VIRAL 2026)`)
            .setDescription(
                `Berikut daftar **${data.assets.length} aset ${kategori.toUpperCase()}** yang paling sering dipakai di game top Roblox saat ini:\n\n` +
                listText + '\n' +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `*Klik tombol hijau di bawah untuk langsung mem-bypass semua ${kategori} ini ke akun Roblox kamu dalam 1 klik!*`
            )
            .setFooter({ text: 'Trending Roblox Assets Hub • Auto Updated' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_trending_spoof:${sessionId}`)
                .setLabel(`⚡ Spoof Semua Trending ${isAudio ? 'Audio' : 'Dance'} Ini`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`btn_rip_copy:${sessionId}`)
                .setLabel('📋 Salin Semua ID')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    }

    // === /addvip (Owner Only) ===
    if (commandName === 'addvip') {
        if (discordId !== OWNER_DISCORD_ID) {
            return interaction.reply({
                content: '⛔ **Akses Ditolak!** Perintah ini khusus untuk Owner bot.',
                ephemeral: true
            });
        }
        const targetUser = interaction.options.getUser('user');
        const durasi = interaction.options.getInteger('durasi') || 3;
        const updated = users.addVIP(targetUser.id, durasi);

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('👑 VIP BERHASIL DIAKTIFKAN!')
            .setDescription(`Berhasil memberikan role **VIP Member** kepada <@${targetUser.id}>.`)
            .addFields(
                { name: '👤 User', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                { name: '⏳ Durasi', value: `**${durasi} Hari**`, inline: true },
                { name: '📅 Masa Aktif S/D', value: `<t:${Math.floor(new Date(updated.vip_until).getTime() / 1000)}:F>`, inline: false }
            )
            .setFooter({ text: 'Aktivasi VIP Berhasil • Status VIP Aktif' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    // === /removevip (Owner Only) ===
    if (commandName === 'removevip') {
        if (discordId !== OWNER_DISCORD_ID) {
            return interaction.reply({
                content: '⛔ **Akses Ditolak!** Perintah ini khusus untuk Owner bot.',
                ephemeral: true
            });
        }
        const targetUser = interaction.options.getUser('user');
        users.removeVIP(targetUser.id);

        return interaction.reply({
            content: `✅ Status VIP untuk <@${targetUser.id}> (\`${targetUser.id}\`) telah berhasil dicabut.`,
            ephemeral: true
        });
    }

    // === /vip (Price List VIP) ===
    if (commandName === 'vip') {
        let ownerUser = null;
        try {
            ownerUser = await client.users.fetch(OWNER_DISCORD_ID);
        } catch {}
        const ownerName = ownerUser ? (ownerUser.globalName || ownerUser.username) : 'Owner';
        const ownerAvatar = ownerUser ? ownerUser.displayAvatarURL({ dynamic: true, size: 512 }) : null;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`💬 Chat / DM ${ownerName} (Beli VIP)`)
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${OWNER_DISCORD_ID}`)
                .setEmoji('💎')
        );

        const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('👑 DAFTAR HARGA & PAKET VIP SPOOFER BOT')
            .setDescription(
                `Dapatkan akses tanpa batas ke semua fitur eksklusif bot spoofer Roblox!\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `### 💎 PRICE LIST RESMI VIP:\n` +
                `• ⚡ **Rp 15.000** ➔ **3 HARI** *(Paket Hemat / Trial)*\n` +
                `• 📅 **Rp 30.000** ➔ **1 MINGGU** *(Paket Populer)*\n` +
                `• 🌟 **Rp 60.000** ➔ **1 BULAN** *(Paket Best Seller)*\n` +
                `• 👑 **Rp 100.000** ➔ **2 BULAN** *(Paket Sultan Hemat)*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `### 🚀 KEUNTUNGAN MEMBER VIP:\n` +
                `✅ **Unlimited Kuota Harian** (Bypass & upload tanpa batas harian)\n` +
                `✅ **Game Sound Ripper** (\`/gamesoundriperaudio\` hingga 100 lagu per game)\n` +
                `✅ **Game Dance Ripper** (\`/gamesoundriperdance\` rip 23+ animasi dance & emote)\n` +
                `✅ **Trending Assets Hub** (\`/trending\` 1-klik spoof lagu & dance viral)\n` +
                `✅ **Audio Permission Granter** (\`/grantmusic\` unlock semua lagu ke game orang lain)\n` +
                `✅ **Prioritas Antrean #1** (Langsung diproses tanpa antre)\n` +
                `✅ **High-Quality 320kbps YouTube Uploader**\n\n` +
                `💳 **Metode Pembayaran:**\n` +
                `\`DANA / GoPay / OVO / ShopeePay / QRIS / Bank Transfer\``
            )
            .addFields({
                name: '👑 Akun Resmi Owner Untuk Transaksi',
                value: `**Mention:** <@${OWNER_DISCORD_ID}>\n**Username:** \`${ownerName}\`\n**User ID:** \`${OWNER_DISCORD_ID}\``,
                inline: false
            })
            .setFooter({
                text: `Klik tombol di bawah untuk langsung membuka chat/DM ke ${ownerName}`,
                iconURL: ownerAvatar || undefined
            })
            .setTimestamp();

        if (ownerAvatar) {
            embed.setThumbnail(ownerAvatar);
            embed.setAuthor({
                name: `${ownerName} (Official Spoofer Owner)`,
                iconURL: ownerAvatar,
                url: `https://discord.com/users/${OWNER_DISCORD_ID}`
            });
        }

        return interaction.reply({ embeds: [embed], components: [row] });
    }

    // === /grantmusic (Khusus VIP) ===
    if (commandName === 'grantmusic') {
        const check = users.canUse(discordId);
        if (check.role !== 'vip') {
            return sendVipOnlyReply(interaction);
        }
        if (!check.ok) {
            if (check.reason === 'no_account' || check.reason === 'not_registered') {
                return interaction.reply({
                    content: '⚠️ **Kamu belum menghubungkan akun Roblox uploader!**\nGunakan `/setup` terlebih dahulu.',
                    ephemeral: true
                });
            }
            if (check.reason === 'banned') {
                return interaction.reply({ content: '🚫 Akun kamu diblokir.', ephemeral: true });
            }
        }

        const rawGame = interaction.options.getString('game');
        const rawAssetId = interaction.options.getString('asset_id');
        const userObj = check.user;

        const placeId = parsePlaceId(rawGame);
        if (!placeId) {
            return interaction.reply({
                content: '❌ **Link game atau Place ID tidak valid!** Masukkan link game Roblox atau Place ID target (contoh: `https://roblox.com/games/4924922222` atau `4924922222`).',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const game = await getGameDetails(placeId);
            if (!game || !game.universeId) {
                return interaction.editReply({
                    content: '❌ **Gagal menemukan game Roblox tersebut!** Pastikan game publik dan Place ID benar.'
                });
            }

            let targetIds = [];
            let isAll = false;

            if (rawAssetId && rawAssetId.trim().toLowerCase() !== 'all') {
                const matches = rawAssetId.match(/\b\d{5,16}\b/g);
                if (matches && matches.length > 0) {
                    targetIds = [...new Set(matches)];
                }
            }

            // Jika tidak memasukkan asset_id atau mengetik "all", scan SEMUA lagu akun user di Creator Hub
            if (targetIds.length === 0) {
                isAll = true;
                targetIds = await fetchUserAllAudios(userObj.user_id, 100, userObj.creator_type || 'User');
            }

            if (targetIds.length === 0) {
                return interaction.editReply({
                    content: `⚠️ **Tidak ada lagu yang ditemukan di akun Roblox kamu!**\nPastikan kamu sudah pernah meng-upload audio ke akun \`@${userObj.roblox_username}\`, atau masukkan ID lagu spesifik di opsi \`asset_id\`.`
                });
            }

            const permRes = await grantAudioPermissions(userObj.api_key, game.universeId, targetIds);
            if (!permRes.success) {
                return interaction.editReply({
                    content: `❌ **Gagal memberikan izin:**\n${permRes.error}`
                });
            }

            const previewList = targetIds.slice(0, 10).map(id => `• \`${id}\``).join('  ');
            const moreText = targetIds.length > 10 ? `\n_...dan **${targetIds.length - 10}** lagu lainnya_` : '';

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('🔊 IZIN AUDIO ROBLOX BERHASIL DIBERIKAN!')
                .setDescription(
                    `Semua audio yang dipilih sekarang **sudah sah & diizinkan** untuk diputar di game target tanpa error permission!\n\n` +
                    `🎮 **Game Target:** [${game.name}](https://www.roblox.com/games/${placeId})\n` +
                    `👤 **Developer Game:** \`${game.creator}\`\n` +
                    `🆔 **Universe ID:** \`${game.universeId}\`  |  **Place ID:** \`${placeId}\`\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🎵 **Total Audio Diizinkan:** **${permRes.totalSuccess} Lagu** ${isAll ? `(Semua Lagu di ${userObj.creator_type === 'Group' ? `Group ${userObj.roblox_username}` : `Akun @${userObj.roblox_username}`})` : ''}\n` +
                    `📋 **Daftar ID Audio:**\n${previewList}${moreText}\n\n` +
                    `⚡ **Status In-Game:** **100% Aktif** (Lagu langsung bisa dibunyikan in-game/boombox/script)`
                )
                .setFooter({ text: `${userObj.creator_type === 'Group' ? '👥 Group' : '👤 Akun'}: ${userObj.roblox_username} • Fitur Eksklusif VIP` })
                .setTimestamp();

            if (game.iconUrl) embed.setThumbnail(game.iconUrl);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('[GRANTMUSIC ERROR]', err);
            return interaction.editReply({
                content: `❌ **Terjadi kesalahan saat memproses /grantmusic:**\n\`${err.message || err}\``
            });
        }
    }
});

client.login(BOT_TOKEN);
