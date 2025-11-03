// commands/help.js
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');

const ORDER = [
    'Modération',
    'Configuration',
    'Administration',
    'XP',
    'Utilitaires',
    'Fun',
    'Logs',
    'Tickets',
    'Autres',
];

module.exports = {
    category: 'Utilitaires',
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche l’aide interactive, triée par catégories.'),

    async execute(interaction) {
        const all = interaction.client.commands
            .map(cmd => ({
                name: cmd?.data?.name,
                desc: cmd?.data?.description || '—',
                cat: cmd?.category || cmd?.data?.category || 'Autres',
            }))
            .filter(c => !!c.name);

        const byCat = new Map();
        for (const c of all) {
            if (!byCat.has(c.cat)) byCat.set(c.cat, []);
            byCat.get(c.cat).push(c);
        }

        const categories = [
            ...ORDER.filter(c => byCat.has(c)),
            ...[...byCat.keys()].filter(c => !ORDER.includes(c)),
        ];

        // Sommaire
        const index = new EmbedBuilder()
            .setColor('#1c5863')
            .setTitle('📖 Aide — Sommaire')
            .setDescription(
                categories.map(cat => `• **${cat}** (${byCat.get(cat).length})`).join('\n')
                || 'Aucune commande disponible.',
            )
            .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setFooter({ text: 'HydrixBot — /help' })
            .setTimestamp();

        // Menu de catégories (max 25 options)
        const options = categories.slice(0, 25).map(cat => ({
            label: cat,
            value: encodeURIComponent(cat),
            description: `${byCat.get(cat).length} commande(s)`,
        }));

        const select = new StringSelectMenuBuilder()
            .setCustomId(`help:select|${interaction.user.id}`)
            .setPlaceholder('Choisis une catégorie…')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.reply({
            embeds: [index],
            components: [row],
            ephemeral: true,
        });
    },
};
