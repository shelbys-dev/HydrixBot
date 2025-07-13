const { EmbedBuilder } = require('discord.js');

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
    name: 'guildMemberAdd', // Nom de l'événement
    once: false, // true si l'événement ne se déclenche qu'une fois
    async execute(member) {
        // Envoie un message direct au nouveau membre
        member.send(`Salut ${member.user.username}, bienvenue dans **${member.guild.name}** ! Si tu as des questions, n’hésite pas à demander. 😊`).catch((error) => {
            console.error(`Impossible d'envoyer un DM à ${member.user.tag} :`, error.message);
        });

        // Accès au serveur via member.guild
        const logChannel = member.guild.channels.cache.find(ch => ch.name.toLowerCase() === 'logs');

        if (logChannel) {
            // Création de l'embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00) // Vert (tu peux utiliser une couleur HEX ou une constante comme 'Green')
                .setTitle('👋 **Nouveau membre**')
                .setDescription(`${member.user.tag} a rejoint le serveur ! 🎉`)
                .addFields(
                    { name: '🔗 ID du membre', value: `${member.id}` },
                    { name: '📊 Nombre total de membres', value: `${member.guild.memberCount}` }
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setFooter({ text: 'Bot codé par Shelby S. ! 🚀', iconURL: member.guild.iconURL({ dynamic: true }) })
                .setTimestamp();

            // Envoie de l'embed dans le channel "logs"
            logChannel.send({ embeds: [embed] });
        } else {
            console.error('Channel "logs" introuvable dans le serveur.');
        }

        const guildId = member.guild.id;

        try {
            // Connexion à la base de données
            const connection = await mysql.createConnection(dbConfig);

            // Récupère l'ID du rôle automatique configuré pour le serveur
            const [rows] = await connection.execute(
                `SELECT autorole FROM serverconfig WHERE server_id = ?`,
                [guildId]
            );

            await connection.end();

            if (rows.length === 0 || !rows[0].autorole) {
                console.log(`Aucun rôle automatique configuré pour le serveur ${guildId}.`);
                return;
            }

            const roleId = rows[0].autorole;
            const role = member.guild.roles.cache.get(roleId);

            // Vérifier si le rôle existe dans le cache des rôles du serveur
            if (!role) {
                console.error(`Le rôle avec l'ID ${roleId} n'existe pas dans le serveur ${guildId}.`);
                return;
            }

            // Ajouter le rôle au nouveau membre
            await member.roles.add(role);
            console.log(`Rôle automatique attribué au membre ${member.user.tag} sur le serveur ${member.guild.name}.`);
        } catch (error) {
            console.error('Erreur lors de l\'ajout de l\'autorole :', error);
        }
    },
};
