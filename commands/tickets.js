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
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Système de support par tickets')
        .addSubcommand(s =>
            s.setName('panel')
                .setDescription('Publier le panneau pour ouvrir un ticket')
        )
        .addSubcommand(s =>
            s.setName('export')
                .setDescription('Exporter le transcript Markdown d’un ticket')
                .addIntegerOption(o =>
                    o.setName('id')
                        .setDescription('ID du ticket (colonne tickets.id)')
                        .setRequired(true)
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

            const ticketId = interaction.options.getInteger('id', true);
            await interaction.deferReply({ ephemeral: true });

            const [rows] = await db.query(
                `SELECT t.id, t.channel_id, t.created_at, t.closed_at, t.transcript_md, sc.server_id
       FROM tickets t
       JOIN serverconfig sc ON sc.id = t.serverconfig_id
      WHERE t.id = ?
      LIMIT 1`,
                [ticketId]
            );

            if (!rows.length) {
                return interaction.editReply(`❌ Ticket #${ticketId} introuvable.`);
            }

            const t = rows[0];
            if (!t.transcript_md || t.transcript_md.length === 0) {
                return interaction.editReply(`ℹ️ Le ticket #${ticketId} n’a pas encore de transcript enregistré (probablement pas fermé).`);
            }

            // --- Helper: split par taille (UTF-8) en respectant les sauts de ligne si possible
            const CHUNK_LIMIT = Math.floor(7.5 * 1024 * 1024); // ~7.5MB sécurité < 8MB
            function splitTranscriptMarkdown(md, limitBytes) {
                const parts = [];
                const encoder = new TextEncoder();
                const lines = md.split('\n');

                let current = '';
                let currentBytes = 0;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i] + (i < lines.length - 1 ? '\n' : '');
                    const bytes = encoder.encode(line).length;

                    if (bytes > limitBytes) {
                        // Ligne énorme -> découpe brutale par tranches d’octets
                        let remaining = line;
                        while (encoder.encode(remaining).length > limitBytes) {
                            // on cherche une fenêtre qui tient
                            let low = 0, high = remaining.length, mid, slice = remaining;
                            // binary search approx pour rester performant
                            while (low < high) {
                                mid = Math.floor((low + high) / 2);
                                const seg = remaining.slice(0, mid);
                                const size = encoder.encode(seg).length;
                                if (size <= limitBytes) low = mid + 1; else high = mid;
                            }
                            const seg = remaining.slice(0, low - 1);
                            if (current) {
                                parts.push(current);
                                current = '';
                                currentBytes = 0;
                            }
                            parts.push(seg);
                            remaining = remaining.slice(seg.length);
                        }
                        // le reste tient
                        if (encoder.encode(remaining).length > (limitBytes - currentBytes)) {
                            if (current) {
                                parts.push(current);
                                current = '';
                                currentBytes = 0;
                            }
                        }
                        current += remaining;
                        currentBytes = encoder.encode(current).length;
                        continue;
                    }

                    if (currentBytes + bytes <= limitBytes) {
                        current += line;
                        currentBytes += bytes;
                    } else {
                        parts.push(current);
                        current = line;
                        currentBytes = bytes;
                    }
                }
                if (current) parts.push(current);
                return parts;
            }

            const parts = splitTranscriptMarkdown(t.transcript_md, CHUNK_LIMIT);

            // Préfix (optionnel) dans chaque fichier : header de contexte + "Part X/N"
            const headerBase =
                `# Transcript — ticket #${t.id}\n` +
                `Serveur: ${t.server_id}\n` +
                `Salon: ${t.channel_id}\n` +
                `Période: ${t.created_at?.toISOString?.() || t.created_at} → ${t.closed_at?.toISOString?.() || t.closed_at || '—'}\n\n`;

            // On ajoute le header à chaque chunk en vérifiant la taille
            const encoder = new TextEncoder();
            const files = [];
            for (let i = 0; i < parts.length; i++) {
                const head = `## Partie ${i + 1}/${parts.length}\n\n`;
                let body = parts[i];
                let content = headerBase + head + body;

                // Si le header fait dépasser la limite (très rare), on re-split juste ce chunk
                if (encoder.encode(content).length > CHUNK_LIMIT) {
                    const subparts = splitTranscriptMarkdown(body, CHUNK_LIMIT - encoder.encode(headerBase + head).length);
                    for (let j = 0; j < subparts.length; j++) {
                        const content2 = headerBase + `## Partie ${i + 1}.${j + 1}/${parts.length}\n\n` + subparts[j];
                        files.push({
                            name: `transcript-ticket-${t.id}-part-${String(i + 1).padStart(2, '0')}-${j + 1}.md`,
                            buffer: Buffer.from(content2, 'utf8'),
                        });
                    }
                } else {
                    files.push({
                        name: `transcript-ticket-${t.id}-part-${String(i + 1).padStart(2, '0')}.md`,
                        buffer: Buffer.from(content, 'utf8'),
                    });
                }
            }

            // Transforme en attachments Discord
            const { AttachmentBuilder } = require('discord.js');
            const attachments = files.map(f => new AttachmentBuilder(f.buffer, { name: f.name }));

            return interaction.editReply({
                content:
                    parts.length === 1
                        ? `📝 Transcript du **ticket #${t.id}** (1 fichier)`
                        : `📝 Transcript du **ticket #${t.id}** — fractionné en **${attachments.length} fichiers**.`,
                files: attachments,
            });
        }
    },
};
