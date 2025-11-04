const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require('discord.js');

module.exports = {
    category: 'Modération',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre, avec motif optionnel (via une modal).')
        .addUserOption(o =>
            o.setName('membre')
                .setDescription('Membre à expulser')
                .setRequired(true)
        )
        // Exige que l’utilisateur qui exécute la commande ait KickMembers
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('membre', true);
        const guild = interaction.guild;

        // Récupérer le GuildMember cible
        let targetMember = guild.members.cache.get(targetUser.id);
        if (!targetMember) {
            try { targetMember = await guild.members.fetch(targetUser.id); } catch { }
        }

        // Garde-fous
        if (!targetMember) {
            return interaction.reply({ content: '❌ Membre introuvable sur ce serveur.', ephemeral: true });
        }
        if (targetMember.id === guild.ownerId) {
            return interaction.reply({ content: '❌ Impossible d’expulser le propriétaire du serveur.', ephemeral: true });
        }
        if (targetMember.id === interaction.user.id) {
            return interaction.reply({ content: '❌ Tu ne peux pas t’expulser toi-même.', ephemeral: true });
        }

        // Vérifs permissions
        const me = guild.members.me;
        if (!me.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.reply({ content: '❌ Il me manque la permission **Expulser des membres**.', ephemeral: true });
        }
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.reply({ content: '❌ Permission **Expulser des membres** requise.', ephemeral: true });
        }
        if (!targetMember.kickable) {
            return interaction.reply({ content: '❌ Je ne peux pas expulser ce membre (hiérarchie/permissions).', ephemeral: true });
        }

        // Ouvre la modal pour saisir un motif (optionnel)
        const customId = `kick_modal:${guild.id}:${targetMember.id}:${interaction.id}`;
        const modal = new ModalBuilder()
            .setCustomId(customId)
            .setTitle(`Expulser ${targetMember.user.tag}`);

        const reasonInput = new TextInputBuilder()
            .setCustomId('kick_reason')
            .setLabel('Motif (optionnel)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('Ex: Non-respect des règles… (laisser vide si aucun motif)');

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

        await interaction.showModal(modal);

        // Attend la soumission de la modal
        let submitted;
        try {
            submitted = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: i => i.customId === customId && i.user.id === interaction.user.id,
            });
        } catch {
            // Timeout modal
            return; // rien à faire (Discord fermera la modale côté client)
        }

        const reason = submitted.fields.getTextInputValue('kick_reason')?.trim();
        const finalReason = reason || '—';

        // Essaye de prévenir l’utilisateur en DM (silencieux si ça échoue)
        try {
            await targetMember.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff9f43)
                        .setTitle(`Vous avez été expulsé de ${guild.name}`)
                        .addFields(
                            { name: 'Motif', value: finalReason },
                            { name: 'Modération', value: `${interaction.user.tag}` },
                        )
                        .setTimestamp(),
                ],
            });
        } catch { }

        // Exécute le kick
        try {
            await targetMember.kick(targetMember, { reason: `${finalReason} — par ${interaction.user.tag}` });
        } catch (err) {
            console.error('Kick error:', err);
            return submitted.reply({ content: '❌ Échec de l’expulsion (permissions/hiérarchie).', ephemeral: true });
        }

        // Log dans #logs si présent
        const logChannel = guild.channels.cache.find(
            ch => ch.name && ch.name.toLowerCase() === 'logs'
        );
        if (logChannel) {
            const emb = new EmbedBuilder()
                .setColor(0xff9f43)
                .setTitle('👢 Membre expulsé')
                .addFields(
                    { name: 'Membre', value: `${targetMember.user.tag} (${targetMember.id})`, inline: false },
                    { name: 'Modérateur', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                    { name: 'Motif', value: finalReason, inline: false },
                )
                .setTimestamp();

            logChannel.send({ embeds: [emb] }).catch(() => { });
        }

        // Confirmation éphémère
        return submitted.reply({
            content: `✅ **${targetMember.user.tag}** a été expulsé.${reason ? `\n📝 Motif: ${reason}` : ''}`,
            ephemeral: true,
        });
    },
};
