// events/interactioncreate.js
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
                        .setTitle(i === 0 ? '📢 Annonce importante' : 'Suite')
                        .setDescription(part)
                        .setColor(0xff5555)
                        .setThumbnail(interaction.client.user.displayAvatarURL({ size: 1024 }))
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

                return interaction.editReply(`✅ Annonce publiée dans <#${annonceChannelId}>.`);
            } catch (err) {
                console.error('Erreur modal /important:', err);
                return interaction.editReply('❌ Erreur lors de la publication de l’annonce.');
            }
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
