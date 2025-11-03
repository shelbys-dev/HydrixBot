const { SlashCommandBuilder } = require('discord.js');
const { serverConfigs, saveConfigs } = require('../data/serverconfigs.js');

module.exports = {
    category: 'Configuration',
    data: new SlashCommandBuilder()
        .setName('removeautomessage')
        .setDescription('Supprime la configuration des messages automatiques pour ce serveur.'),
    async execute(interaction) {
        const guildId = interaction.guild.id;

        if (!serverConfigs.has(guildId)) {
            await interaction.reply({
                content: "❌ Aucun message automatique configuré pour ce serveur.",
                ephemeral: true,
            });
            return;
        }

        const config = serverConfigs.get(guildId);

        // Supprime uniquement les paramètres liés aux messages automatiques
        delete config.autoMessageChannel;
        delete config.autoMessageContent;
        delete config.autoMessageInterval;
        delete config.autoMessageEnabled;

        saveConfigs();

        await interaction.reply({
            content: `✅ La configuration des messages automatiques a été supprimée pour ce serveur.`,
            ephemeral: true,
        });
    },
};
