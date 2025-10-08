const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

// DB
const db = require('../data/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Système de support par tickets')
        .addSubcommand(s =>
            s.setName('panel')
                .setDescription('Publier le panneau pour ouvrir un ticket')
        )
        .addSubcommand(s =>
            s.setName('export')
                .setDescription('Exporter le transcript Markdown d’un ticket (sélection interactive)')
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

        if (interaction.options.getSubcommand() === 'export') {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isAdmin) {
                return interaction.reply({ content: "❌ Seuls les administrateurs peuvent exporter un transcript.", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // On envoie un “squelette” éphémère; l’UI (menu + pagination) sera fournie par l’event handler
            return interaction.editReply({
                content: "Sélectionne un ticket à exporter :",
                components: [
                    // placeholders; ils seront remplacés par l’event handler via editReply()
                ],
            });
        }
    },
};
