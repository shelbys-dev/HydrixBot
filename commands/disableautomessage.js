const { SlashCommandBuilder } = require('discord.js');
const { serverConfigs, saveConfigs } = require('../data/serverconfigs.js');

module.exports = {
    category: 'Configuration',
    data: new SlashCommandBuilder()
        .setName('disableautomessage')
        .setDescription('Désactiver les messages automatiques pour ce serveur.'),
    async execute(interaction) {
        const guildId = interaction.guild.id;

        if (!serverConfigs.has(guildId)) {
            await interaction.reply({
                content: "❌ Aucun message automatique à désactiver pour ce serveur.",
                ephemeral: true,
            });
            return;
        }

        const config = serverConfigs.get(guildId);
        if (!config.autoMessageEnabled) {
            await interaction.reply({
                content: "⚠️ Les messages automatiques sont déjà désactivés.",
                ephemeral: true,
            });
            return;
        }

        // Désactiver les messages automatiques
        config.autoMessageEnabled = false;
        saveConfigs();

        // Émettre l'événement pour synchroniser les intervalles
        interaction.client.emit('configUpdate', guildId);

        await interaction.reply({
            content: "✅ Les messages automatiques ont été désactivés pour ce serveur.",
            ephemeral: true,
        });
    },
};
