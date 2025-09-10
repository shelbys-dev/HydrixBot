const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('important')
        .setDescription('Composer et publier une annonce dans #annonces via un formulaire'),
    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        // ⚠️ Ne PAS defer ici : un modal doit être montré avant toute réponse.
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ Utilise cette commande dans un serveur.', ephemeral: true });
        }

        const MAX_MODAL = 4000;   // contrainte Discord pour TextInput

        const modal = new ModalBuilder()
            .setCustomId('importantModal')
            .setTitle('📢 Nouvelle annonce');

        const contentInput = new TextInputBuilder()
            .setCustomId('important_content')
            .setLabel('Contenu de l’annonce')
            .setStyle(TextInputStyle.Paragraph) // multi-ligne
            .setPlaceholder('Tape ton message ici…')
            .setRequired(true)
            .setMaxLength(MAX_MODAL);

        modal.addComponents(new ActionRowBuilder().addComponents(contentInput));

        return interaction.showModal(modal);
    },
};