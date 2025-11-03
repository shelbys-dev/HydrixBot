const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    category: 'Modération',
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprime les messages d’un utilisateur dans le salon')
        .addUserOption(option =>
            option.setName('membre')
                .setDescription('Le membre dont supprimer les messages')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('nombre')
                .setDescription('Nombre de messages à analyser (max 100)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const member = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('nombre');

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: "❌ Vous n'avez pas la permission de gérer les messages.", ephemeral: true });
        }

        if (amount < 1 || amount > 100) {
            return interaction.reply({ content: "⚠️ Vous devez choisir un nombre entre 1 et 100.", ephemeral: true });
        }

        try {
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            const toDelete = messages.filter(msg => msg.author.id === member.id);

            await interaction.channel.bulkDelete(toDelete, true);

            return interaction.reply({
                content: `✅ ${toDelete.size} message(s) de **${member.tag}** ont été supprimés.`,
                ephemeral: false
            });
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: "❌ Erreur lors de la suppression des messages.", ephemeral: true });
        }
    }
};
