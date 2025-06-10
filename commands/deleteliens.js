const { SlashCommandBuilder } = require('discord.js');
const { serverConfigs, saveConfigs } = require('../data/serverconfigs.js');

// Commande pour supprimer un lien spécifique
module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-lien')
        .setDescription("Supprime un lien de la liste configurée pour ce serveur")
        .addStringOption(option =>
            option.setName('nom')
                .setDescription("Nom du lien à supprimer (tel qu'affiché)")
                .setRequired(true)
        ),
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const name = interaction.options.getString('nom');

        // Récupérer la configuration pour le serveur
        const serverConfig = serverConfigs.get(guildId);

        if (!serverConfig || serverConfig.links && serverConfig.links.length === 0) {
            return interaction.reply({
                content: '❌ Aucune configuration de liens n’existe pour ce serveur.',
                ephemeral: true,
            });
        }

        // Trouver l'index du lien à supprimer
        const linkIndex = serverConfig.links.findIndex(link => link.name.toLowerCase() === name.toLowerCase());

        if (linkIndex === -1) {
            return interaction.reply({
                content: `❌ Aucun lien correspondant à **${name}** n’a été trouvé dans la configuration.`,
                ephemeral: true,
            });
        }

        // Supprimer le lien de la liste
        serverConfig.links.splice(linkIndex, 1);

        // Mettre à jour ou supprimer la configuration
        if (serverConfig.links && serverConfig.links.length === 0) {
            serverConfigs.delete(guildId); // Supprimer l'entrée si aucun lien restant
        } else {
            serverConfigs.set(guildId, serverConfig); // Mettre à jour la liste
            saveConfigs();
        }

        // Confirmer la suppression
        await interaction.reply({
            content: `✅ Le lien **${name}** a été supprimé avec succès !`,
            ephemeral: true,
        });
    },
};
