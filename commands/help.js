const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche la liste des commandes disponibles.'),
    async execute(interaction) {
        const commands = interaction.client.commands.map(cmd => `**/${cmd.data.name}** - ${cmd.data.description}`);
        await interaction.reply({
            content: `📖 Voici la liste des commandes disponibles :\n${commands.join('\n')}`,
            ephemeral: true,
        });
    },
};
