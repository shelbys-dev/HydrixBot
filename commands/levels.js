const { SlashCommandBuilder } = require('discord.js');
const { userData } = require('../events/messagecreate.js'); // Importer les données utilisateur

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Affiche le classement des utilisateurs par niveau dans ce serveur.'),
    async execute(interaction) {
        const guildId = interaction.guild.id; // ID du serveur

        // Vérifier si des données existent pour ce serveur
        if (!userData[guildId] || Object.keys(userData[guildId]).length === 0) {
            return interaction.reply('⚠️ Aucune donnée utilisateur pour ce serveur.');
        }

        // Récupérer et trier les données utilisateur pour ce serveur
        const leaderboard = Object.entries(userData[guildId]) // Parcours les utilisateurs du serveur
            .sort(([, userA], [, userB]) => userB.level - userA.level || userB.xp - userA.xp) // Trier par niveau, puis XP
            .slice(0, 10) // Prendre les 10 meilleurs
            .map(([userId, { level, xp }], index) => // Construire l'affichage
                `${index + 1}. <@${userId}> - Niveau ${level} (${xp} XP)`
            )
            .join('\n');

        // Répondre avec le leaderboard
        interaction.reply(`🏆 **Leaderboard des utilisateurs sur ce serveur :**\n\n${leaderboard}`);
    },
};
