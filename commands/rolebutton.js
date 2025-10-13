const {
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

// DB
const db = require('../data/db');

async function getOrCreateServerConfigId(guildId) {
    const [rows] = await db.query('SELECT id FROM serverconfig WHERE server_id = ? LIMIT 1', [guildId]);
    if (rows.length) return rows[0].id;
    const [res] = await db.query('INSERT INTO serverconfig (server_id) VALUES (?)', [guildId]);
    return res.insertId;
}

async function listConfigRoles(guildId) {
    const scId = await getOrCreateServerConfigId(guildId);
    const [rows] = await db.query(
        'SELECT id, role_id, label, emoji, style FROM role_buttons WHERE serverconfig_id = ? ORDER BY id ASC',
        [scId]
    );
    return rows;
}

function toBtnStyle(styleStr) {
    switch ((styleStr || 'Secondary')) {
        case 'Primary': return ButtonStyle.Primary;
        case 'Success': return ButtonStyle.Success;
        case 'Danger': return ButtonStyle.Danger;
        default: return ButtonStyle.Secondary;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rolebutton')
        .setDescription('Configurer et publier un panel de rôles à boutons')
        .addSubcommand(s =>
            s.setName('add').setDescription('Ajouter un rôle cliquable')
                .addRoleOption(o => o.setName('role').setDescription('Rôle à rendre cliquable').setRequired(true))
                .addStringOption(o => o.setName('label').setDescription('Texte du bouton (facultatif)'))
                .addStringOption(o => o.setName('emoji').setDescription('Emoji (unicode ou <:name:id>)'))
                .addStringOption(o => o
                    .setName('style')
                    .setDescription('Style du bouton')
                    .addChoices(
                        { name: 'Primaire', value: 'Primary' },
                        { name: 'Secondaire', value: 'Secondary' },
                        { name: 'Succès', value: 'Success' },
                        { name: 'Danger', value: 'Danger' },
                    )
                )
        )
        .addSubcommand(s =>
            s.setName('remove').setDescription('Retirer un rôle de la config')
                .addRoleOption(o => o.setName('role').setDescription('Rôle à retirer').setRequired(true))
        )
        .addSubcommand(s => s.setName('list').setDescription('Lister les rôles configurés'))
        .addSubcommand(s =>
            s.setName('clear').setDescription('Vider tous les rôles configurés')
        )
        .addSubcommand(s =>
            s.setName('panel').setDescription('Envoyer le panel de rôles')
                .addChannelOption(o => o.setName('channel').setDescription('Salon où envoyer (sinon ici)'))
                .addStringOption(o => o.setName('titre').setDescription('Titre de l’embed'))
                .addStringOption(o => o.setName('description').setDescription('Description de l’embed'))
        ),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
        }
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const guildId = guild.id;

        // list est visible par tous (éphemère), le reste admin-only
        if (!isAdmin && sub !== 'list') {
            return interaction.reply({ content: "❌ Permission administrateur requise.", ephemeral: true });
        }

        try {
            if (sub === 'add') {
                const role = interaction.options.getRole('role', true);
                const label = interaction.options.getString('label')?.trim() || role.name;
                const emoji = interaction.options.getString('emoji')?.trim() || null;
                const styleStr = interaction.options.getString('style') || 'Secondary';

                const scId = await getOrCreateServerConfigId(guildId);
                await db.query(
                    `INSERT INTO role_buttons (serverconfig_id, role_id, label, emoji, style)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE label=VALUES(label), emoji=VALUES(emoji), style=VALUES(style), update_at=NOW()`,
                    [scId, role.id, label, emoji, styleStr]
                );

                return interaction.reply({ content: `✅ **${role.name}** ajouté à la config (bouton: “${label}”).`, ephemeral: true });
            }

            if (sub === 'remove') {
                const role = interaction.options.getRole('role', true);
                const scId = await getOrCreateServerConfigId(guildId);
                const [res] = await db.query(
                    'DELETE FROM role_buttons WHERE serverconfig_id = ? AND role_id = ?',
                    [scId, role.id]
                );
                return interaction.reply({ content: res.affectedRows ? `✅ **${role.name}** retiré de la config.` : `ℹ️ **${role.name}** n’était pas configuré.`, ephemeral: true });
            }

            if (sub === 'clear') {
                const scId = await getOrCreateServerConfigId(guildId);
                await db.query('DELETE FROM role_buttons WHERE serverconfig_id = ?', [scId]);
                return interaction.reply({ content: '✅ Configuration vidée.', ephemeral: true });
            }

            if (sub === 'list') {
                const rows = await listConfigRoles(guildId);
                if (!rows.length) return interaction.reply({ content: 'ℹ️ Aucun rôle configuré pour les boutons.', ephemeral: true });

                const e = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('Rôles configurés (role buttons)')
                    .setDescription(
                        rows.map((r, i) => {
                            const label = r.label || '—';
                            const style = r.style || 'Secondary';
                            const emoji = r.emoji ? `${r.emoji} ` : '';
                            return `**${i + 1}.** <@&${r.role_id}> — bouton: \`${label}\` (${style}) ${emoji}`;
                        }).join('\n')
                    )
                    .setTimestamp();
                return interaction.reply({ embeds: [e], ephemeral: true });
            }

            if (sub === 'panel') {
                const sendIn = interaction.options.getChannel('channel') || interaction.channel;
                const title = interaction.options.getString('titre')?.trim() || '🎛️ Choix des rôles';
                const desc = interaction.options.getString('description')?.trim()
                    || 'Clique sur un bouton pour **ajouter/retirer** le rôle correspondant.';

                const rows = await listConfigRoles(guildId);
                if (!rows.length) return interaction.reply({ content: '❌ Aucun rôle configuré. Utilise `/rolebutton add`.', ephemeral: true });

                // Discord limite à 25 boutons par message ; 5 par ligne.
                const MAX_BTNS = 25;
                const items = rows.slice(0, MAX_BTNS);

                const components = [];
                for (let i = 0; i < items.length; i += 5) {
                    const slice = items.slice(i, i + 5);
                    const row = new ActionRowBuilder();
                    row.addComponents(
                        ...slice.map(r => {
                            const btn = new ButtonBuilder()
                                .setCustomId(`rb:toggle:${guildId}:${r.role_id}`)
                                .setLabel(r.label || 'Rôle')
                                .setStyle(toBtnStyle(r.style));
                            if (r.emoji) {
                                // Accepte unicode ou <a?:name:id>
                                const m = r.emoji.match(/^<a?:\w+:(\d+)>$/);
                                if (m) btn.setEmoji({ id: m[1] }); else btn.setEmoji(r.emoji);
                            }
                            return btn;
                        })
                    );
                    components.push(row);
                }

                const embed = new EmbedBuilder()
                    .setColor(0x2f3136)
                    .setTitle(title)
                    .setDescription(desc)
                    .setFooter({ text: 'Clique à nouveau pour retirer le rôle.' })
                    .setTimestamp();

                await sendIn.send({ embeds: [embed], components });
                return interaction.reply({ content: `✅ Panel envoyé dans <#${sendIn.id}>.`, ephemeral: true });
            }

            return interaction.reply({ content: '❌ Sous-commande inconnue.', ephemeral: true });
        } catch (err) {
            console.error('rolebutton cmd error:', err);
            return interaction.reply({ content: '❌ Erreur pendant la commande.', ephemeral: true });
        }
    }
};
