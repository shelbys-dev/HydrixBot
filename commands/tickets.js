const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Système de support par tickets')
        .addSubcommand(s =>
            s.setName('panel')
                .setDescription('Publier le panneau pour ouvrir un ticket')
        ),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
        }
        if (interaction.options.getSubcommand() === 'panel') {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isAdmin) {
                return interaction.reply({ content: "❌ Permission administrateur requise.", ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎫 Support — Ouvrir un ticket')
                .setDescription(
                    "Besoin d'aide ?\nClique sur le bouton ci-dessous pour créer un ticket privé avec l’équipe."
                )
                .setFooter({ text: 'Les tickets sont visibles par les admins et vous uniquement.' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_open:${interaction.guild.id}`)
                    .setLabel('Ouvrir un ticket')
                    .setEmoji('📩')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ content: '✅ Panneau envoyé (éphémère).', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }
    },
};
