const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');

const db = require('../data/db'); // pool mysql2/promise :contentReference[oaicite:1]{index=1}

function isDev(userId) {
    const raw = String(process.env.DEV_ID || '').trim();
    if (!raw) return false;
    const list = raw.split(',').map(s => s.trim());
    return list.includes(userId);
}

module.exports = {
    category: 'Administration',
    data: new SlashCommandBuilder()
        .setName('xp')
        .setDescription('Administration XP')
        .addSubcommand(sc =>
            sc.setName('wipe')
                .setDescription("Vider l'XP de CE serveur (développeur uniquement)"))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // le slash s’affiche + check dev côté runtime
        .setDMPermission(false),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
        }
        const sub = interaction.options.getSubcommand(true);
        if (sub !== 'wipe') {
            return interaction.reply({ content: '❌ Sous-commande inconnue.', ephemeral: true });
        }

        // 🔐 Dev-only (ID(s) dans .env)
        if (!isDev(interaction.user.id)) {
            return interaction.reply({ content: '⛔ Commande réservée au développeur.', ephemeral: true });
        }

        const guild = interaction.guild;
        const guildId = guild.id;

        // 📄 Modal de confirmation
        const modal = new ModalBuilder()
            .setCustomId(`xp_wipe:${guildId}`)
            .setTitle('Confirmer la suppression de XP');

        const fieldA = new TextInputBuilder()
            .setCustomId('confirm_word')
            .setLabel('Tape EXACTEMENT : CONFIRMER')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('CONFIRMER');

        const fieldB = new TextInputBuilder()
            .setCustomId('confirm_guild')
            .setLabel(`Tape l’ID du serveur (${guildId})`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(guildId);

        modal.addComponents(
            new ActionRowBuilder().addComponents(fieldA),
            new ActionRowBuilder().addComponents(fieldB),
        );

        await interaction.showModal(modal);

        // ⏱️ Attente soumission
        let submitted;
        try {
            submitted = await interaction.awaitModalSubmit({
                time: 90_000,
                filter: i => i.customId === `xp_wipe:${guildId}` && i.user.id === interaction.user.id,
            });
        } catch {
            return; // timeout → rien à faire
        }

        const word = submitted.fields.getTextInputValue('confirm_word')?.trim();
        const gId = submitted.fields.getTextInputValue('confirm_guild')?.trim();

        if (word !== 'CONFIRMER' || gId !== guildId) {
            return submitted.reply({ content: '❌ Confirmation invalide.', ephemeral: true });
        }

        // 🧹 Transaction de purge ciblée sur CE serveur
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Récupérer serverconfig.id pour ce serveur
            // (table & colonnes d’après ton schéma) :contentReference[oaicite:2]{index=2}
            const [cfgRows] = await conn.query(
                'SELECT id FROM serverconfig WHERE server_id = ? LIMIT 1',
                [guildId]
            );

            if (!cfgRows.length) {
                await conn.rollback();
                return submitted.reply({ content: 'ℹ️ Aucun enregistrement serverconfig pour ce serveur.', ephemeral: true });
            }

            const serverconfigId = cfgRows[0].id;

            // Supprimer les liaisons levels_has_serverconfig pour CE serveur
            const [delLhs] = await conn.query(
                'DELETE FROM levels_has_serverconfig WHERE serverconfig_id = ?',
                [serverconfigId]
            );

            // Nettoyer les levels orphelins (plus aucune liaison)
            await conn.query(`
        DELETE l FROM levels l
        LEFT JOIN levels_has_serverconfig lhs ON lhs.levels_id = l.id
        WHERE lhs.levels_id IS NULL
      `);

            await conn.commit();

            // 🔔 Log optionnel dans #logs
            const log = guild.channels.cache.find(c => c.name && c.name.toLowerCase() === 'logs');
            if (log) {
                const emb = new EmbedBuilder()
                    .setColor(0xff5555)
                    .setTitle('🧹 Purge XP effectuée')
                    .setDescription(`Serveur : **${guild.name}**\nServerConfig ID : \`${serverconfigId}\``)
                    .addFields({ name: 'Liaisons supprimées', value: String(delLhs.affectedRows || 0), inline: true })
                    .setFooter({ text: `Par ${interaction.user.tag}` })
                    .setTimestamp();
                log.send({ embeds: [emb] }).catch(() => { });
            }

            return submitted.reply({
                content: `✅ XP purgé pour **${guild.name}**.\nLiaisons supprimées : **${delLhs.affectedRows || 0}**.`,
                ephemeral: true,
            });

        } catch (err) {
            try { await conn.rollback(); } catch { }
            console.error('[xp wipe] error:', err);
            return submitted.reply({ content: '❌ Erreur pendant la purge.', ephemeral: true });
        } finally {
            conn.release();
        }
    },
};
