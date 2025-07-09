const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { serverConfigs, loadConfigs, saveConfig, updateServerConfig } = require('../data/serverconfigs.js');

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
        .setName('config')
        .setDescription("Configurer différentes fonctionnalités pour ce serveur.")
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configurer un salon "logs" pour enregistrer les actions de modération 🚨')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('liens')
                .setDescription('Configurer ou mettre à jour les liens pour le serveur.')
                .addStringOption(option =>
                    option.setName('nom')
                        .setDescription('Le nom du lien (exemple : "Site Web").')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('L’URL du lien (exemple : https://example.com).')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('automessage')
                .setDescription('Configurer les messages automatiques pour ce serveur.')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Le canal où envoyer des messages automatiques.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Le contenu du message automatique.')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('interval')
                        .setDescription('Intervalle entre les messages (en secondes).')
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("roles")
                .setDescription("Configurer les noms des rôles Admin et Mute")
                .addStringOption((option) =>
                    option
                        .setName("admin_role")
                        .setDescription("Nom du rôle d'admin du serveur")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("mute_role")
                        .setDescription("Nom du rôle mute du serveur")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("voice")
                .setDescription("Configurer le salon de création de salons vocaux")
                .addStringOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("ID du salon où les utilisateurs peuvent créer leurs salons vocaux")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Afficher la configuration actuelle pour ce serveur.')
        ),
    async execute(interaction) {
        const guild = interaction.guild;
        const subcommand = interaction.options.getSubcommand(); // Sous-commande exécutée

        try {
            if (subcommand === 'setup') {
                // ------------------- SETUP (Salon Logs) ------------------- //
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({
                        content: "❌ Vous n'avez pas les permissions nécessaires pour exécuter cette commande.",
                        ephemeral: true,
                    });
                }

                // Vérifie si un salon "logs" existe
                const existingChannel = guild.channels.cache.find(ch => ch.name.toLowerCase() === 'logs');
                if (existingChannel) {
                    return interaction.reply({
                        content: '🛠️ Un canal "logs" existe déjà dans ce serveur.',
                        ephemeral: true,
                    });
                }

                // Crée un salon "logs"
                const logChannel = await guild.channels.create({
                    name: 'logs',
                    type: 0, // Salon texte
                    permissionOverwrites: [
                        {
                            id: guild.id, // Tout le monde
                            deny: ['ViewChannel'], // Cache le canal
                        },
                        {
                            id: interaction.member.id, // L'utilisateur
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                        {
                            id: guild.members.me.id, // Bot
                            allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageMessages'],
                        },
                    ],
                });

                await interaction.reply({
                    content: `✅ Le salon privé **#logs** a été créé avec succès.`,
                    ephemeral: true,
                });

                await logChannel.send("🔒 Ce salon est configuré pour enregistrer les actions de modération.");
            }

            // Commande pour gérer les liens
            if (subcommand === 'liens') {
                // ------------------- LIENS ------------------- //
                const guildId = interaction.guild.id;
                const name = interaction.options.getString('nom');
                const url = interaction.options.getString('url');

                // Vérification des permissions
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({
                        content: "❌ Vous n'avez pas les permissions nécessaires pour exécuter cette commande.",
                        ephemeral: true,
                    });
                }

                // Validation de l'URL
                if (!/^https?:\/\/.+\..+/i.test(url)) {
                    return interaction.reply({
                        content: '❌ URL invalide. Assurez-vous qu’elle commence par "http://" ou "https://".',
                        ephemeral: true,
                    });
                }

                // Logique pour enregistrer les liens dans la base de données
                try {
                    const connection = await mysql.createConnection(dbConfig);

                    // Vérifie si ce serveur a déjà une configuration dans `serverconfig`
                    const [serverConfig] = await connection.execute(
                        'SELECT id FROM serverconfig WHERE server_id = ?',
                        [guildId]
                    );

                    if (serverConfig.length === 0) {
                        return interaction.reply({
                            content: "❌ La configuration du serveur n'a pas encore été créée. Veuillez d'abord configurer le serveur.",
                            ephemeral: true,
                        });
                    }

                    const serverConfigId = serverConfig[0].id;

                    // Vérifie si un lien avec le même nom existe déjà dans `links_servers`
                    const [existingLink] = await connection.execute(
                        'SELECT id FROM links_servers WHERE serverconfig_id = ? AND name = ?',
                        [serverConfigId, name]
                    );

                    if (existingLink.length > 0) {
                        // Met à jour l'URL du lien existant
                        await connection.execute(
                            'UPDATE links_servers SET url = ?, update_at = NOW() WHERE id = ?',
                            [url, existingLink[0].id]
                        );

                        await interaction.reply({
                            content: `✅ Le lien **${name}** a été mis à jour avec succès !`,
                            ephemeral: true,
                        });

                        const logChannel = guild.channels.cache.find((ch) => ch.name.toLowerCase() === "logs");

                        if (logChannel) {
                            // Log de l'intervention
                            const update_links = new EmbedBuilder()
                                .setColor("f08f19") // Orange
                                .setTitle("🔗 Mise à jour 🔗")
                                .addFields(
                                    { name: "🔗 Lien mis à jour 🔗", value: `${name}` || "Aucun contenu trouvé" }
                                )
                                .setTimestamp();
                            logChannel.send({ embeds: [update_links] });
                        }
                    } else {
                        // Ajoute un nouveau lien
                        await connection.execute(
                            'INSERT INTO links_servers (serverconfig_id, name, url, create_at, update_at) VALUES (?, ?, ?, NOW(), NOW())',
                            [serverConfigId, name, url]
                        );

                        await interaction.reply({
                            content: `✅ Le lien **${name}** a été ajouté avec succès !`,
                            ephemeral: true,
                        });

                        const logChannel = guild.channels.cache.find((ch) => ch.name.toLowerCase() === "logs");

                        if (logChannel) {
                            // Log de l'intervention
                            const add_links = new EmbedBuilder()
                                .setColor("0x00FF00") // Vert
                                .setTitle("🔗 Ajout 🔗")
                                .addFields(
                                    { name: "🔗 Lien ajouté 🔗", value: `${name}` || "Aucun contenu trouvé" }
                                )
                                .setTimestamp();
                            logChannel.send({ embeds: [add_links] });
                        }
                    }

                    await connection.end();
                } catch (error) {
                    console.error('Erreur lors de la gestion des liens :', error);

                    return interaction.reply({
                        content: "❌ Une erreur s'est produite en enregistrant le lien dans la base de données.",
                        ephemeral: true,
                    });
                }
            }

            if (subcommand === 'automessage') {
                // ------------------- AUTOMESSAGE ------------------- //
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({
                        content: "❌ Vous n'avez pas les permissions nécessaires pour exécuter cette commande.",
                        ephemeral: true,
                    });
                }

                const channel = interaction.options.getChannel('channel');
                const message = interaction.options.getString('message');
                const interval = interaction.options.getInteger('interval') * 1000; // ms

                const guildId = guild.id;

                // Récupère ou initialise config serveur
                if (!serverConfigs.has(guildId)) {
                    serverConfigs.set(guildId, { links: [] });
                }

                const config = serverConfigs.get(guildId);

                // Mettre à jour la configuration
                config.autoMessageChannel = channel.id;
                config.autoMessageContent = message;
                config.autoMessageInterval = interval;
                config.autoMessageEnabled = true; // Activer automatiquement

                saveConfig();

                await interaction.reply({
                    content: `✅ **Messages automatiques configurés avec succès** :
                    - **Canal :** ${channel.name}
                    - **Message :** \`${message}\`
                    - **Intervalle :** ${interval / 1000}s`,
                    ephemeral: true,
                });

                // Notifie l'événement pour démarrer ou redémarrer le système
                interaction.client.emit('configUpdate', guildId);
            }

            if (subcommand === 'roles') {
                // ------------------- roles ------------------- //
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({
                        content: "❌ Vous n'avez pas les permissions nécessaires pour exécuter cette commande.",
                        ephemeral: true,
                    });
                }

                const serverId = interaction.guild.id;
                const adminRoleName = interaction.options.getString("admin_role");
                const muteRoleName = interaction.options.getString("mute_role");

                const guildId = guild.id;

                // Récupère ou initialise config serveur
                if (!serverConfigs.has(guildId)) {
                    serverConfigs.set(guildId, { links: [] });
                }

                // Mettre à jour les rôles si des valeurs sont fournies
                if (adminRoleName) {
                    updateServerConfig(serverId, "adminRoleName", adminRoleName);
                }

                if (muteRoleName) {
                    updateServerConfig(serverId, "mutedRoleName", muteRoleName);
                }

                const config = serverConfigs.get(guildId);

                // Mettre à jour la configuration
                config.adminRoleName = adminRoleName || config.adminRoleName || "Admin";
                config.muteRoleName = muteRoleName || config.mutedRoleName || "Muted";

                saveConfig();

                const logChannel = guild.channels.cache.find((ch) => ch.name.toLowerCase() === "logs");

                if (logChannel) {
                    // Log de l'intervention
                    const update_role = new EmbedBuilder()
                        .setColor("f08f19") // Orange
                        .setTitle("🔗 Configuration mise à jour 🔗")
                        .addFields(
                            { name: "🔗 Rôle Admin 🔗", value: `${adminRoleName || config.adminRoleName || "Aucun changement"}` },
                            { name: "🔗 Rôle Mute 🔗", value: `${muteRoleName || config.mutedRoleName || "Aucun changement"}` }
                        )
                        .setTimestamp();
                    logChannel.send({ embeds: [update_role] });
                }

                // Répondre à l'utilisateur
                return interaction.reply({
                    content: `✅ Configuration mise à jour :
                    - Rôle Admin : ${adminRoleName || config.adminRoleName || "Aucun changement"}
                    - Rôle Mute : ${muteRoleName || config.mutedRoleName || "Aucun changement"}`,
                    ephemeral: true, // Invisible pour les autres utilisateurs
                });
            }

            if (subcommand === 'voice') {
                // ------------------- voice ------------------- //
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({
                        content: "❌ Vous n'avez pas les permissions nécessaires pour exécuter cette commande.",
                        ephemeral: true,
                    });
                }

                const serverId = interaction.guild.id;
                const VoiceChannel = interaction.options.getString('channel');

                const guildId = guild.id;

                // Récupère ou initialise config serveur
                if (!serverConfigs.has(guildId)) {
                    serverConfigs.set(guildId, { links: [] });
                }

                // Mettre à jour les rôles si des valeurs sont fournies
                if (VoiceChannel) {
                    updateServerConfig(serverId, "VoiceChannel", VoiceChannel);
                }

                const config = serverConfigs.get(guildId);

                // Mettre à jour la configuration
                config.VoiceChannel = VoiceChannel || config.VoiceChannel || null;

                saveConfig();

                const logChannel = guild.channels.cache.find((ch) => ch.name.toLowerCase() === "logs");

                if (logChannel) {
                    // Log de l'intervention
                    const update_voicechannel = new EmbedBuilder()
                        .setColor("f08f19") // Orange
                        .setTitle("🔗 Configuration mise à jour 🔗")
                        .addFields(
                            { name: "🔗 Salon vocal 🔗", value: `${VoiceChannel || config.VoiceChannel || "Aucun changement"}` }
                        )
                        .setTimestamp();
                    logChannel.send({ embeds: [update_voicechannel] });
                }

                // Répondre à l'utilisateur
                return interaction.reply({
                    content: `✅ Configuration mise à jour :
                    - Salon vocal : ${VoiceChannel || config.VoiceChannel || "Aucun changement"}`,
                    ephemeral: true, // Invisible pour les autres utilisateurs
                });
            }

            if (subcommand === 'show') {
                // ------------------- SHOW ------------------- //
                const guildId = guild.id;
                const config = serverConfigs.get(guildId);

                if (!config) {
                    return interaction.reply({
                        content: '⚠️ Aucun paramètre n\'a été configuré pour ce serveur.',
                        ephemeral: true
                    });
                }

                // Prépare un message avec toutes les données configurées
                const {
                    links = [],
                    adminRoleName,
                    muteRoleName,
                    autoMessageContent,
                    autoMessageChannel,
                    autoMessageInterval,
                    VoiceChannel
                } = config;

                const embed = {
                    color: 0x0099ff,
                    title: `Configuration actuelle du serveur :`,
                    fields: [
                        {
                            name: '🔗 Liens configurés :', value: links.length > 0 ?
                                links.map(link => `- **${link.name}** : ${link.url}`).join('\n') :
                                'Aucun lien configuré', inline: false
                        },
                        {
                            name: '🔧 Rôles configurés :', value:
                                `- **Rôle Admin :** ${adminRoleName || 'Non défini'}\n- **Rôle Mute :** ${muteRoleName || 'Non défini'}`,
                            inline: false
                        },
                        {
                            name: '📩 Message automatique :', value:
                                autoMessageContent ?
                                    ` - **Message :** ${autoMessageContent}\n - **Canal :** <#${autoMessageChannel}>\n - **Intervalle :** ${autoMessageInterval / 1000}s` :
                                    'Non configuré',
                            inline: false
                        },
                        {
                            name: '🎙️ Salon vocal :', value:
                                VoiceChannel ? `<#${VoiceChannel}>` : 'Non configuré', inline: false
                        },
                    ],
                    timestamp: new Date(),
                    footer: { text: 'Voici les paramètres actuels.' },
                };

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                });
            }
        } catch (error) {
            console.error(`❌ Une erreur est survenue :`, error);
            await interaction.reply({
                content: "❌ Une erreur est survenue, contactez l'administrateur.",
                ephemeral: true,
            });
        }
    },
};
