const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { serverConfigs } = require('../data/serverconfigs.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('liens') // Nom de la commande
        .setDescription('Affiche la liste des liens utiles ou configurés par les administrateurs'), // Description de la commande
    async execute(interaction) {
        const guildId = interaction.guild.id;

        // Récupérer la configuration pour le serveur
        const serverConfig = serverConfigs.get(guildId);

        // Si aucun lien n'est configuré, afficher les liens par défaut
        if (!serverConfig || serverConfig.links && serverConfig.links.length === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#1c5863')
                        .setTitle('Liens Utiles')
                        .setDescription('Voici une liste des liens par défaut :')
                        .addFields(
                            { name: '📌 Site Web', value: 'https://shelbydev.fr', inline: false },
                            { name: '📧 Contact', value: '<contact@shelbydev.fr>', inline: false }
                        )
                        .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
                        .setTimestamp(),
                ],
                ephemeral: true,
            });
        }

        // Créer un embed dynamique avec les liens
        const embed = new EmbedBuilder()
            .setColor('#1c5863') // Couleur de l'embed
            .setTitle('Liens Utiles') // Titre
            .setDescription('Voici une liste des liens configurés :') // Description
            .setFooter({ text: 'Bot codé par Shelby S. ! 🚀', iconURL: 'https://gem-chat-typique.fr/wp-content/uploads/2025/01/icon.png' })
            .setTimestamp();

        // Ajouter chaque lien en champ
        serverConfig.links.forEach(link => {
            embed.addFields({ name: link.name, value: `${link.url}`, inline: false });
        });

        // Répondre à l'utilisateur avec l'embed
        await interaction.reply({
            embeds: [embed],
            ephemeral: true, // Visible uniquement par l'utilisateur
        });
    },
};
