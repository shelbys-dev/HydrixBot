const { SlashCommandBuilder } = require('discord.js');
const { serverConfigs, saveConfigs } = require('../data/serverconfigs.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enableautomessage')
        .setDescription('Activer les messages automatiques pour ce serveur.'),
    async execute(interaction) {
        const guildId = interaction.guild.id;

        if (!serverConfigs.has(guildId)) {
            await interaction.reply({
                content: "❌ Aucun message automatique n'est configuré pour ce serveur.",
                ephemeral: true,
            });
            return;
        }

        const config = serverConfigs.get(guildId);

        if (!config.autoMessageChannel || !config.autoMessageContent || !config.autoMessageInterval) {
            await interaction.reply({
                content: "⚠️ La configuration des messages automatiques est incomplète. Utilisez `/configautomessage` pour définir la configuration.",
                ephemeral: true,
            });
            return;
        }

        if (config.autoMessageEnabled) {
            await interaction.reply({
                content: "⚠️ Les messages automatiques sont déjà activés.",
                ephemeral: true,
            });
            return;
        }

        // Désactiver les messages automatiques
        config.autoMessageEnabled = true;
        saveConfigs();

        // Émettre l'événement pour synchroniser les intervalles
        interaction.client.emit('configUpdate', guildId);

        await interaction.reply({
            content: `✅ Les messages automatiques ont été activés pour ce serveur.`,
            ephemeral: true,
        });
    },
};
