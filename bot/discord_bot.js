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
    StringSelectMenuOptionBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const users = require('./users');
const { runSpoof, runYTUpload } = require('./spoofer');

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
        .setDescription('Hubungkan akun Roblox (API Key & User ID) secara aman & private'),

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
        .setDescription('Putuskan koneksi akun Roblox uploader kamu dari bot')
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

const OWNER_DISCORD_ID = '1309112913331748915';
const pendingSessions = new Map();

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
                        const creator = r.creator ? ` creator ${r.creator}` : '';
                        desc += `• hasil spoof name \`${r.name || 'Asset'}\` id \`${r.new_id}\`${creator}\n`;
                    } else {
                        desc += `• ❌ \`${r.id}\`: ${r.error || 'Gagal'}\n`;
                    }
                }
                if (allResults.length > 5) desc += `_...dan ${allResults.length - 5} lainnya_\n`;
            }
            return new EmbedBuilder()
                .setColor('#f39c12')
                .setTitle(`⚙️ MEMPROSES SPOOF... (${done}/${total})`)
                .setDescription(desc)
                .setFooter({ text: `Akun: @${userObj.roblox_username} | Speed: ${WORKERS}x Paralel` })
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
                const chunkResults = await runSpoof(chunk, userObj.api_key, userObj.user_id, speedVal, assetType, WORKERS);
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

            // Bangun hasil final compact: 1 pesan, 1 baris per ID sesuai permintaan user
            let successCount = 0;
            const lines = [];
            for (const item of allResults) {
                if (item.ok && item.new_id) {
                    successCount++;
                    const creatorPart = (item.creator && String(item.creator).trim()) ? ` creator ${item.creator}` : '';
                    lines.push(`hasil spoof name ${item.name || 'Asset'} id ${item.new_id}${creatorPart}`);
                } else {
                    lines.push(`❌ gagal id ${item.id} (${item.name || 'Unknown'}): ${item.error || 'Gagal diproses'}`);
                }
            }

            const okCount = allResults.filter(r => r.ok).length;
            const failCount = allResults.length - okCount;
            const summary = `Berhasil: **${okCount}** | Gagal: **${failCount}** | Total: **${allResults.length}**`;
            const listText = lines.join('\n');
            const description = summary + '\n' + '─'.repeat(32) + '\n' + listText;

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

            // Kirim listText di content (jika muat <= 1900 karakter) agar user bisa langsung 1-klik copy tanpa cape nyalin satu-satu
            const replyOptions = { embeds: [embed] };
            if (listText.length <= 1900) {
                replyOptions.content = listText;
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
        try {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#3498db')
                        .setTitle('⚙️ SEDANG MEMPROSES YOUTUBE AUDIO (320kbps)...')
                        .setDescription(`Mengunduh ${urls.length} audio & mengunggah ke Roblox... Harap tunggu sebentar.`)
                ]
            });

            let successCount = 0;
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('🎵 HASIL UPLOAD AUDIO YOUTUBE KE ROBLOX')
                .setTimestamp();

            for (let i = 0; i < urls.length; i++) {
                const currentUrl = urls[i];
                try {
                    const res = await runYTUpload(currentUrl, userObj.api_key, userObj.user_id, speedVal);
                    if (res && res.success && res.asset_id) {
                        successCount++;
                        const recPlayback = (1.0 / parseFloat(speedVal)).toFixed(2);
                        embed.addFields({
                            name: `✅ ${res.title || `Audio #${i + 1}`}`,
                            value: (
                                `• **Asset ID Baru:** \`${res.asset_id}\`\n` +
                                `• **Speed & Pitch:** \`${speedVal}x\` (High Pitch Bypass)\n` +
                                `• **Playback In-Game:** \`${recPlayback}x\` *(Atur Sound.PlaybackSpeed di Studio)*\n` +
                                `• **Kualitas:** \`320kbps HD\`\n` +
                                `• **Link:** [Buka YouTube](${currentUrl})`
                            )
                        });
                    } else {
                        embed.addFields({
                            name: `❌ Gagal Audio #${i + 1}`,
                            value: `• Error: ${res?.error || 'Gagal download/upload'}\n• Link: ${currentUrl}`
                        });
                    }
                } catch (itemErr) {
                    embed.addFields({
                        name: `❌ Error Audio #${i + 1}`,
                        value: `Error: ${itemErr.message}`
                    });
                }
            }

            if (successCount > 0 && !isVip) {
                users.useQuota(discordId, successCount);
            }

            const sisa = isVip ? 'Unlimited' : `${Math.max(0, 10 - userObj.quota.used - successCount)}/10`;
            embed.setFooter({ text: `Akun Uploader: @${userObj.roblox_username} | Sisa Kuota: ${sisa}` });

            await interaction.editReply({ embeds: [embed] });

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
        if (interaction.customId === 'modal_setup_roblox') {
            await interaction.deferReply({ ephemeral: true });

            const apiKey = interaction.fields.getTextInputValue('input_api_key').trim();
            const userId = interaction.fields.getTextInputValue('input_user_id').trim();

            if (!/^\d+$/.test(userId)) {
                return interaction.editReply({
                    content: '❌ **User ID Roblox tidak valid!** Pastikan hanya angka (Contoh: `123456789`).'
                });
            }

            // Verifikasi profil Roblox
            const profile = await fetchRobloxUser(userId);
            if (!profile || !profile.name) {
                return interaction.editReply({
                    content: '❌ **Gagal menemukan akun Roblox dengan User ID tersebut!** Periksa kembali ID kamu.'
                });
            }

            let user = users.getUser(interaction.user.id) || users.createUser(interaction.user.id, interaction.user.tag);
            user.api_key = apiKey;
            user.user_id = userId;
            user.roblox_username = profile.name;
            user.roblox_display_name = profile.displayName || profile.name;
            users.saveUser(interaction.user.id, user);

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ SELAMAT AKUN ANDA TERHUBUNG')
                .setDescription('Akun uploader Roblox kamu telah berhasil dikonfigurasi secara private.')
                .addFields(
                    { name: '👤 Username Roblox', value: `[@${profile.name}](https://www.roblox.com/users/${userId}/profile)`, inline: true },
                    { name: '🏷️ Display Name', value: profile.displayName || profile.name, inline: true },
                    { name: '🆔 Roblox ID', value: `\`${userId}\``, inline: true },
                    { name: '🔑 API Key Open Cloud', value: '`••••••••••••••••••••••••` *(Tersimpan aman)*', inline: false },
                    { name: '💎 Status Akun', value: user.role === 'vip' ? '🌟 **VIP (Unlimited)**' : `🆓 **Free** (Sisa Kuota: ${10 - user.quota.used}/10)`, inline: false }
                )
                .setFooter({ text: 'Siap melakukan bypass aset Roblox dengan /spoof' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
        return;
    }

    // 2. Handle Interactive Buttons & Select Menus (Spoof Type & Speed Bypass)
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const customId = interaction.customId;

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
        return;
    }

    // 3. Handle Slash Commands
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const discordId = interaction.user.id;

    // === /setup ===
    if (commandName === 'setup') {
        const modal = new ModalBuilder()
            .setCustomId('modal_setup_roblox')
            .setTitle('MASUKKAN APIKEY DAN USER ID');

        const apiKeyInput = new TextInputBuilder()
            .setCustomId('input_api_key')
            .setLabel('Roblox Open Cloud API Key')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Paste API Key Creator Hub di sini...')
            .setRequired(true);

        const userIdInput = new TextInputBuilder()
            .setCustomId('input_user_id')
            .setLabel('Roblox User ID Anda')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: 123456789')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(apiKeyInput);
        const row2 = new ActionRowBuilder().addComponents(userIdInput);

        modal.addComponents(row1, row2);
        return interaction.showModal(modal);
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
        const sisa = isVip ? 'Unlimited' : `${Math.max(0, user.quota.limit - user.quota.used)}/${user.quota.limit}`;

        const embed = new EmbedBuilder()
            .setColor(isVip ? '#f1c40f' : '#3498db')
            .setTitle('📊 STATUS AKUN SPOOFER')
            .addFields(
                { name: '👤 Akun Roblox', value: `@${user.roblox_username || '-'} (${user.user_id})`, inline: true },
                { name: '💎 Role', value: isVip ? '🌟 **VIP Member**' : '🆓 **Free User**', inline: true },
                { name: '⚡ Sisa Kuota Harian', value: `\`${sisa}\``, inline: true },
                { name: '⏳ Masa Aktif VIP', value: isVip && user.vip_until ? `<t:${Math.floor(new Date(user.vip_until).getTime() / 1000)}:R>` : 'Tidak Aktif', inline: false }
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
});

client.login(BOT_TOKEN);
