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
    ButtonStyle
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
        )
        .addStringOption(opt =>
            opt.setName('speed')
                .setDescription('Speed bypass audio (atur PlaybackSpeed in-game)')
                .addChoices(
                    { name: '1.5x (⭐ Recommended - Playback 0.67x)', value: '1.5' },
                    { name: '2.0x (⚡ Bypass Cepat - Playback 0.50x)', value: '2.0' },
                    { name: '1.0x (Normal - Asli tanpa pitch shift)', value: '1.0' },
                    { name: '1.2x (Playback 0.83x)', value: '1.2' },
                    { name: '1.8x (Playback 0.56x)', value: '1.8' },
                    { name: '2.3x (Playback 0.43x)', value: '2.3' },
                    { name: '2.5x (Bypass Ekstrem - Playback 0.40x)', value: '2.5' },
                    { name: '3.0x (Bypass Max - Playback 0.33x)', value: '3.0' }
                )
        )
        .addStringOption(opt =>
            opt.setName('tipe')
                .setDescription('Tipe target asset')
                .addChoices(
                    { name: 'Otomatis (Detect)', value: 'auto' },
                    { name: 'Audio (MP3)', value: 'audio' },
                    { name: 'Animasi (.rbxm)', value: 'animation' },
                    { name: 'Decal (PNG)', value: 'decal' }
                )
        ),

    new SlashCommandBuilder()
        .setName('ytupload')
        .setDescription('Unduh audio dari YouTube (320kbps) dan upload ke Roblox')
        .addStringOption(opt =>
            opt.setName('url')
                .setDescription('Link video YouTube (https://...)')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('speed')
                .setDescription('Speed bypass audio (opsional)')
                .addChoices(
                    { name: '1.0x (Normal)', value: '1.0' },
                    { name: '1.5x (⭐ Recommended)', value: '1.5' },
                    { name: '2.0x (Bypass Cepat)', value: '2.0' }
                )
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
        // 1. Registrasi Global Commands
        await rest.put(Routes.applicationCommands(targetId), { body: commands });

        // 2. Registrasi Guild Commands agar langsung muncul detik itu juga (0 delay)
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

    // 2. Handle Slash Commands
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
                    name: '2️⃣ Cara Membuat API Key di Roblox Creator Hub',
                    value: (
                        '1. Buka browser: **[create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials)**\n' +
                        '2. Login dengan akun Roblox uploader kamu.\n' +
                        '3. Klik tombol biru **`Create API Key`** di pojok kanan atas.\n' +
                        '4. Beri nama API Key (contoh: `RobloxSpoofer`).\n' +
                        '5. Pada bagian **Access Permissions**:\n' +
                        '   - Klik **Add API System** -> Pilih **Assets**\n' +
                        '   - Centang operasi **`Read`** dan **`Write`** (`asset:read`, `asset:write`).\n' +
                        '6. Pada bagian **IP Restrictions**:\n' +
                        '   - Pilih **`Allow all IP addresses`** (atau ketik `0.0.0.0/0`) agar bot dapat mengupload tanpa batasan IP.\n' +
                        '7. Klik **`Save & Generate Key`**.\n' +
                        '8. **Salin kodenya langsung** (dimulai dengan format secret key) lalu tempelkan di `/setup`.'
                    )
                },
                {
                    name: '3️⃣ Cara Spoof / Bypass Asset Roblox (/spoof)',
                    value: (
                        '• Ketik perintah `/spoof`.\n' +
                        '• Masukkan **asset_id** Roblox yang ingin kamu bypass (bisa audio, animasi, decal).\n' +
                        '• Bisa beberapa ID sekaligus (pisahkan dengan koma atau spasi).\n' +
                        '• Pilih **Speed** (Rekomendasi `1.5x` agar otomatis lolos copyright Roblox).\n' +
                        '• Bot akan mendownload asset asli via bot tumbal, memodifikasi audio/pitch, dan menguploadnya ke inventori akun kamu!\n' +
                        '• Di Roblox Studio, ubah properti `PlaybackSpeed` pada Sound (misal: `0.67` jika pakai speed 1.5x) agar suara kembali normal.'
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
        const speedVal = interaction.options.getString('speed') || '1.5';
        const assetType = interaction.options.getString('tipe') || 'auto';

        const ids = rawIds.split(/[\r\n,\s]+/).map(x => x.trim()).filter(x => /^\d+$/.test(x));
        if (!ids.length) {
            return interaction.reply({ content: '❌ **Format Asset ID tidak valid!** Masukkan angka ID yang benar.', ephemeral: true });
        }

        const isVip = check.role === 'vip';
        const userObj = check.user;

        // Beri respon antrean awal
        const position = isVip ? 'Prioritas VIP ⚡' : `${taskQueue.length + 1}`;
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#e67e22')
                    .setTitle('⏳ MEMASUKKAN KE ANTREAN SPOOF')
                    .setDescription(`Asset ID: \`${ids.join(', ')}\`\nSpeed: \`${speedVal}x\` | Tipe: \`${assetType}\``)
                    .addFields(
                        { name: 'Status Antrean', value: isVip ? '🌟 **VIP (Langsung Diproses)**' : `Posisi Antrean: **#${position}**`, inline: true }
                    )
            ]
        });

        // Masukkan task ke sistem Antrean FIFO
        enqueueTask(async () => {
            try {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#3498db')
                            .setTitle('⚙️ SEDANG MEMPROSES SPOOF...')
                            .setDescription(`Mengunduh aset dari Roblox CDN via bot tumbal & mempercepat audio...`)
                    ]
                });

                const results = await runSpoof(ids, userObj.api_key, userObj.user_id, speedVal, assetType);

                if (!results || !Array.isArray(results) || results.length === 0) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#e74c3c')
                                .setTitle('❌ SPOOF GAGAL')
                                .setDescription('Bot tidak dapat mengunduh atau mengunggah aset ke Roblox. Periksa kembali cookie bot tumbal / API key.')
                        ]
                    });
                }

                let successCount = 0;
                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('🔥 HASIL SPOOF ASSET ROBLOX')
                    .setTimestamp();

                for (const item of results) {
                    if (item.status === 'completed' && item.new_id) {
                        successCount++;
                        const recPlayback = (1.0 / parseFloat(speedVal)).toFixed(2);
                        embed.addFields({
                            name: `✅ ${item.name || 'Asset'} (${item.asset_type || 'Audio'})`,
                            value: `• **ID Asli:** \`${item.id}\`\n• **ID Baru:** \`${item.new_id}\`\n• **Playback In-Game:** \`${recPlayback}x\` *(Atur Sound.PlaybackSpeed)*`
                        });
                    } else {
                        embed.addFields({
                            name: `❌ Gagal: ID ${item.id}`,
                            value: `Error: ${item.error || 'Gagal diproses'}`
                        });
                    }
                }

                if (successCount > 0 && !isVip) {
                    users.useQuota(discordId, successCount);
                }

                const sisa = isVip ? 'Unlimited' : `${Math.max(0, 10 - userObj.quota.used - successCount)}/10`;
                embed.setFooter({ text: `Akun: @${userObj.roblox_username} | Sisa Kuota: ${sisa}` });

                await interaction.editReply({ embeds: [embed] });

            } catch (err) {
                console.error('[Spoof Error]', err);
                await interaction.editReply({
                    content: `❌ Terjadi kesalahan saat memproses: ${err.message}`
                });
            }
        }, isVip);
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

        const ytUrl = interaction.options.getString('url');
        const speedVal = interaction.options.getString('speed') || '1.0';
        const isVip = check.role === 'vip';
        const userObj = check.user;

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#e67e22')
                    .setTitle('⏳ MENGUNDUH DARI YOUTUBE (320kbps)')
                    .setDescription(`URL: \`${ytUrl}\`\nHarap tunggu proses konversi studio audio...`)
            ]
        });

        enqueueTask(async () => {
            try {
                const res = await runYTUpload(ytUrl, userObj.api_key, userObj.user_id, speedVal);
                if (res && res.success && res.asset_id) {
                    if (!isVip) users.useQuota(discordId, 1);
                    const sisa = isVip ? 'Unlimited' : `${Math.max(0, 10 - userObj.quota.used - 1)}/10`;

                    const embed = new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('🎵 YOUTUBE AUDIO BERHASIL DIUPLOAD')
                        .addFields(
                            { name: 'Judul Lagu', value: res.title || 'YouTube Audio', inline: false },
                            { name: '🆔 Asset ID Baru', value: `\`${res.asset_id}\``, inline: true },
                            { name: 'Speed', value: `${speedVal}x`, inline: true },
                            { name: 'Sisa Kuota', value: sisa, inline: true }
                        )
                        .setFooter({ text: `Uploader: @${userObj.roblox_username}` })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#e74c3c')
                                .setTitle('❌ GAGAL MENGUNGGAH DARI YOUTUBE')
                                .setDescription(`Error: ${res?.error || 'Unknown error'}`)
                        ]
                    });
                }
            } catch (err) {
                await interaction.editReply({ content: `❌ Error: ${err.message}` });
            }
        }, isVip);
    }
});

client.login(BOT_TOKEN);
