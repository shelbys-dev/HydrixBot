const {
    ChannelType,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

// DB
const db = require('../data/db');

const MAX_EMBED = 4096; // contrainte Discord pour description d'embed

function splitForDiscord(text, max = MAX_EMBED) {
    const chunks = [];
    for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
    return chunks;
}

module.exports = {
    name: 'interactionCreate',
    once: false,

    async execute(interaction) {
        // --- Gestion du Modal /important ---
        if (interaction.isModalSubmit() && interaction.customId === 'importantModal') {
            await interaction.deferReply({ ephemeral: true });

            const guild = interaction.guild;
            if (!guild) {
                return interaction.editReply('❌ Cette action doit être utilisée dans un serveur.');
            }

            const title = interaction.fields.getTextInputValue('important_title');
            const contenu = interaction.fields.getTextInputValue('important_content')?.trim();
            if (!contenu) {
                return interaction.editReply('❌ Le contenu est vide.');
            }

            try {
                // 🔎 Lecture de la config via db
                const [rows] = await db.query(
                    'SELECT annonce_channel FROM serverconfig WHERE server_id = ? LIMIT 1',
                    [guild.id]
                );

                if (!rows?.length || !rows[0].annonce_channel) {
                    return interaction.editReply('❌ Aucun salon d’annonces configuré. Renseigne `annonce_channel` dans la base.');
                }

                const annonceChannelId = String(rows[0].annonce_channel);

                let annonceChannel = guild.channels.cache.get(annonceChannelId);
                if (!annonceChannel) {
                    try { annonceChannel = await guild.channels.fetch(annonceChannelId); } catch { }
                }

                const validTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
                if (!annonceChannel || !validTypes.includes(annonceChannel.type)) {
                    return interaction.editReply(`❌ Le salon <#${annonceChannelId}> est introuvable ou n’est pas textuel/annonces.`);
                }

                const me = guild.members.me;
                const perms = annonceChannel.permissionsFor(me);
                if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) {
                    return interaction.editReply(`❌ Je ne peux pas envoyer de messages dans <#${annonceChannelId}>.`);
                }
                if (!perms?.has(PermissionFlagsBits.EmbedLinks)) {
                    return interaction.editReply(`❌ Il me manque la permission **Intégrer des liens** dans <#${annonceChannelId}>.`);
                }

                // ✍️ Envoi (split en plusieurs embeds si > 4096)
                const parts = splitForDiscord(contenu, MAX_EMBED);
                let lastMsg;
                for (const [i, part] of parts.entries()) {
                    const embed = new EmbedBuilder()
                        .setTitle(i === 0 ? `📢 ${title}` : 'Suite')
                        .setDescription(part)
                        .setColor(0xff5555)
                        .setThumbnail(interaction.user.displayAvatarURL({ size: 256, extension: 'png', forceStatic: false }))
                        .setFooter({ text: `Par ${interaction.user.tag}` })
                        .setTimestamp();

                    lastMsg = await annonceChannel.send({
                        embeds: [embed],
                        // allowedMentions: { parse: [] }, // décommente si tu veux bloquer toute mention
                    });
                }

                // 🔁 Crosspost si c’est un salon d’annonces
                if (annonceChannel.type === ChannelType.GuildAnnouncement && lastMsg?.crosspost) {
                    try { await lastMsg.crosspost(); } catch { }
                }

                const logChannel = guild.channels.cache.find(
                    (ch) => ch.name && ch.name.toLowerCase() === 'logs'
                );

                if (logChannel) {
                    const annonce_embed = new EmbedBuilder()
                        .setColor(0xff5555)
                        .setTitle('📢 Annonce publiée')
                        .setDescription(`${interaction.user.tag} a publié ${title} dans <#${annonceChannelId}>.`)
                        .setThumbnail(interaction.user.displayAvatarURL({ size: 256, extension: 'png', forceStatic: false }))
                        .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
                        .setTimestamp();

                    // on ignore les erreurs d’envoi pour ne pas bloquer la suite
                    logChannel.send({ embeds: [annonce_embed] }).catch(() => { });
                } else {
                    console.error('Channel "logs" introuvable dans le serveur.');
                }

                return interaction.editReply(`✅ Annonce publiée dans <#${annonceChannelId}>.`);
            } catch (err) {
                console.error('Erreur modal /important:', err);
                return interaction.editReply('❌ Erreur lors de la publication de l’annonce.');
            }
        }

        // --- helper: récupérer ou créer l'id de serverconfig pour une guilde ---
        async function getOrCreateServerConfigId(guildId) {
            // 1) try select
            const [rows] = await db.query('SELECT id FROM serverconfig WHERE server_id = ?', [guildId]);
            if (rows.length) return rows[0].id;
            // 2) insert minimal (en supposant des colonnes NULL par défaut)
            const [res] = await db.query('INSERT INTO serverconfig (server_id) VALUES (?)', [guildId]);
            return res.insertId;
        }

        // =========================
        // Tickets — Ouvrir (bouton)
        // =========================
        if (interaction.isButton() && interaction.customId.startsWith('ticket_open:')) {
            const [_, guildId] = interaction.customId.split(':');
            if (guildId !== interaction.guildId) {
                return interaction.reply({ content: 'Contexte invalide.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(`ticket_reason:${guildId}`)
                .setTitle('Ouvrir un ticket');

            const reason = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Motif / Détail')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000)
                .setPlaceholder("Décris ton problème, lien/salon concerné, etc.");

            modal.addComponents(new ActionRowBuilder().addComponents(reason));
            return interaction.showModal(modal);
        }

        // =========================
        // Tickets — Création (modal)
        // =========================
        if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_reason:')) {
            await interaction.deferReply({ ephemeral: true });

            const [_, guildId] = interaction.customId.split(':');
            if (guildId !== interaction.guildId) {
                return interaction.editReply('Contexte invalide.');
            }

            const reason = interaction.fields.getTextInputValue('reason')?.trim() || 'Sans motif';
            const guild = interaction.guild;

            try {
                // 1) Catégorie "Tickets"
                let category = guild.channels.cache.find(c => c.type === 4 && c.name.toLowerCase() === 'tickets');
                if (!category) {
                    category = await guild.channels.create({ name: 'Tickets', type: 4 });
                }

                // 2) Rôles admin
                const adminRoles = guild.roles.cache.filter(r => r.permissions.has(PermissionFlagsBits.Administrator));

                // 3) Pré-insert DB (tickets) avec serverconfig_id
                const serverconfigId = await getOrCreateServerConfigId(guild.id);
                const now = new Date();
                const [insertRes] = await db.query(
                    `INSERT INTO tickets (serverconfig_id, channel_id, opener_user_id, opener_tag, reason, status, created_at)
           VALUES (?, 'pending', ?, ?, ?, 'open', ?)`,
                    [serverconfigId, interaction.user.id, interaction.user.tag, reason, now]
                );
                const ticketId = insertRes.insertId;

                // 4) Permissions du salon
                const safeUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 20);
                const channelName = `ticket-${safeUser}-${interaction.user.id.slice(-4)}`;
                const permissionOverwrites = [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    {
                        id: guild.members.me.id, allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ManageMessages,
                        ]
                    },
                    {
                        id: interaction.user.id, allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                        ]
                    },
                ];
                for (const role of adminRoles.values()) {
                    permissionOverwrites.push({
                        id: role.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ManageMessages,
                        ],
                    });
                }

                // 5) Créer le salon
                const channel = await guild.channels.create({
                    name: channelName,
                    type: 0,
                    parent: category.id,
                    permissionOverwrites,
                    reason: `Ticket ouvert par ${interaction.user.tag}`,
                });

                // 6) MAJ channel_id en DB
                await db.query(`UPDATE tickets SET channel_id = ? WHERE id = ?`, [channel.id, ticketId]);

                // 7) Topic avec méta
                const topicData = {
                    ticketId,
                    serverconfigId,
                    ownerId: interaction.user.id,
                    reason,
                    createdAt: now.toISOString(),
                };
                try { await channel.setTopic(`TICKET_META::${JSON.stringify(topicData)}`); } catch { }

                // 8) Message d'accueil + bouton fermer
                const emb = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle('🎫 Ticket ouvert')
                    .setDescription(`Bonjour ${interaction.user}, un membre de l’équipe va te répondre.\n\n**Motif** :\n${reason}`)
                    .setTimestamp();
                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_close:${channel.id}:${interaction.user.id}`)
                        .setLabel('Fermer le ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );
                await channel.send({ content: `${interaction.user}`, embeds: [emb], components: [closeRow] });

                return interaction.editReply(`✅ Ton ticket est ouvert : <#${channel.id}> (id: ${ticketId})`);
            } catch (err) {
                console.error('Ticket create error:', err);
                return interaction.editReply('❌ Impossible de créer le ticket (permissions ?).');
            }
        }

        // =========================
        // Tickets — Fermer (bouton)
        // =========================
        if (interaction.isButton() && interaction.customId.startsWith('ticket_close:')) {
            const [_, channelId, ownerId] = interaction.customId.split(':');
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            const isOwner = interaction.user.id === ownerId;
            if (!isAdmin && !isOwner) {
                return interaction.reply({ content: "❌ Seul l'initiateur du ticket ou un admin peut le fermer.", ephemeral: true });
            }

            const channel = interaction.guild.channels.cache.get(channelId)
                || await interaction.guild.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // a) Récup méta (ticketId / serverconfigId / reason)
            let ticketId = null, meta = null;
            try {
                const raw = channel.topic || '';
                const m = raw.match(/^TICKET_META::(.+)/);
                if (m) {
                    meta = JSON.parse(m[1]);
                    ticketId = meta.ticketId || null;
                }
            } catch { }

            // b) Fetch tous les messages (pagination)
            const all = [];
            let lastId = null;
            while (true) {
                const batch = await channel.messages.fetch({ limit: 100, before: lastId || undefined })
                    .catch(() => null);
                if (!batch || batch.size === 0) break;
                all.push(...batch.map(m => m));
                const last = batch.last();
                lastId = last ? last.id : null;
                if (batch.size < 100) break;
            }
            all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

            // c) Build Markdown transcript
            const esc = (s = '') => s
                .replace(/[`*_~|]/g, '\\$&')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const lines = [];
            lines.push(`# Transcript — ${channel.name}`);
            lines.push(`Serveur: ${interaction.guild.name} (${interaction.guild.id})`);
            lines.push(`Salon: #${channel.name} (${channel.id})`);
            if (meta?.reason) lines.push(`Motif: ${esc(meta.reason)}`);
            lines.push('');
            for (const m of all) {
                const time = new Date(m.createdTimestamp).toISOString();
                const author = m.author?.tag || '???';
                const content = m.content ? esc(m.content) : '';
                lines.push(`**[${time}] ${author}**: ${content}`);
                if (m.attachments?.size) {
                    for (const at of m.attachments.values()) lines.push(`  • [fichier] ${at.url}`);
                }
                if (m.embeds?.length) lines.push(`  • (embed x${m.embeds.length})`);
            }
            const transcriptMd = lines.join('\n');

            // d) Persistance DB (close + transcript)
            const closedAt = new Date();
            const closedBy = interaction.user.id;

            if (!ticketId) {
                // fallback si ancien ticket sans meta
                const serverconfigId = await getOrCreateServerConfigId(interaction.guild.id);
                const [res] = await db.query(
                    `INSERT INTO tickets (serverconfig_id, channel_id, opener_user_id, opener_tag, reason, status, created_at, closed_at, closed_by, transcript_md)
           VALUES (?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?)`,
                    [
                        serverconfigId,
                        channel.id,
                        ownerId,
                        null,
                        meta?.reason || '—',
                        new Date(channel.createdTimestamp),
                        closedAt,
                        closedBy,
                        transcriptMd,
                    ]
                );
                ticketId = res.insertId;
            } else {
                await db.query(
                    `UPDATE tickets
             SET status = 'closed', closed_at = ?, closed_by = ?, transcript_md = ?
           WHERE id = ?`,
                    [closedAt, closedBy, transcriptMd, ticketId]
                );
            }

            await interaction.editReply({ content: `📝 Transcript enregistré (#${ticketId}). Le salon va être supprimé dans 10s.` });
            try { await channel.send('🔒 Le ticket va être supprimé dans **10s**.'); } catch { }
            setTimeout(() => channel.delete('Ticket fermé (transcript sauvegardé)').catch(() => { }), 10_000);
            return;
        }


        // --- Slash commands classiques ---
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const payload = {
                content: '❌ Une erreur est survenue lors de l’exécution de la commande.',
                ephemeral: true,
            };
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(payload);
            } else {
                await interaction.reply(payload);
            }
        }
    },
};
