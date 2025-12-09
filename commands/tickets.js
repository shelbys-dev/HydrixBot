const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

// DB
const db = require('../data/db');

module.exports = {
    category: 'Tickets',
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Système de support par tickets')
        .addSubcommand(s =>
            s.setName('panel')
                .setDescription('Publier le panneau pour ouvrir un ticket')
        )
        .addSubcommand(s =>
            s.setName('export')
                .setDescription('Exporter le transcript Markdown d’un ticket (sélection interactive)')
        )
        .addSubcommandGroup(g =>
            g.setName('role').setDescription('Configurer le rôle staff pour l’accès aux tickets')
                .addSubcommand(s =>
                    s.setName('set')
                        .setDescription('Définir le rôle qui a accès aux tickets')
                        .addRoleOption(o =>
                            o.setName('role')
                                .setDescription('Rôle staff tickets')
                                .setRequired(true)
                        )
                )
                .addSubcommand(s =>
                    s.setName('clear')
                        .setDescription('Supprimer le rôle staff tickets (fallback administrateurs)')
                )
        ),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
        }
        if (interaction.options.getSubcommand() === 'panel') {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isAdmin) {
                return interaction.reply({ content: "❌ Permission administrateur requise.", ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎫 Support — Ouvrir un ticket')
                .setDescription(
                    "Besoin d'aide ?\nClique sur le bouton ci-dessous pour créer un ticket privé avec l’équipe."
                )
                .setFooter({ text: 'Les tickets sont visibles par les admins et vous uniquement.' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_open:${interaction.guild.id}`)
                    .setLabel('Ouvrir un ticket')
                    .setEmoji('📩')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ content: '✅ Panneau envoyé (éphémère).', ephemeral: true });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }

        if (interaction.options.getSubcommand() === 'export') {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isAdmin) {
                return interaction.reply({ content: "❌ Seuls les administrateurs peuvent exporter un transcript.", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // On envoie un “squelette” éphémère; l’UI (menu + pagination) sera fournie par l’event handler
            return interaction.editReply({
                content: "Sélectionne un ticket à exporter :",
                components: [
                    // placeholders; ils seront remplacés par l’event handler via editReply()
                ],
            });
        }

        // -------- /ticket role set|clear --------
        if (interaction.options.addSubcommandGroup() === 'role') {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isAdmin) {
                return interaction.reply({ content: "❌ Seuls les administrateurs peuvent modifier ce réglage.", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // helper pour récupérer/insérer la config serveur
            async function getOrCreateServerConfigId(guildId) {
                const [rows] = await db.query('SELECT id FROM serverconfig WHERE server_id = ? LIMIT 1', [guildId]);
                if (rows.length) return rows[0].id;
                const [res] = await db.query('INSERT INTO serverconfig (server_id) VALUES (?)', [guildId]);
                return res.insertId;
            }

            const serverconfigId = await getOrCreateServerConfigId(interaction.guild.id);

            if (interaction.options.getSubcommand() === 'set') {
                const role = interaction.options.getRole('role', true);
                // vérification basique : rôle appartient à la guilde
                if (role.guild.id !== interaction.guild.id) {
                    return interaction.editReply('❌ Ce rôle n’appartient pas à ce serveur.');
                }

                await db.query('UPDATE serverconfig SET ticket_role_id = ? WHERE id = ?', [role.id, serverconfigId]);
                return interaction.editReply(`✅ Le rôle **@${role.name}** a été défini comme **staff tickets**.\nLes nouveaux tickets seront visibles par ce rôle + les administrateurs.`);
            }

            if (interaction.options.getSubcommand() === 'clear') {
                await db.query('UPDATE serverconfig SET ticket_role_id = NULL WHERE id = ?', [serverconfigId]);
                return interaction.editReply('✅ Rôle staff tickets **supprimé**. Fallback : **administrateurs uniquement**.');
            }
        }
    },
};
