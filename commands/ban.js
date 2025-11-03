const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    category: 'Modération',
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre (ouvre une modal pour ajouter un motif optionnel).')
        .addUserOption(o => o.setName('membre').setDescription('Membre à bannir').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers), // permission côté Discord

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
        }

        // Permissions runtime (au cas où)
        const mePerms = interaction.guild.members.me.permissions;
        if (!mePerms.has(PermissionFlagsBits.BanMembers)) {
            return interaction.reply({ content: '❌ Je n\'ai pas la permission `BanMembers` pour bannir des membres.', ephemeral: true });
        }

        const target = interaction.options.getUser('membre', true);
        // Empêcher de bannir soi-même ou le bot
        if (target.id === interaction.user.id) {
            return interaction.reply({ content: '⚠️ Tu ne peux pas te bannir toi-même.', ephemeral: true });
        }
        if (target.id === interaction.client.user.id) {
            return interaction.reply({ content: '⚠️ Je ne peux pas me bannir moi-même 😅', ephemeral: true });
        }

        // Show modal to ask for reason (optional)
        const modal = new ModalBuilder()
            .setCustomId(`ban_modal:${interaction.id}:${target.id}`) // unique par interaction
            .setTitle(`Bannir ${target.tag}`);

        const reasonInput = new TextInputBuilder()
            .setCustomId('ban_reason')
            .setLabel('Motif (optionnel, max 1000 chars)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000)
            .setPlaceholder('Ex: Spam, harassment, etc.');

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

        await interaction.showModal(modal);

        try {
            // awaitModalSubmit : timeout 2 minutes
            const submitted = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: m => m.customId === `ban_modal:${interaction.id}:${target.id}` && m.user.id === interaction.user.id,
            });

            await submitted.deferReply({ ephemeral: true });

            const reason = submitted.fields.getTextInputValue('ban_reason')?.trim() || 'Aucun motif fourni';

            // Fetch member (to check bannable)
            let member;
            try {
                member = await interaction.guild.members.fetch(target.id);
            } catch {
                member = null; // possible si déjà parti
            }

            // Check if bannable (role hierarchy)
            if (member) {
                if (!member.bannable) {
                    return submitted.editReply({ content: '❌ Je ne peux pas bannir ce membre (rôle trop élevé ou protection).', ephemeral: true });
                }
            }

            // Execute ban
            await interaction.guild.bans.create(target.id, { reason: `${reason} — par ${interaction.user.tag}` });

            // Prepare embed pour logs
            const embed = new EmbedBuilder()
                .setTitle('⛔ Membre banni')
                .setColor(0xff4444)
                .addFields(
                    { name: 'Membre', value: `${target.tag} (${target.id})`, inline: true },
                    { name: 'Modérateur', value: `${submitted.user.tag} (${submitted.user.id})`, inline: true },
                    { name: 'Motif', value: reason }
                )
                .setTimestamp();

            // 1) Envoyer dans le salon #logs du serveur s'il existe
            const logChannel = interaction.guild.channels.cache.find(c => c.name && c.name.toLowerCase() === 'logs');
            if (logChannel && logChannel.isTextBased?.()) {
                logChannel.send({ embeds: [embed] }).catch(err => {
                    console.error('[ban] Impossible d\'envoyer dans #logs:', err);
                });
            } else {
                console.warn('[ban] Salon "logs" introuvable dans le serveur.');
            }

            // console log
            console.log(`[BAN] ${target.tag} (${target.id}) banned from ${interaction.guild.name} (${interaction.guild.id}) by ${submitted.user.tag} — reason: ${reason}`);

            // réponse au modérateur
            await submitted.editReply({ content: `✅ ${target.tag} a été banni. Motif : ${reason}`, ephemeral: true });
        } catch (err) {
            console.error('Erreur ban modal:', err);
            // timeout or other error
            try {
                await interaction.followUp?.({ content: '⏳ Modal expirée ou erreur. Opération annulée.', ephemeral: true });
            } catch { }
        }
    },
};
