// commands/rank.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../data/db');

// même formule que ton système d’XP (cohérence)
function nextLevelThreshold(level) {
    return 5 * Math.pow(level, 2) + 50; // cf. messagecreate.js
}

// jolie barre de progression texte (20 segments)
function progressBar(current, total, size = 20) {
    if (!total || total <= 0) return '—';
    const ratio = Math.max(0, Math.min(1, current / total));
    const filled = Math.round(ratio * size);
    const empty = size - filled;
    return `【${'■'.repeat(filled)}${'·'.repeat(empty)}】 ${(ratio * 100).toFixed(0)}%`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Affiche ton niveau et ta progression XP sur ce serveur')
        .addUserOption(opt =>
            opt.setName('membre')
                .setDescription('Membre dont afficher le rang (facultatif)')
                .setRequired(false)
        )
        .addBooleanOption(opt =>
            opt.setName('prive')
                .setDescription('Répondre en éphémère (visible seulement par toi) ?')
                .setRequired(false)
        ),

    async execute(interaction) {
        const guild = interaction.guild;
        if (!guild) {
            return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un serveur.', ephemeral: true });
        }

        const target = interaction.options.getUser('membre') || interaction.user;
        const ephemeral = interaction.options.getBoolean('prive') ?? false;

        await interaction.deferReply({ ephemeral });

        try {
            // 1) Récupération du serverconfig.id pour ce serveur
            const [srvRows] = await db.query(
                'SELECT id FROM serverconfig WHERE server_id = ? LIMIT 1',
                [guild.id]
            );
            if (!srvRows.length) {
                // si aucun backfill n’a encore créé la ligne pour ce serveur
                return interaction.editReply('❌ Aucune configuration serveur détectée pour ce serveur.');
            }
            const serverConfigId = srvRows[0].id;

            // 2) Récupérer le niveau/XP pour ce membre sur CE serveur
            const [rows] = await db.query(
                `
        SELECT l.id, l.xp, l.level
        FROM levels l
        JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
        WHERE ls.serverconfig_id = ? AND l.user_id = ?
        LIMIT 1
        `,
                [serverConfigId, target.id]
            );

            let level = 1;
            let xp = 0;
            let hasEntry = false;

            if (rows.length) {
                level = rows[0].level;
                xp = rows[0].xp;
                hasEntry = true;
            }

            const threshold = nextLevelThreshold(level);
            const bar = progressBar(xp, threshold, 20);

            // 3) Calcul de la position (classement) et du total
            // position = 1 + nombre de joueurs qui ont un meilleur classement (level strictement supérieur OU même level et plus d’XP)
            const [[{ position }]] = await db.query(
                `
        SELECT
          (SELECT COUNT(*) FROM levels l2
            JOIN levels_has_serverconfig ls2 ON ls2.levels_id = l2.id
           WHERE ls2.serverconfig_id = ?
             AND (l2.level > ? OR (l2.level = ? AND l2.xp > ?))
          ) + 1 AS position
        `,
                [serverConfigId, level, level, xp]
            );

            const [[{ total }]] = await db.query(
                `
        SELECT COUNT(*) AS total
        FROM levels l
        JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
        WHERE ls.serverconfig_id = ?
        `,
                [serverConfigId]
            );

            // Si l’utilisateur n’a jamais gagné d’XP (aucune ligne), on peut l’afficher “Non classé”
            const rankText = hasEntry && total > 0 ? `#${position} / ${total}` : 'Non classé';

            // 4) Embed propre
            const emb = new EmbedBuilder()
                .setAuthor({ name: `${target.username}`, iconURL: target.displayAvatarURL({ size: 128 }) })
                .setTitle('🎖️ Rang & Progression')
                .setColor(0x8a2be2)
                .addFields(
                    { name: 'Niveau', value: `**${level}**`, inline: true },
                    { name: 'XP', value: `**${xp}** / **${threshold}**`, inline: true },
                    { name: 'Classement', value: rankText, inline: true },
                    { name: 'Progression', value: bar }
                )
                .setFooter({ text: `Serveur: ${guild.name}` })
                .setTimestamp();

            // 5) Bonus : indiquer si le système XP est coupé (lecture seule)
            const [[cfg]] = await db.query(
                'SELECT xp_enabled FROM serverconfig WHERE id = ? LIMIT 1',
                [serverConfigId]
            );
            if (!cfg?.xp_enabled) {
                emb.setDescription('⚠️ Le système d’XP est actuellement **désactivé** sur ce serveur.\nLes stats s’affichent, mais aucun gain de nouvelle XP.');
            }

            await interaction.editReply({ embeds: [emb] });
        } catch (err) {
            console.error('/rank error:', err);
            await interaction.editReply('❌ Une erreur est survenue lors de la récupération du rang.');
        }
    }
};
