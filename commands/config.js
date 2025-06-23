const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { serverConfigs, saveConfigs, updateServerConfig } = require('../data/serverconfigs.js');

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

            if (subcommand === 'liens') {
                // ------------------- LIENS ------------------- //
                const guildId = interaction.guild.id;
                const name = interaction.options.getString('nom');
                const url = interaction.options.getString('url');

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({
                        content: "❌ Vous n'avez pas les permissions nécessaires pour exécuter cette commande.",
                        ephemeral: true,
                    });
                }

                // Valide l'URL
                if (!/^https?:\/\/.+\..+/i.test(url)) {
                    return interaction.reply({
                        content: '❌ URL invalide. Assurez-vous qu’elle commence par "http://" ou "https://".',
                        ephemeral: true,
                    });
                }

                // Récupère ou initialise config serveur
                const serverConfig = serverConfigs.get(guildId) || { links: [] };

                // Ajoute ou met à jour un lien
                const existingIndex = serverConfig.links.findIndex(link => link.name === name);
                if (existingIndex > -1) {
                    serverConfig.links[existingIndex].url = url; // Met à jour le lien
                } else {
                    serverConfig.links.push({ name, url }); // Ajoute un nouveau lien
                }

                serverConfigs.set(guildId, serverConfig);
                saveConfigs();

                await interaction.reply({
                    content: `✅ Le lien **${name}** a été configuré avec succès !`,
                    ephemeral: true,
                });
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

                saveConfigs();

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

                saveConfigs();

                // Répondre à l'utilisateur
                return interaction.reply({
                    content: `✅ Configuration mise à jour :
                    - Rôle Admin : ${adminRoleName || config.adminRoleName || "Aucun changement"}
                    - Rôle Mute : ${muteRoleName || config.mutedRoleName || "Aucun changement"}`,
                    ephemeral: true, // Invisible pour les autres utilisateurs
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
