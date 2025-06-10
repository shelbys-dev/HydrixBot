module.exports = {
    name: 'interactionCreate', // Nom de l'événement
    once: false, // Cet événement se déclenche plusieurs fois
    async execute(interaction) {
        if (!interaction.isCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'exécution de la commande.',
                ephemeral: true,
            });
        }
    },
};
