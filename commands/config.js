// config.js — /config tout-en-un (FULL MySQL, aucune dépendance locale)
// Inspiré du pattern inline de messagereactionadd.js (pool dans le fichier).
const {
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ComponentType,
  ChannelType
} = require('discord.js');

// DB
const db = require('../data/db');

// ---------- Helpers DB (tous dans CE fichier) ----------
async function getOrCreateServerConfigId(guildId) {
  const [rows] = await db.query('SELECT id FROM serverconfig WHERE server_id = ?', [guildId]);
  if (rows.length) return rows[0].id;
  const [res] = await db.query('INSERT INTO serverconfig (server_id) VALUES (?)', [guildId]);
  return res.insertId;
}

async function getServerConfig(guildId) {
  const [rows] = await db.query('SELECT * FROM serverconfig WHERE server_id = ? LIMIT 1', [guildId]);
  if (rows.length) return rows[0];
  const id = await getOrCreateServerConfigId(guildId);
  return { id, server_id: guildId };
}

async function setServerFields(guildId, fields) {
  const id = await getOrCreateServerConfigId(guildId);
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  await db.query(`UPDATE serverconfig SET ${sets} WHERE id = ?`, [...values, id]);
}

async function upsertLink(guildId, name, url) {
  const id = await getOrCreateServerConfigId(guildId);
  const [ex] = await db.query('SELECT id FROM links_servers WHERE serverconfig_id = ? AND name = ?', [id, name]);
  if (ex.length) {
    await db.query('UPDATE links_servers SET url = ?, update_at = NOW() WHERE id = ?', [url, ex[0].id]);
    return { updated: true };
  }
  await db.query(
    'INSERT INTO links_servers (serverconfig_id, name, url, create_at, update_at) VALUES (?, ?, ?, NOW(), NOW())',
    [id, name, url]
  );
  return { created: true };
}

async function listLinks(guildId) {
  const id = await getOrCreateServerConfigId(guildId);
  const [rows] = await db.query('SELECT name, url FROM links_servers WHERE serverconfig_id = ? ORDER BY name ASC', [id]);
  return rows;
}

// ---------- Commande ----------
module.exports = {
  category: 'Configuration',
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer le serveur')
    .addSubcommand(s =>
      s.setName('ui')
        .setDescription('Ouvre le panneau de configuration interactif')
    )
    .addSubcommand(s =>
      s.setName('show')
        .setDescription('Afficher la configuration actuelle')
    )
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('Créer #logs privé si absent')
    )
    .addSubcommand(s =>
      s.setName('liens')
        .setDescription('Ajouter / mettre à jour un lien (mode commande)')
        .addStringOption(o => o.setName('nom').setDescription('Nom du lien').setRequired(true))
        .addStringOption(o => o.setName('url').setDescription('URL du lien').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('automessage')
        .setDescription('Configurer les messages automatiques (mode commande)')
        .addChannelOption(o => o.setName('channel').setDescription('Canal').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Contenu du message').setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('Intervalle (secondes, min 10)').setRequired(true))
        .addBooleanOption(o => o.setName('enable').setDescription('Activer ? (true/false)').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('roles')
        .setDescription('Noms des rôles Admin/Mute (mode commande)')
        .addStringOption(o => o.setName('admin_role').setDescription("Nom du rôle Admin"))
        .addStringOption(o => o.setName('mute_role').setDescription("Nom du rôle Mute"))
    )
    .addSubcommand(s =>
      s.setName('voice')
        .setDescription("Définir le salon 'création vocale'")
        .addStringOption(o => o.setName('channel').setDescription('ID du salon (texte ou vocal)'))
    )
    .addSubcommand(s =>
      s.setName('annonce')
        .setDescription("Définir le salon d'annonces")
        .addStringOption(o => o.setName('channel').setDescription("ID du salon d'annonces"))
    )
    .addSubcommand(s =>
      s.setName('boost')
        .setDescription('Configurer le message de boost')
        .addStringOption(o => o
          .setName('channel')
          .setDescription("ID du salon (laisser vide ou 'none' pour aucun)")
          .setRequired(false))
        .addBooleanOption(o => o
          .setName('enable')
          .setDescription('Activer la fonction ?')
          .setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('autorole')
        .setDescription('Définir le rôle automatique (ID)')
        .addStringOption(o => o.setName('role_id').setDescription('ID du rôle').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('xp')
        .setDescription('Activer ou désactiver le système d’XP')
        .addBooleanOption(o =>
          o.setName('enable')
            .setDescription('Activer ? (true/false)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '❌ À utiliser dans un serveur.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildId = guild.id;

    // guard admin
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!isAdmin && sub !== 'show') {
      return interaction.reply({ content: "❌ Permission administrateur requise.", ephemeral: true });
    }

    // ------------- /config show -------------
    if (sub === 'show') {
      const cfg = await getServerConfig(guildId);
      const links = await listLinks(guildId);
      const e = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('Configuration actuelle')
        .addFields(
          { name: '💎 Boost', value: `${cfg.boost_enabled ? '✅' : '❌'}  |  Salon: ${cfg.boost_channel ? `<#${cfg.boost_channel}>` : '—'}`, inline: true },
          { name: '📢 Annonces', value: cfg.annonce_channel ? `<#${cfg.annonce_channel}>` : '—', inline: true },
          { name: '🎙️ Voice', value: cfg.voice_channel ? `<#${cfg.voice_channel}>` : '—', inline: true },
          { name: '👤 Autorole', value: cfg.autorole ? `<@&${cfg.autorole}>` : '—', inline: true },
          { name: '🛡️ Rôles nommés', value: `Admin: **${cfg.admin_role || '—'}**\nMute: **${cfg.muted_role || '—'}**` },
          {
            name: '📩 AutoMessage', value: cfg.auto_message_content
              ? `Canal: <#${cfg.auto_message_channel}>\nIntervalle: ${Math.floor((cfg.auto_message_interval || 0) / 1000)}s\nActivé: ${cfg.auto_message_enabled ? '✅' : '❌'}\nContenu: ${String(cfg.auto_message_content).slice(0, 256)}${String(cfg.auto_message_content).length > 256 ? '…' : ''}`
              : '—'
          },
          { name: '🔗 Liens', value: links.length ? links.map(l => `• **${l.name}** : ${l.url}`).join('\n') : '—' },
          { name: '🧮 XP', value: cfg.xp_enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
        )
        .setTimestamp();
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    // ------------- /config setup (crée #logs) -------------
    if (sub === 'setup') {
      const existing = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
      if (existing) return interaction.reply({ content: '🛠️ #logs existe déjà.', ephemeral: true });

      const logChannel = await guild.channels.create({
        name: 'logs',
        type: 0,
        permissionOverwrites: [
          { id: guild.id, deny: ['ViewChannel'] },
          { id: interaction.member.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          { id: guild.members.me.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageMessages'] },
        ],
      });

      await logChannel.send('🔒 Ce salon enregistre les actions de modération.');
      return interaction.reply({ content: '✅ #logs créé.', ephemeral: true });
    }

    // ------------- /config liens (mode commande) -------------
    if (sub === 'liens') {
      const name = interaction.options.getString('nom', true).trim();
      const url = interaction.options.getString('url', true).trim();
      if (!/^https?:\/\/.+\..+/i.test(url)) {
        return interaction.reply({ content: '❌ URL invalide (http/https requis).', ephemeral: true });
      }
      const res = await upsertLink(guildId, name, url);

      const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder()
          .setColor(res.updated ? 0xf08f19 : 0x00ff00)
          .setTitle(res.updated ? '🔗 Lien mis à jour' : '🔗 Lien ajouté')
          .addFields({ name: 'Nom', value: name }, { name: 'URL', value: url })
          .setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }

      return interaction.reply({ content: `✅ Lien **${name}** ${res.updated ? 'mis à jour' : 'ajouté'}.`, ephemeral: true });
    }

    // ------------- /config automessage (mode commande) -------------
    if (sub === 'automessage') {
      const channel = interaction.options.getChannel('channel', true);
      const content = interaction.options.getString('message', true);
      const intervalSec = interaction.options.getInteger('interval', true);
      const enableOpt = interaction.options.getBoolean('enable');

      if (!Number.isFinite(intervalSec) || intervalSec < 10) {
        return interaction.reply({ content: '❌ Intervalle invalide (min 10s).', ephemeral: true });
      }

      await setServerFields(guildId, {
        auto_message_channel: channel.id,
        auto_message_content: content,
        auto_message_interval: intervalSec * 1000,
        auto_message_enabled: enableOpt === undefined ? 1 : (enableOpt ? 1 : 0),
      });

      // notifier le bot (si tu gères un scheduler côté bot)
      interaction.client.emit('configUpdate', guildId);

      const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder()
          .setColor(0x00aaff)
          .setTitle('📩 AutoMessage configuré')
          .addFields(
            { name: 'Canal', value: `<#${channel.id}>` },
            { name: 'Intervalle', value: `${intervalSec}s` },
            { name: 'Activé', value: (enableOpt === undefined ? true : !!enableOpt) ? '✅' : '❌' },
            { name: 'Message', value: content.slice(0, 1024) }
          )
          .setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }

      return interaction.reply({ content: `✅ AutoMessage ${(enableOpt === undefined || enableOpt) ? 'activé' : 'configuré (désactivé)'} dans <#${channel.id}>.`, ephemeral: true });
    }

    // ------------- /config roles (mode commande) -------------
    if (sub === 'roles') {
      const adminName = interaction.options.getString('admin_role')?.trim();
      const muteName = interaction.options.getString('mute_role')?.trim();

      const toSet = {};
      if (adminName) toSet.admin_role = adminName;
      if (muteName) toSet.muted_role = muteName;
      if (!Object.keys(toSet).length) {
        return interaction.reply({ content: '⚠️ Rien à modifier.', ephemeral: true });
      }
      await setServerFields(guildId, toSet);

      const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder()
          .setColor(0xf08f19)
          .setTitle('🛡️ Rôles nommés mis à jour')
          .addFields(
            { name: 'Admin', value: adminName || '—', inline: true },
            { name: 'Mute', value: muteName || '—', inline: true },
          )
          .setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }
      return interaction.reply({ content: '✅ Rôles mis à jour.', ephemeral: true });
    }

    // ------------- /config voice (mode commande) -------------
    if (sub === 'voice') {
      const chId = interaction.options.getString('channel')?.trim();
      if (!chId) return interaction.reply({ content: '❌ Fournis un ID de salon.', ephemeral: true });

      await setServerFields(guildId, { voice_channel: chId });

      const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder().setColor(0xf08f19).setTitle('🎙️ Salon vocal configuré')
          .addFields({ name: 'Salon', value: `<#${chId}>` }).setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }
      return interaction.reply({ content: `✅ Salon vocal défini : <#${chId}>`, ephemeral: true });
    }

    // ------------- /config annonce (mode commande) -------------
    if (sub === 'annonce') {
      const chId = interaction.options.getString('channel')?.trim();
      if (!chId) return interaction.reply({ content: "❌ Fournis l'ID du salon d'annonces.", ephemeral: true });

      await setServerFields(guildId, { annonce_channel: chId });

      const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder().setColor(0xf08f19).setTitle("📢 Salon d'annonces mis à jour")
          .addFields({ name: 'Salon', value: `<#${chId}>` }).setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }
      return interaction.reply({ content: `✅ Salon d'annonces défini : <#${chId}>`, ephemeral: true });
    }

    // ------------- /config boost (mode commande) -------------
    if (sub === 'boost') {
      const chIdRaw = interaction.options.getString('channel')?.trim();
      const enableOpt = interaction.options.getBoolean('enable'); // undefined = pas changé

      const toSet = {};
      if (chIdRaw === undefined) {
        // pas de changement de salon si l’option n’est pas fournie
      } else if (!chIdRaw || chIdRaw.toLowerCase() === 'none' || chIdRaw.toLowerCase() === 'aucun') {
        toSet.boost_channel = null;        // "aucun salon"
      } else {
        toSet.boost_channel = chIdRaw;     // ID fourni tel quel
      }
      if (enableOpt !== undefined) toSet.boost_enabled = enableOpt ? 1 : 0;

      if (!Object.keys(toSet).length) {
        return interaction.reply({ content: '⚠️ Rien à modifier.', ephemeral: true });
      }
      await setServerFields(guildId, toSet);

      // logs
      const log = guild.channels.cache.find(c => c.name?.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder()
          .setColor(0xff73fa)
          .setTitle('💎 Configuration Boost mise à jour')
          .addFields(
            { name: 'Salon', value: toSet.boost_channel === null ? '— (aucun)' : (toSet.boost_channel ? `<#${toSet.boost_channel}>` : '— (inchangé)'), inline: true },
            { name: 'Activé', value: enableOpt === undefined ? '— (inchangé)' : (enableOpt ? '✅' : '❌'), inline: true },
          )
          .setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }

      return interaction.reply({
        content: `✅ Boost: ${enableOpt === undefined ? 'état inchangé' : (enableOpt ? 'activé' : 'désactivé')}${toSet.boost_channel === null ? ' • salon effacé' : (toSet.boost_channel ? ` • salon: <#${toSet.boost_channel}>` : '')}.`,
        ephemeral: true
      });
    }

    // ------------- /config autorole (mode commande) -------------
    if (sub === 'autorole') {
      const roleId = interaction.options.getString('role_id', true).trim();
      await setServerFields(guildId, { autorole: roleId });

      const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder().setColor(0x00ff88).setTitle('👤 Autorole configuré')
          .addFields({ name: 'Rôle', value: `<@&${roleId}>` }).setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }
      return interaction.reply({ content: `✅ Rôle automatique défini : <@&${roleId}>`, ephemeral: true });
    }

    // ------------- /config xp (mode commande) -------------
    if (sub === 'xp') {
      const enable = interaction.options.getBoolean('enable', true);
      await setServerFields(guildId, { xp_enabled: enable ? 1 : 0 });

      // log optionnel
      const log = guild.channels.cache.find(c => c.name?.toLowerCase() === 'logs');
      if (log) {
        const emb = new EmbedBuilder()
          .setColor(enable ? 0x00ff88 : 0xff5555)
          .setTitle('🧮 XP — état modifié')
          .addFields({ name: 'Activé ?', value: enable ? '✅ Oui' : '❌ Non' })
          .setTimestamp();
        log.send({ embeds: [emb] }).catch(() => { });
      }

      // notifier le bot si tu veux faire réagir un cache interne
      interaction.client.emit('configUpdate', guildId);

      return interaction.reply({
        content: `✅ Système d’XP **${enable ? 'activé' : 'désactivé'}**.`,
        ephemeral: true,
      });
    }

    // ------------- /config ui (dashboard interactif, tout-en-un) -------------
    if (sub === 'ui') {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`⚙️ Panneau de configuration — ${guild.name}`)
        .setDescription("Tout se fait ici en **éphémère**. Choisis une section👇")
        .addFields(
          { name: '🔗 Liens', value: 'Ajouter / mettre à jour (Nom + URL)' },
          { name: '📩 AutoMessage', value: 'Canal + message + intervalle + ON/OFF' },
          { name: '📢 Annonces', value: "Définir le salon d'annonces" },
          { name: '🎙️ Voice', value: 'Définir le salon de création vocale' },
          { name: '👤 Autorole', value: 'Définir le rôle automatique' },
          { name: '🛡️ Rôles nommés', value: "Nom des rôles Admin / Mute" },
          { name: '🧾 Show', value: "Afficher l'aperçu de la configuration" },
        )
        .setFooter({ text: 'Le panneau expire dans 5 minutes.' })
        .setTimestamp();

      const rowA = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cfg_links:${guildId}`).setStyle(ButtonStyle.Primary).setLabel('🔗 Liens'),
        new ButtonBuilder().setCustomId(`cfg_automsg:${guildId}`).setStyle(ButtonStyle.Primary).setLabel('📩 AutoMessage'),
        new ButtonBuilder().setCustomId(`cfg_show:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('🧾 Show'),
      );
      const rowB = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cfg_annonce:${guildId}`).setStyle(ButtonStyle.Success).setLabel('📢 Annonces'),
        new ButtonBuilder().setCustomId(`cfg_voice:${guildId}`).setStyle(ButtonStyle.Success).setLabel('🎙️ Voice'),
        new ButtonBuilder().setCustomId(`cfg_autorole:${guildId}`).setStyle(ButtonStyle.Success).setLabel('👤 Autorole'),
      );
      const rowC = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cfg_roles:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('🛡️ Rôles nommés'),
        new ButtonBuilder().setCustomId(`cfg_setup_logs:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('🧰 Setup #logs'),
        new ButtonBuilder().setCustomId(`cfg_xp:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('🧮 XP ON/OFF')
      );
      const rowD = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cfg_boost:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('💎 Boost'),
      );

      const reply = await interaction.reply({ embeds: [embed], components: [rowA, rowB, rowC, rowD], ephemeral: true });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000,
        filter: i => i.user.id === interaction.user.id,
      });

      collector.on('collect', async (i) => {
        try {
          const [id, gId] = i.customId.split(':');
          if (gId !== guildId) return i.reply({ content: 'Contexte invalide.', ephemeral: true });

          // --- Liens : modal ---
          if (id === 'cfg_links') {
            const modal = new ModalBuilder().setCustomId(`modal_links:${guildId}`).setTitle('Ajouter / Mettre à jour un lien');
            const nameInput = new TextInputBuilder().setCustomId('link_name').setLabel('Nom du lien').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Site Web');
            const urlInput = new TextInputBuilder().setCustomId('link_url').setLabel('URL du lien').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://example.com');
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(urlInput));
            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({ time: 90_000, filter: m => m.customId === `modal_links:${guildId}` && m.user.id === interaction.user.id });
            const name = submitted.fields.getTextInputValue('link_name')?.trim();
            const url = submitted.fields.getTextInputValue('link_url')?.trim();
            if (!/^https?:\/\/.+\..+/i.test(url)) {
              return submitted.reply({ content: '❌ URL invalide (http/https).', ephemeral: true });
            }
            const res = await upsertLink(guildId, name, url);

            const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
            if (log) {
              const emb = new EmbedBuilder()
                .setColor(res.updated ? 0xf08f19 : 0x00ff00)
                .setTitle(res.updated ? '🔗 Lien mis à jour' : '🔗 Lien ajouté')
                .addFields({ name: 'Nom', value: name }, { name: 'URL', value: url })
                .setTimestamp();
              log.send({ embeds: [emb] }).catch(() => { });
            }
            return submitted.reply({ content: `✅ Lien **${name}** ${res.updated ? 'mis à jour' : 'ajouté'}.`, ephemeral: true });
          }

          // --- AutoMessage : modal + channel select + ON/OFF ---
          if (id === 'cfg_automsg') {
            const modal = new ModalBuilder().setCustomId(`modal_automsg:${guildId}`).setTitle('Configurer AutoMessage');
            const msgInput = new TextInputBuilder().setCustomId('am_msg').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800);
            const intInput = new TextInputBuilder().setCustomId('am_interval').setLabel('Intervalle (secondes)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 3600');
            const toggleInput = new TextInputBuilder().setCustomId('am_toggle').setLabel('Activer ? (true/false)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('true');
            modal.addComponents(
              new ActionRowBuilder().addComponents(msgInput),
              new ActionRowBuilder().addComponents(intInput),
              new ActionRowBuilder().addComponents(toggleInput),
            );
            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({ time: 120_000, filter: m => m.customId === `modal_automsg:${guildId}` && m.user.id === interaction.user.id });
            const message = submitted.fields.getTextInputValue('am_msg').trim();
            const intervalSec = parseInt(submitted.fields.getTextInputValue('am_interval')?.trim() || '0', 10);
            const toggleStr = submitted.fields.getTextInputValue('am_toggle')?.trim().toLowerCase();
            const enabled = toggleStr === '' ? true : (toggleStr === 'true' || toggleStr === '1' || toggleStr === 'yes' || toggleStr === 'on');

            if (!Number.isFinite(intervalSec) || intervalSec < 10) {
              return submitted.reply({ content: '❌ Intervalle invalide (min 10s).', ephemeral: true });
            }

            const selectRow = new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId(`am_channel:${guildId}:${Date.now()}`)
                .setPlaceholder('Choisis le canal pour AutoMessage')
                .addChannelTypes(0) // GuildText
            );
            await submitted.reply({ content: 'Sélectionne le canal :', components: [selectRow], ephemeral: true });

            const chMsg = await submitted.fetchReply();
            const chCollector = chMsg.createMessageComponentCollector({
              componentType: ComponentType.ChannelSelect,
              time: 90_000,
              filter: x => x.user.id === interaction.user.id && x.customId.startsWith('am_channel:'),
            });

            chCollector.on('collect', async sel => {
              const channelId = sel.values?.[0];
              await setServerFields(guildId, {
                auto_message_channel: channelId,
                auto_message_content: message,
                auto_message_interval: intervalSec * 1000,
                auto_message_enabled: enabled ? 1 : 0,
              });
              // Pour (re)démarrer ton scheduler interne si tu en as un :
              interaction.client.emit('configUpdate', guildId);

              const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
              if (log) {
                const emb = new EmbedBuilder()
                  .setColor(0x00aaff)
                  .setTitle('📩 AutoMessage configuré (UI)')
                  .addFields(
                    { name: 'Canal', value: `<#${channelId}>`, inline: true },
                    { name: 'Intervalle', value: `${intervalSec}s`, inline: true },
                    { name: 'Activé', value: enabled ? '✅' : '❌', inline: true },
                    { name: 'Message', value: message.slice(0, 1024) },
                  )
                  .setTimestamp();
                log.send({ embeds: [emb] }).catch(() => { });
              }
              await sel.update({ content: `✅ AutoMessage ${enabled ? 'activé' : 'désactivé'} dans <#${channelId}> toutes les ${intervalSec}s.`, components: [] });
            });

            chCollector.on('end', async c => {
              if (c.size === 0) { try { await submitted.editReply({ content: '⏳ Sélection expirée.', components: [] }); } catch { } }
            });
            return;
          }

          // --- Annonces : channel select ---
          if (id === 'cfg_annonce') {
            const row = new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId(`annonce_channel:${guildId}:${Date.now()}`)
                .setPlaceholder("Choisis le salon d'annonces")
                .addChannelTypes(0) // GuildText
            );
            await i.reply({ content: "Sélectionne le salon d'annonces :", components: [row], ephemeral: true });

            const msg = await i.fetchReply();
            const coll = msg.createMessageComponentCollector({
              componentType: ComponentType.ChannelSelect,
              time: 90_000,
              filter: x => x.user.id === interaction.user.id && x.customId.startsWith('annonce_channel:'),
            });

            coll.on('collect', async sel => {
              const channelId = sel.values?.[0];
              await setServerFields(guildId, { annonce_channel: channelId });

              const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
              if (log) {
                const emb = new EmbedBuilder().setColor(0xf08f19).setTitle("📢 Salon d'annonces mis à jour")
                  .addFields({ name: 'Salon', value: `<#${channelId}>` }).setTimestamp();
                log.send({ embeds: [emb] }).catch(() => { });
              }
              await sel.update({ content: `✅ Salon d'annonces : <#${channelId}>`, components: [] });
            });

            coll.on('end', async c => { if (c.size === 0) { try { await i.editReply({ content: '⏳ Sélection expirée.', components: [] }); } catch { } } });
            return;
          }

          // --- BOOST : UI principale (comme ton cfg_xp mais avec panneau complet)
          if (id === 'cfg_boost') {
            const guild = interaction.guild; // même portée que ton cfg_xp
            const rowSel = new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId(`boost_channel:${guildId}:${Date.now()}`)
                .setPlaceholder('Choisis le salon pour les messages de boost (optionnel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            );
            const rowBtns = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`boost_toggle:${guildId}`).setStyle(ButtonStyle.Primary).setLabel('Activer/Désactiver'),
              new ButtonBuilder().setCustomId(`boost_clear:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('Aucun salon')
            );

            await i.reply({ content: 'Configure le message de boost :', components: [rowSel, rowBtns], ephemeral: true });
            const msg = await i.fetchReply();

            const coll = msg.createMessageComponentCollector({
              time: 120_000,
              filter: x => x.user.id === interaction.user.id
            });

            // helper logs (même logique que ton cfg_xp)
            async function logBoost({ channelId, enabled, actorTag }) {
              try {
                const log = guild.channels.cache.find(c => c.name?.toLowerCase() === 'logs');
                if (!log) return;

                const fields = [];
                if (typeof enabled === 'number') fields.push({ name: 'Activé ?', value: enabled ? '✅ Oui' : '❌ Non', inline: true });
                if (channelId !== undefined) fields.push({ name: 'Salon', value: channelId ? `<#${channelId}>` : '— (aucun)', inline: true });
                if (actorTag) fields.push({ name: 'Par', value: actorTag, inline: true });

                const emb = new EmbedBuilder()
                  .setColor(0xff73fa)
                  .setTitle('💎 Boost — configuration modifiée (UI)')
                  .addFields(fields)
                  .setTimestamp();

                await log.send({ embeds: [emb] });
              } catch { }
            }

            coll.on('collect', async (sel) => {
              try {
                // 1) Sélection d’un salon
                if (sel.isChannelSelectMenu() && sel.customId.startsWith('boost_channel:')) {
                  const chId = sel.values?.[0] || null;
                  await setServerFields(guildId, { boost_channel: chId });

                  // log à la XP (avant return)
                  await logBoost({ channelId: chId, actorTag: sel.user.tag });

                  return sel.update({
                    content: `✅ Salon de boost: ${chId ? `<#${chId}>` : '— (aucun)'}`,
                    components: [rowSel, rowBtns]
                  });
                }

                // 2) Toggle ON/OFF (exactement comme ton cfg_xp)
                if (sel.customId === `boost_toggle:${guildId}`) {
                  const cfg = await getServerConfig(guildId);
                  const current = !!cfg.boost_enabled;
                  const next = current ? 0 : 1;

                  await setServerFields(guildId, { boost_enabled: next });

                  // log à la XP
                  await logBoost({ enabled: next, actorTag: sel.user.tag });

                  // notifier le bot si tu as un event interne (optionnel, comme pour XP)
                  interaction.client.emit('configUpdate', guildId);

                  return sel.update({
                    content: `✅ Message de boost **${next ? 'activé' : 'désactivé'}**.`,
                    components: [rowSel, rowBtns]
                  });
                }

                // 3) Aucun salon (NULL en base)
                if (sel.customId === `boost_clear:${guildId}`) {
                  await setServerFields(guildId, { boost_channel: null });

                  await logBoost({ channelId: null, actorTag: sel.user.tag });

                  return sel.update({
                    content: '✅ Salon de boost effacé (aucun salon).',
                    components: [rowSel, rowBtns]
                  });
                }
              } catch (e) {
                console.error('cfg_boost error:', e);
                if (!sel.replied && !sel.deferred) {
                  sel.reply({ content: '❌ Erreur.', ephemeral: true }).catch(() => { });
                }
              }
            });

            coll.on('end', async c => {
              if (c.size === 0) {
                try { await i.editReply({ content: '⏳ Config boost expirée.', components: [] }); } catch { }
              }
            });

            return;
          }

          // --- Voice : channel select (texte ou vocal) ---
          if (id === 'cfg_voice') {
            const row = new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId(`voice_channel:${guildId}:${Date.now()}`)
                .setPlaceholder('Choisis le salon de création vocale')
                .addChannelTypes(0, 2) // GuildText, GuildVoice
            );
            await i.reply({ content: 'Sélectionne le salon :', components: [row], ephemeral: true });

            const msg = await i.fetchReply();
            const coll = msg.createMessageComponentCollector({
              componentType: ComponentType.ChannelSelect,
              time: 90_000,
              filter: x => x.user.id === interaction.user.id && x.customId.startsWith('voice_channel:'),
            });

            coll.on('collect', async sel => {
              const chId = sel.values?.[0];
              await setServerFields(guildId, { voice_channel: chId });

              const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
              if (log) {
                const emb = new EmbedBuilder().setColor(0xf08f19).setTitle('🎙️ Salon vocal configuré')
                  .addFields({ name: 'Salon', value: `<#${chId}>` }).setTimestamp();
                log.send({ embeds: [emb] }).catch(() => { });
              }
              await sel.update({ content: `✅ Salon vocal défini : <#${chId}>`, components: [] });
            });

            coll.on('end', async c => { if (c.size === 0) { try { await i.editReply({ content: '⏳ Sélection expirée.', components: [] }); } catch { } } });
            return;
          }

          // --- Autorole : role select ---
          if (id === 'cfg_autorole') {
            const row = new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder().setCustomId(`autorole:${guildId}:${Date.now()}`).setPlaceholder('Choisis le rôle automatique')
            );
            await i.reply({ content: 'Sélectionne le rôle :', components: [row], ephemeral: true });

            const msg = await i.fetchReply();
            const coll = msg.createMessageComponentCollector({
              componentType: ComponentType.RoleSelect,
              time: 90_000,
              filter: x => x.user.id === interaction.user.id && x.customId.startsWith('autorole:'),
            });

            coll.on('collect', async sel => {
              const roleId = sel.values?.[0];
              await setServerFields(guildId, { autorole: roleId });

              const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
              if (log) {
                const emb = new EmbedBuilder().setColor(0x00ff88).setTitle('👤 Autorole configuré')
                  .addFields({ name: 'Rôle', value: `<@&${roleId}>` }).setTimestamp();
                log.send({ embeds: [emb] }).catch(() => { });
              }
              await sel.update({ content: `✅ Rôle automatique : <@&${roleId}>`, components: [] });
            });

            coll.on('end', async c => { if (c.size === 0) { try { await i.editReply({ content: '⏳ Sélection expirée.', components: [] }); } catch { } } });
            return;
          }

          // --- Rôles nommés : modal ---
          if (id === 'cfg_roles') {
            const modal = new ModalBuilder().setCustomId(`modal_roles:${guildId}`).setTitle('Rôles nommés');
            const adminInput = new TextInputBuilder().setCustomId('admin_role').setLabel("Nom du rôle Admin").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Admin');
            const muteInput = new TextInputBuilder().setCustomId('mute_role_name').setLabel("Nom du rôle Mute").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Muted');
            modal.addComponents(new ActionRowBuilder().addComponents(adminInput), new ActionRowBuilder().addComponents(muteInput));
            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({ time: 90_000, filter: m => m.customId === `modal_roles:${guildId}` && m.user.id === interaction.user.id });
            const adminRoleName = submitted.fields.getTextInputValue('admin_role')?.trim();
            const muteRoleName = submitted.fields.getTextInputValue('mute_role_name')?.trim();

            const toSet = {};
            if (adminRoleName) toSet.admin_role = adminRoleName;
            if (muteRoleName) toSet.muted_role = muteRoleName;
            if (Object.keys(toSet).length) await setServerFields(guildId, toSet);

            const log = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
            if (log) {
              const emb = new EmbedBuilder().setColor(0xf08f19).setTitle('🛡️ Rôles nommés mis à jour')
                .addFields(
                  { name: 'Admin', value: adminRoleName || '—', inline: true },
                  { name: 'Mute', value: muteRoleName || '—', inline: true },
                ).setTimestamp();
              log.send({ embeds: [emb] }).catch(() => { });
            }
            return submitted.reply({ content: '✅ Rôles mis à jour.', ephemeral: true });
          }

          // --- Setup logs ---
          if (id === 'cfg_setup_logs') {
            const existing = guild.channels.cache.find(c => c.name.toLowerCase() === 'logs');
            if (existing) return i.reply({ content: '🛠️ #logs existe déjà.', ephemeral: true });

            const logChannel = await guild.channels.create({
              name: 'logs',
              type: 0,
              permissionOverwrites: [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: interaction.member.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                { id: guild.members.me.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageMessages'] },
              ],
            });
            await logChannel.send('🔒 Ce salon enregistre les actions de modération.');
            return i.reply({ content: '✅ #logs créé.', ephemeral: true });
          }

          // --- XP: toggle on/off ---
          if (id === 'cfg_xp') {
            // lire l'état actuel
            const cfg = await getServerConfig(guildId);
            const current = !!cfg.xp_enabled;             // si colonne absente => falsey
            const next = current ? 0 : 1;

            await setServerFields(guildId, { xp_enabled: next });

            // log vers #logs
            const log = guild.channels.cache.find(c => c.name?.toLowerCase() === 'logs');
            if (log) {
              const emb = new EmbedBuilder()
                .setColor(next ? 0x00ff88 : 0xff5555)
                .setTitle('🧮 XP — état modifié (UI)')
                .addFields(
                  { name: 'Activé ?', value: next ? '✅ Oui' : '❌ Non', inline: true },
                  { name: 'Par', value: i.user.tag, inline: true },
                )
                .setTimestamp();
              log.send({ embeds: [emb] }).catch(() => { });
            }

            // notifier le bot (vide le cache XP côté event/messagecreate)
            interaction.client.emit('configUpdate', guildId);

            // feedback utilisateur
            return i.reply({ content: `✅ Système d’XP **${next ? 'activé' : 'désactivé'}**.`, ephemeral: true });
          }

          // --- Show (depuis UI) ---
          if (id === 'cfg_show') {
            const cfg = await getServerConfig(guildId);
            const links = await listLinks(guildId);
            const e = new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle('Configuration actuelle')
              .addFields(
                { name: '🔗 Liens', value: links.length ? links.map(l => `• **${l.name}** : ${l.url}`).join('\n') : '—' },
                { name: '🛡️ Rôles nommés', value: `Admin: **${cfg.admin_role || '—'}**\nMute: **${cfg.muted_role || '—'}**` },
                {
                  name: '📩 AutoMessage', value: cfg.auto_message_content
                    ? `Canal: <#${cfg.auto_message_channel}>\nIntervalle: ${Math.floor((cfg.auto_message_interval || 0) / 1000)}s\nActivé: ${cfg.auto_message_enabled ? '✅' : '❌'}\nMessage: ${String(cfg.auto_message_content).slice(0, 256)}${String(cfg.auto_message_content).length > 256 ? '…' : ''}`
                    : '—'
                },
                { name: '🎙️ Voice', value: cfg.voice_channel ? `<#${cfg.voice_channel}>` : '—' },
                { name: '📢 Annonces', value: cfg.annonce_channel ? `<#${cfg.annonce_channel}>` : '—' },
                { name: '👤 Autorole', value: cfg.autorole ? `<@&${cfg.autorole}>` : '—' },
                { name: '🧮 XP', value: cfg.xp_enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
              )
              .setTimestamp();
            return i.reply({ embeds: [e], ephemeral: true });
          }

        } catch (err) {
          console.error('Config UI error:', err);
          if (!i.replied && !i.deferred) i.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => { });
        }
      });

      collector.on('end', async () => {
        try { await interaction.editReply({ components: [] }); } catch { }
      });

      return;
    }

    // fallback
    return interaction.reply({ content: '❌ Sous-commande inconnue.', ephemeral: true });
  },
};
