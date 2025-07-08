const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
        .setName('liens') // Nom de la commande
        .setDescription('Affiche la liste des liens utiles ou configurés par les administrateurs'), // Description de la commande

    async execute(interaction) {
        const guildId = interaction.guild.id;

        try {
            // Connexion à la base de données
            const connection = await mysql.createConnection(dbConfig);

            // Récupérer les liens pour ce serveur
            const [links] = await connection.execute(
                `
                SELECT ls.name, ls.url 
                FROM links_servers ls
                JOIN serverconfig sc ON sc.id = ls.serverconfig_id
                WHERE sc.server_id = ?
                `,
                [guildId]
            );
            await connection.end();

            // Si aucun lien n'est configuré, afficher les liens par défaut
            if (links.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#1c5863')
                            .setTitle('Liens Utiles')
                            .setDescription('Voici une liste des liens par défaut :')
                            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 1024 })) // Icône du bot
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
            const links_servers = new EmbedBuilder()
                .setColor('#1c5863') // Couleur de l'embed
                .setTitle('Liens Utiles') // Titre
                .setDescription('Voici une liste des liens configurés :') // Description
                .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 1024 })) // Icône du bot
                .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
                .setTimestamp();

            // Ajouter chaque lien en champ
            links.forEach(link => {
                links_servers.addFields({ name: link.name, value: `${link.url}`, inline: false });
            });

            const clclinks = new EmbedBuilder()
                .setColor('#1c5863') // Couleur de l'embed
                .setTitle('Liens Utiles') // Titre
                .setDescription('Recherche des liens...') // Description
                .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 1024 })) // Icône du bot
                .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
                .setTimestamp();

            await interaction.reply({ embeds: [clclinks], fetchReply: true, ephemeral: true });

            // Répondre à l'utilisateur avec l'embed
            await interaction.editReply({
                embeds: [links_servers],
                ephemeral: true, // Visible uniquement par l'utilisateur
            });
        } catch (error) {
            console.error('Erreur lors de la récupération des liens :', error);

            return interaction.reply({
                content: "❌ Une erreur est survenue lors de la récupération des liens.",
                ephemeral: true,
            });
        }
    },
};
