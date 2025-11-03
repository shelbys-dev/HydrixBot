const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

/** Convertit un Attachment (ou URL) en data URI base64 */
async function intoDataURI(src) {
    // src peut être: { url, contentType } (Attachment) OU string (URL)
    const url = typeof src === "string" ? src : src.url;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch image failed: ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Détermine le mime: priorité à l’en-tête HTTP, puis au contentType d’un Attachment, puis au fallback
    const headerMime = res.headers.get("content-type");
    const attachmentMime = (typeof src !== "string" && src.contentType) ? src.contentType : null;
    const mime = (headerMime || attachmentMime || "image/png").split(";")[0];
    const base64 = buf.toString("base64");
    return `data:${mime};base64,${base64}`;
}

module.exports = {
    category: 'Administration',
    data: new SlashCommandBuilder()
        .setName("setbotprofile")
        .setDescription("Définir le profil du bot pour CE serveur (nick, bio, avatar, bannière).")
        // Options textuelles
        .addStringOption(o =>
            o.setName("nick")
                .setDescription("Pseudo du bot dans ce serveur")
                .setMaxLength(32) // même contrainte que les pseudos classiques
                .setRequired(false)
        )
        .addStringOption(o =>
            o.setName("bio")
                .setDescription("Bio du bot (profil serveur)")
                .setMaxLength(190) // borne raisonnable, l’API peut évoluer
                .setRequired(false)
        )
        // Fichiers (attachments) – plus simple pour l’admin
        .addAttachmentOption(o =>
            o.setName("avatar_file")
                .setDescription("Avatar (fichier image)")
                .setRequired(false)
        )
        .addAttachmentOption(o =>
            o.setName("banner_file")
                .setDescription("Bannière (fichier image)")
                .setRequired(false)
        )
        // Ou URLs directes si tu préfères
        .addStringOption(o =>
            o.setName("avatar_url")
                .setDescription("Avatar (URL image)")
                .setRequired(false)
        )
        .addStringOption(o =>
            o.setName("banner_url")
                .setDescription("Bannière (URL image)")
                .setRequired(false)
        )
        // Resets ciblés si besoin
        .addBooleanOption(o =>
            o.setName("reset_avatar").setDescription("Réinitialiser l’avatar serveur").setRequired(false)
        )
        .addBooleanOption(o =>
            o.setName("reset_banner").setDescription("Réinitialiser la bannière serveur").setRequired(false)
        )
        .addBooleanOption(o =>
            o.setName("reset_bio").setDescription("Réinitialiser la bio serveur").setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
    async execute(interaction) {
        // On évite le timeout pendant les téléchargements d’images
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        if (!guild) {
            return interaction.editReply("❌ Cette commande doit être utilisée dans un serveur.");
        }

        // Récup options
        const nick = interaction.options.getString("nick") ?? undefined;
        const bio = interaction.options.getString("bio") ?? undefined;

        const avatarFile = interaction.options.getAttachment("avatar_file");
        const bannerFile = interaction.options.getAttachment("banner_file");

        const avatarUrl = interaction.options.getString("avatar_url");
        const bannerUrl = interaction.options.getString("banner_url");

        const resetAvatar = interaction.options.getBoolean("reset_avatar") || false;
        const resetBanner = interaction.options.getBoolean("reset_banner") || false;
        const resetBio = interaction.options.getBoolean("reset_bio") || false;

        // Construire le payload PATCH
        const body = {};

        // Nick : on peut l’envoyer via l’API HTTP aussi, mais utiliser l’API high-level est plus sûr
        if (typeof nick === "string") {
            // on le fera après via guild.members.me.setNickname pour fiabilité
        }

        try {
            // Préparer avatar / banner (data URIs) si fournis
            if (resetAvatar) body.avatar = null;
            if (resetBanner) body.banner = null;
            if (resetBio) body.bio = null;

            // avatar
            if (!resetAvatar) {
                if (avatarFile) body.avatar = await intoDataURI(avatarFile);
                else if (avatarUrl) body.avatar = await intoDataURI(avatarUrl);
            }

            // banner
            if (!resetBanner) {
                if (bannerFile) body.banner = await intoDataURI(bannerFile);
                else if (bannerUrl) body.banner = await intoDataURI(bannerUrl);
            }

            // bio
            if (!resetBio && typeof bio === "string") {
                body.bio = bio;
            }

            // Rien à mettre à jour côté HTTP ?
            const hasHttpPatch =
                Object.prototype.hasOwnProperty.call(body, "avatar") ||
                Object.prototype.hasOwnProperty.call(body, "banner") ||
                Object.prototype.hasOwnProperty.call(body, "bio");

            if (hasHttpPatch) {
                // Appel HTTP brut à l’endpoint officiel
                const token = process.env.TOKEN;
                if (!token) throw new Error("TOKEN manquant dans les variables d'environnement.");

                const res = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/members/@me`, {
                    method: "PATCH",
                    headers: {
                        "Authorization": `Bot ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                });

                if (!res.ok) {
                    const txt = await res.text().catch(() => "");
                    throw new Error(`HTTP ${res.status} ${res.statusText} — ${txt}`);
                }
            }

            // Nickname : API high-level (gère permissions/ratelimits proprement)
            if (typeof nick === "string") {
                await guild.members.me.setNickname(nick).catch(err => {
                    // Pas bloquant : certains serveurs bloquent le changement de surnom
                    throw new Error(`Impossible de changer le pseudo: ${err.message}`);
                });
            }

            // Succès
            const changed = [
                typeof nick === "string" && "nick",
                hasHttpPatch && Object.prototype.hasOwnProperty.call(body, "bio") && (resetBio ? "bio (reset)" : "bio"),
                hasHttpPatch && Object.prototype.hasOwnProperty.call(body, "avatar") && (resetAvatar ? "avatar (reset)" : "avatar"),
                hasHttpPatch && Object.prototype.hasOwnProperty.call(body, "banner") && (resetBanner ? "bannière (reset)" : "bannière"),
            ].filter(Boolean).join(", ");

            const logChannel = guild.channels.cache.find(
                (ch) => ch.name && ch.name.toLowerCase() === 'logs'
            );

            if (logChannel) {
                const changed_embed = new EmbedBuilder()
                    .setColor(0xf08f19)
                    .setTitle(`${changed} modifié(s)`)
                    .setDescription(`${interaction.user.tag} a mis à jour le profil du Bot pour ce serveur.`)
                    .setThumbnail(interaction.user.displayAvatarURL({ size: 256, extension: 'png', forceStatic: false }))
                    .addFields(
                        { name: 'Changements', value: `✅ Profil du bot mis à jour sur **${guild.name}** → ${changed}` || 'ℹ️ Aucun champ fourni à modifier.' },
                    )
                    .setFooter({ text: 'Bot codé par Shelby S. ! 🚀' })
                    .setTimestamp();

                // on ignore les erreurs d’envoi pour ne pas bloquer la suite
                logChannel.send({ embeds: [changed_embed] }).catch(() => { });
            } else {
                console.error('Channel "logs" introuvable dans le serveur.');
            }

            await interaction.editReply(changed
                ? `✅ Profil du bot mis à jour sur **${guild.name}** → ${changed}`
                : `ℹ️ Aucun champ fourni à modifier.`
            );

        } catch (err) {
            console.error("setbotprofile error:", err);
            await interaction.editReply(`❌ Échec de mise à jour du profil: ${String(err.message || err)}`);
        }
    }
};