// commands/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../data/db');

// Récupérer serverconfig.id pour ce serveur
async function getServerConfigId(guildId) {
    const [rows] = await db.query('SELECT id, xp_enabled FROM serverconfig WHERE server_id = ? LIMIT 1', [guildId]);
    if (!rows.length) return { id: null, xpEnabled: 0 };
    return { id: rows[0].id, xpEnabled: rows[0].xp_enabled ? 1 : 0 };
}

// Compte total de joueurs liés à ce serveur
async function countPlayers(serverConfigId) {
    const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total
     FROM levels l
     JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
     WHERE ls.serverconfig_id = ?`,
        [serverConfigId]
    );
    return total || 0;
}

// Page du leaderboard
async function fetchPage(serverConfigId, page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;
    const [rows] = await db.query(
        `SELECT l.user_id, l.level, l.xp
     FROM levels l
     JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
     WHERE ls.serverconfig_id = ?
     ORDER BY l.level DESC, l.xp DESC, l.id ASC
     LIMIT ? OFFSET ?`,
        [serverConfigId, pageSize, offset]
    );
    return rows;
}

// Formate une ligne du classement
function formatEntry(rankNumber, tag, level, xp) {
    return `**#${rankNumber}** — ${tag} • **Lvl ${level}** • ${xp} XP`;
}

// Construit l’embed
function buildEmbed({ guild, page, pages, total, items, title = '🏆 Leaderboard', xpEnabled }) {
    const emb = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x8a2be2)
        .setFooter({ text: `Serveur: ${guild.name} • Page ${page}/${pages}` })
        .setTimestamp();

    if (!total) {
        emb.setDescription('Aucun joueur classé pour le moment.');
    } else {
        emb.setDescription(items.join('\n'));
        emb.addFields(
            { name: 'Total joueurs classés', value: String(total), inline: true },
            { name: 'Système XP', value: xpEnabled ? '✅ Activé' : '❌ Désactivé', inline: true },
        );
        if (!xpEnabled) {
            emb.setFooter({ text: `Serveur: ${guild.name} • Page ${page}/${pages} • XP désactivée` });
        }
    }
    return emb;
}

// Construit la rangée de boutons
function buildRow({ page, pages, guildId }) {
    const prev = new ButtonBuilder()
        .setCustomId(`lb_prev:${guildId}:${page}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('◀️ Précédent')
        .setDisabled(page <= 1);

    const next = new ButtonBuilder()
        .setCustomId(`lb_next:${guildId}:${page}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('▶️ Suivant')
        .setDisabled(page >= pages);

    return new ActionRowBuilder().addComponents(prev, next);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Affiche le classement des joueurs par niveau sur ce serveur')
        .addIntegerOption(o =>
            o.setName('page')
                .setDescription('Page à afficher (1 par défaut)')
                .setMinValue(1)
                .setRequired(false)
        )
        .addBooleanOption(o =>
            o.setName('prive')
                .setDescription('Répondre en éphémère (visible seulement par toi) ?')
                .setRequired(false)
        ),

    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) {
            return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
        }

        const requestedPage = interaction.options.getInteger('page') ?? 1;
        const ephemeral = interaction.options.getBoolean('prive') ?? false;

        await interaction.deferReply({ ephemeral });

        try {
            // 1) Récup serverconfig + flag xp
            const { id: serverConfigId, xpEnabled } = await getServerConfigId(guild.id);
            if (!serverConfigId) {
                return interaction.editReply('❌ Aucune configuration serveur détectée pour ce serveur.');
            }

            // 2) Total & pagination
            const total = await countPlayers(serverConfigId);
            const pageSize = 10;
            const pages = Math.max(1, Math.ceil(total / pageSize));
            let page = Math.min(Math.max(1, requestedPage), pages);

            // 3) Charger la page
            const rows = await fetchPage(serverConfigId, page, pageSize);

            // 4) Récupérer les tags/pseudos lisibles
            // On fetch uniquement ce dont on a besoin, fallback = mention
            const uniqueUserIds = [...new Set(rows.map(r => r.user_id))];
            const memberMap = new Map();
            try {
                // fetch par lot: Guild#members.fetch accepte un tableau d’IDs
                const fetched = await guild.members.fetch({ user: uniqueUserIds, withPresences: false });
                fetched.forEach(m => memberMap.set(m.user.id, m));
            } catch {
                // ignore si certains manquent
            }

            // 5) Construire les lignes formatées
            const startRank = (page - 1) * pageSize + 1;
            const lines = rows.map((r, idx) => {
                const mm = memberMap.get(r.user_id);
                const tag = mm ? (mm.displayName || mm.user.username) : `<@${r.user_id}>`;
                return formatEntry(startRank + idx, tag, r.level, r.xp);
            });

            // 6) Embed + boutons
            const embed = buildEmbed({ guild, page, pages, total, items: lines, xpEnabled });
            const row = buildRow({ page, pages, guildId: guild.id });

            const msg = await interaction.editReply({ embeds: [embed], components: [row] });

            // 7) Collector boutons
            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 2 * 60 * 1000, // 2 min
                filter: i => i.user.id === interaction.user.id // contrôle : seul l'appelant page
            });

            collector.on('collect', async (i) => {
                try {
                    const [kind, gId, currentPageStr] = i.customId.split(':');
                    if (gId !== guild.id) return i.deferUpdate().catch(() => { });
                    const currentPage = parseInt(currentPageStr, 10) || 1;

                    let nextPage = currentPage;
                    if (kind === 'lb_prev') nextPage = Math.max(1, currentPage - 1);
                    if (kind === 'lb_next') nextPage = Math.min(pages, currentPage + 1);
                    if (nextPage === currentPage) return i.deferUpdate().catch(() => { });

                    // re-fetch page
                    const pageRows = await fetchPage(serverConfigId, nextPage, pageSize);

                    // refresh names (au cas où)
                    const ids = [...new Set(pageRows.map(r => r.user_id))];
                    const mm = new Map();
                    try {
                        const fetched = await guild.members.fetch({ user: ids, withPresences: false });
                        fetched.forEach(m => mm.set(m.user.id, m));
                    } catch { }

                    const startRank2 = (nextPage - 1) * pageSize + 1;
                    const lines2 = pageRows.map((r, idx) => {
                        const m = mm.get(r.user_id);
                        const tag = m ? (m.displayName || m.user.username) : `<@${r.user_id}>`;
                        return formatEntry(startRank2 + idx, tag, r.level, r.xp);
                    });

                    const embed2 = buildEmbed({ guild, page: nextPage, pages, total, items: lines2, xpEnabled });
                    const row2 = buildRow({ page: nextPage, pages, guildId: guild.id });

                    await i.update({ embeds: [embed2], components: [row2] });
                } catch (err) {
                    console.error('leaderboard button error:', err);
                    try { await i.deferUpdate(); } catch { }
                }
            });

            collector.on('end', async () => {
                try { await interaction.editReply({ components: [] }); } catch { }
            });

        } catch (err) {
            console.error('/leaderboard error:', err);
            await interaction.editReply('❌ Une erreur est survenue lors de la récupération du leaderboard.');
        }
    }
};
