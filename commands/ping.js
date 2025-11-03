const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
    category: 'Utilitaires',
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Répond avec Pong ! 🏓'),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: "❌ Vous n'avez pas les permissions nécessaires pour exécuter cette commande.",
                ephemeral: true,
            });
        }
        // Éditer un message pour mesurer la latence

        const clcping = new EmbedBuilder()
            .setColor('#1c5863') // Couleur de l'embed
            .setTitle('Ping') // Titre
            .setDescription('Calcul du ping...') // Description
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 1024 })) // Icône du bot
            .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
            .setTimestamp();

        const message = await interaction.reply({ embeds: [clcping], fetchReply: true, ephemeral: true });

        const websocketPing = interaction.client.ws.ping; // Ping WebSocket
        const messagePing = message.createdTimestamp - interaction.createdTimestamp; // Ping du message

        // Afficher les résultats
        const ping = new EmbedBuilder()
            .setColor('#1c5863') // Couleur de l'embed
            .setTitle('Ping') // Titre
            .setDescription('🏓 Pong !') // Description
            .addFields(
                { name: 'Latence du message :', value: `**${messagePing}ms**` },
                { name: 'Latence WebSocket :', value: `**${websocketPing}ms**` }
            )
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 1024 })) // Icône du bot
            .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
            .setTimestamp();

        // Répondre à l'utilisateur avec l'embed
        await interaction.editReply({
            embeds: [ping],
            ephemeral: true, // Visible uniquement par l'utilisateur
        });
    },
};
