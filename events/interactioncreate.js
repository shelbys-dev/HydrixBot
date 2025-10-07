const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

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

        // --- Tickets: bouton "ouvrir" -> modal ---
        if (interaction.isButton() && interaction.customId.startsWith('ticket_open:')) {
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
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

        // --- Tickets: modal soumis -> créer le salon ---
        if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_reason:')) {
            await interaction.deferReply({ ephemeral: true });

            const [_, guildId] = interaction.customId.split(':');
            if (guildId !== interaction.guildId) {
                return interaction.editReply('Contexte invalide.');
            }

            const reason = interaction.fields.getTextInputValue('reason')?.trim() || 'Sans motif';
            const guild = interaction.guild;

            try {
                // 1) Catégorie "Tickets" (créée si absente)
                let category = guild.channels.cache.find(
                    c => c.type === 4 && c.name.toLowerCase() === 'tickets'
                );
                if (!category) {
                    category = await guild.channels.create({
                        name: 'Tickets',
                        type: 4, // GuildCategory
                    });
                }

                // 2) Liste des rôles Admin
                const adminRoles = guild.roles.cache.filter(r => r.permissions.has(PermissionFlagsBits.Administrator));

                // 3) Créer le salon privé
                const safeUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 20);
                const channelName = `ticket-${safeUser}-${interaction.user.id.slice(-4)}`;

                const permissionOverwrites = [
                    // everybody = no view
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    // bot
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
                    // demandeur
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

                // rôles admin : accès
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

                const channel = await guild.channels.create({
                    name: channelName,
                    type: 0, // GuildText
                    parent: category.id,
                    permissionOverwrites,
                    reason: `Ticket ouvert par ${interaction.user.tag}`,
                });

                // 4) Message d'accueil + bouton fermer
                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

                const emb = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle('🎫 Ticket ouvert')
                    .setDescription(
                        `Bonjour ${interaction.user}, un membre de l’équipe va te répondre.\n\n**Motif** :\n${reason}`
                    )
                    .setTimestamp();

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_close:${channel.id}:${interaction.user.id}`)
                        .setLabel('Fermer le ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await channel.send({ content: `${interaction.user}`, embeds: [emb], components: [closeRow] });

                return interaction.editReply(`✅ Ton ticket est ouvert : <#${channel.id}>`);
            } catch (err) {
                console.error('Ticket create error:', err);
                return interaction.editReply('❌ Impossible de créer le ticket (permissions ?).');
            }
        }

        // --- Tickets: fermer le ticket ---
        if (interaction.isButton() && interaction.customId.startsWith('ticket_close:')) {
            const [_, channelId, ownerId] = interaction.customId.split(':');
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            const isOwner = interaction.user.id === ownerId;

            if (!isAdmin && !isOwner) {
                return interaction.reply({ content: "❌ Seul l'initiateur du ticket ou un admin peut le fermer.", ephemeral: true });
            }

            const channel = interaction.guild.channels.cache.get(channelId) ||
                await interaction.guild.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });
            }

            await interaction.reply({ content: '🔒 Fermeture du ticket dans 10 secondes…', ephemeral: true });
            try {
                await channel.send('🔒 Le ticket va être supprimé dans **10s**.');
                setTimeout(() => channel.delete('Ticket fermé').catch(() => { }), 10_000);
            } catch { }
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
