const { SlashCommandBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

require('dotenv').config(); // Charger les variables d'environnement depuis le fichier .env

// Configuration de la base de données
const dbConfig = {
    host: process.env.DB_HOST, // Host de la base de données
    user: process.env.DB_USER, // Nom d'utilisateur MySQL
    password: process.env.DB_PASSWORD, // Mot de passe MySQL
    database: process.env.DB_NAME, // Nom de la base de données définie dans hydradev.sql
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-lien') // Nom de la commande
        .setDescription("Supprime un lien de la liste configurée pour ce serveur") // Description
        .addStringOption(option =>
            option.setName('nom')
                .setDescription("Nom du lien à supprimer (tel qu'affiché)") // Nom du champ optionnel
                .setRequired(true)
        ),
    async execute(interaction) {
        const guildId = interaction.guild.id; // ID du serveur
        const name = interaction.options.getString('nom'); // Nom du lien à supprimer

        try {
            // Connexion à la base de données
            const connection = await mysql.createConnection(dbConfig);

            // Récupérer l'ID du `serverconfig` correspondant à ce `guildId`
            const [serverConfigRows] = await connection.execute(
                `SELECT id FROM serverconfig WHERE server_id = ?`,
                [guildId]
            );

            // Vérifie si une configuration liée au serveur existe dans la base de données
            if (serverConfigRows.length === 0) {
                await connection.end();
                return interaction.reply({
                    content: '❌ Aucune configuration de serveur trouvée !',
                    ephemeral: true,
                });
            }

            const serverConfigId = serverConfigRows[0].id;

            // Supprimer le lien correspondant pour ce serveur
            const [deleteResult] = await connection.execute(
                `DELETE FROM links_servers WHERE serverconfig_id = ? AND name = ?`,
                [serverConfigId, name]
            );

            await connection.end(); // Fermer la connexion

            // Vérifier si quelque chose a été supprimé
            if (deleteResult.affectedRows === 0) {
                return interaction.reply({
                    content: `❌ Aucun lien portant le nom **${name}** n’a été trouvé.`,
                    ephemeral: true,
                });
            }

            const logChannel = guild.channels.cache.find((ch) => ch.name.toLowerCase() === "logs");

            if (logChannel) {
                // Log de l'intervention
                const update_links = new EmbedBuilder()
                    .setColor("FF0000") // Rouge
                    .setTitle("🔗 Suppression 🔗")
                    .addFields(
                        { name: "🔗 Lien supprimé : 🔗", value: `${name}` || "Aucun contenu trouvé" }
                    )
                    .setTimestamp();
                logChannel.send({ embeds: [update_links] });
            }

            // Confirmation de la suppression du lien
            await interaction.reply({
                content: `✅ Le lien **${name}** a été supprimé avec succès !`,
                ephemeral: true,
            });
        } catch (error) {
            console.error('Erreur lors de la suppression du lien :', error);

            // Gestion des erreurs
            return interaction.reply({
                content: "❌ Une erreur est survenue lors de la suppression du lien.",
                ephemeral: true,
            });
        }
    },
};
