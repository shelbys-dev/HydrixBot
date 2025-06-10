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
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 1024 })) // Icône du bot
            .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
            .setTimestamp();

        // Répondre à l'utilisateur avec l'embed
        await interaction.reply({
            embeds: [embed],
            ephemeral: true, // Visible uniquement par l'utilisateur
        });
    },
};
