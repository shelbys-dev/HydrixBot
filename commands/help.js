const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche la liste des commandes disponibles.'),
    async execute(interaction) {
        const commands = interaction.client.commands.map(cmd => `**/${cmd.data.name}** - ${cmd.data.description}`);

        // Créer un embed dynamique avec les liens
        const embed = new EmbedBuilder()
            .setColor('#1c5863') // Couleur de l'embed
            .setTitle('Commandes') // Titre
            .setDescription('📖 Voici la liste des commandes disponibles :') // Description
            .addFields(
                { name: 'Commandes', value: commands.join('\n') }
            )
            .setFooter({ text: 'Bot codé par Shelby S. ! 🚀', iconURL: 'https://gem-chat-typique.fr/wp-content/uploads/2025/01/icon.png' })
            .setTimestamp();

        // Répondre à l'utilisateur avec l'embed
        await interaction.reply({
            embeds: [embed],
            ephemeral: true, // Visible uniquement par l'utilisateur
        });
    },
};
