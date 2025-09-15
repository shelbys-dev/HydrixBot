// commands/purge.js
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Supprime l’intégralité des messages d’un salon (avec confirmation).')
        .addStringOption(opt =>
            opt
                .setName('mode')
                .setDescription('Méthode de purge')
                .addChoices(
                    { name: 'nuke (recommandé) – recrée le salon', value: 'nuke' },
                    { name: 'soft – supprime par lots (garde le salon)', value: 'soft' },
                )
                .setRequired(true),
        )
        .addChannelOption(opt =>
            opt
                .setName('salon')
                .setDescription('Salon à purger (par défaut : salon courant)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        const mode = interaction.options.getString('mode', true);
        const targetChannel = interaction.options.getChannel('salon') || interaction.channel;

        if (!targetChannel || !targetChannel.manageable || !targetChannel.viewable) {
            return interaction.reply({ content: '❌ Je ne peux pas gérer ce salon.', ephemeral: true });
        }

        // Permissions bot
        const me = targetChannel.guild.members.me;
        if (!me.permissionsIn(targetChannel).has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages])) {
            return interaction.reply({ content: '❌ Il me manque des permissions (Gérer les salons & Gérer les messages).', ephemeral: true });
        }

        // Sécurité : on refuse dans les threads/DM/voix
        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(targetChannel.type)) {
            return interaction.reply({ content: '❌ Cette commande ne fonctionne que sur les salons textuels ou annonces.', ephemeral: true });
        }

        // Demande de confirmation
        const summary = new EmbedBuilder()
            .setColor(0xff4d4f)
            .setTitle('Confirmer la purge ?')
            .setDescription(
                mode === 'nuke'
                    ? `Tu t’apprêtes à **NUKER** <#${targetChannel.id}>.\n\n• Le salon sera **recréé à l’identique** (permissions, nom, topic, lenteur, NSFW, webhooks non).\n• **Tout l’historique sera perdu.**\n\nClique **Confirmer** pour continuer.`
                    : `Tu t’apprêtes à **supprimer l’historique** de <#${targetChannel.id}> par lots.\n\n• Les messages de **plus de 14 jours** ne peuvent pas être supprimés via bulkDelete.\n• Ça peut prendre un moment selon le volume.\n\nClique **Confirmer** pour continuer.`
            )
            .setFooter({ text: 'Action irreversible' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('purge_confirm').setLabel('Confirmer').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('purge_cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({ embeds: [summary], components: [row], ephemeral: true });

        const msg = await interaction.fetchReply();
        try {
            const btn = await msg.awaitMessageComponent({
                componentType: ComponentType.Button,
                time: 30_000,
                filter: i => i.user.id === interaction.user.id,
            });

            if (btn.customId === 'purge_cancel') {
                await btn.update({ content: '❎ Purge annulée.', components: [], embeds: [] });
                return;
            }

            await btn.update({ content: '🧹 Lancement de la purge…', components: [], embeds: [] });

            if (mode === 'nuke') {
                await nukeChannel(targetChannel, interaction);
            } else {
                const stats = await softPurge(targetChannel);
                await interaction.editReply({
                    content: `✅ Purge **soft** terminée sur <#${targetChannel.id}>.\n• Messages supprimés (estimés) : **${stats.deleted}**\n• Lots traités : **${stats.batches}**`,
                });
            }
        } catch (e) {
            const msg = String(e?.message || e || '');
            const code = e?.code;

            if (code === 'InteractionCollectorError' || /time/i.test(msg)) {
                // Si l'@original a sauté, on tente followUp
                try {
                    await interaction.editReply({ content: '⏱️ Délai dépassé, purge annulée.', components: [], embeds: [] });
                } catch {
                    await interaction.followUp({ content: '⏱️ Délai dépassé, purge annulée.', ephemeral: true }).catch(() => null);
                }
                return;
            }

            console.error('Purge error:', e);

            // 10008 = Unknown Message -> fallback followUp
            if (e?.code === 10008 || /Unknown Message/i.test(msg)) {
                await interaction.followUp({
                    content: `❌ Erreur pendant la purge (message original introuvable) : ${msg}`,
                    ephemeral: true
                }).catch(() => null);
            } else {
                // Essaye d’éditer, sinon followUp
                try {
                    await interaction.editReply({ content: `❌ Erreur pendant la purge : ${msg}`, components: [], embeds: [] });
                } catch {
                    await interaction.followUp({ content: `❌ Erreur pendant la purge : ${msg}`, ephemeral: true }).catch(() => null);
                }
            }
        }
    },
};

// --- helpers ---

/**
 * Clone le salon et supprime l’original (NUKE).
 */
async function nukeChannel(channel, interaction) {
    const position = channel.position;
    const parent = channel.parent;
    const name = channel.name;

    // Conserver quelques métadonnées utiles dans le topic
    const topic = channel.topic ? `${channel.topic}` : null;
    const rateLimitPerUser = channel.rateLimitPerUser || 0;
    const nsfw = channel.nsfw;

    // Créer le clone
    const clone = await channel.clone({
        name,
        topic,
        nsfw,
        rateLimitPerUser,
        reason: `Nuke par ${interaction.user.tag} (${interaction.user.id})`,
    });

    // Replacer au bon endroit et sous la même catégorie
    if (parent) await clone.setParent(parent, { lockPermissions: true });
    if (typeof position === 'number') await clone.setPosition(position);

    // Informer (dans le nouveau salon)
    await clone.send({
        embeds: [
            new EmbedBuilder()
                .setColor(0x00c853)
                .setTitle('Salon recréé')
                .setDescription(`Ce salon a été **nettoyé** à la demande de ${interaction.user}.\nAncien historique supprimé.`),
        ],
    }).catch(() => null);

    // Supprimer l’ancien salon
    await channel.delete(`Nuke par ${interaction.user.tag} (${interaction.user.id})`);

    // Répondre à l’initiateur
    // -> on utilise un followUp éphémère
    await interaction.followUp({
        content: `💣 Purge **nuke** terminée. Nouveau salon : <#${clone.id}>`,
        ephemeral: true
    }).catch(() => null);
}

/**
 * Supprime les messages par lots (limite : < 14 jours).
 */
async function softPurge(channel) {
    let deleted = 0;
    let batches = 0;

    while (true) {
        // fetch 100 messages
        const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (!messages || messages.size === 0) break;

        // Tenter bulkDelete (Discord ignore >14j)
        const bulk = await channel.bulkDelete(messages, true).catch(() => null);
        const count = bulk?.size ?? 0;
        deleted += count;
        batches++;

        // S’il reste des messages non supprimés (probablement >14j), on s’arrête pour éviter des boucles infinies
        if (messages.size > count) break;

        // Petite pause anti rate-limit
        await wait(1200);
    }

    return { deleted, batches };
}

function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
}
