// DB
const db = require('../data/db');

// -------- Helpers DB (db-based) --------
async function loadUserData(guildId, userId) {
  const [rows] = await db.query(
    `
    SELECT l.id AS level_id, l.xp, l.level
    FROM levels l
    JOIN levels_has_serverconfig ls ON ls.levels_id = l.id
    JOIN serverconfig sc ON sc.id = ls.serverconfig_id
    WHERE sc.server_id = ? AND l.user_id = ?
    LIMIT 1
  `,
    [guildId, userId]
  );

  if (rows.length) {
    return { levelId: rows[0].level_id, xp: rows[0].xp, level: rows[0].level };
  }
  return { levelId: null, xp: 0, level: 1 };
}

async function saveUserData(guildId, userId, xp, level, levelId = null) {
  // On encapsule dans une transaction pour garder (levels + liaison) cohérents
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Récupérer (ou vérifier) le serverconfig.id
    const [serverRows] = await conn.query(
      'SELECT id FROM serverconfig WHERE server_id = ? LIMIT 1',
      [guildId]
    );
    if (!serverRows.length) {
      throw new Error(`Le serveur ${guildId} n'existe pas dans serverconfig.`);
    }
    const serverConfigId = serverRows[0].id;

    // 2) Si on a déjà un levelId, on met à jour; sinon on insère + lie
    if (levelId) {
      await conn.query('UPDATE levels SET xp = ?, level = ? WHERE id = ?', [
        xp,
        level,
        levelId,
      ]);
    } else {
      const [ins] = await conn.query(
        'INSERT INTO levels (user_id, xp, level) VALUES (?, ?, ?)',
        [userId, xp, level]
      );
      levelId = ins.insertId;
      await conn.query(
        'INSERT INTO levels_has_serverconfig (levels_id, serverconfig_id) VALUES (?, ?)',
        [levelId, serverConfigId]
      );
    }

    await conn.commit();
    return levelId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function nextLevelThreshold(currentLevel) {
  // même formule que ton code d’origine
  return 5 * Math.pow(currentLevel, 2) + 50;
}

async function addXP(message, xpGained) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  const data = await loadUserData(guildId, userId);

  let newXP = data.xp + xpGained;
  let newLevel = data.level;

  const threshold = nextLevelThreshold(newLevel);
  if (newXP >= threshold) {
    newLevel += 1;
    newXP = 0;
    // petite annonce niveau (non bloquante)
    message.channel
      .send(`🎉 **${message.author.username}** passe au **niveau ${newLevel}** ! Félicitations !`)
      .catch(() => {});
  }

  await saveUserData(guildId, userId, newXP, newLevel, data.levelId);
}

// -------- Event listener --------
module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    try {
      // Ignore les bots et les DM
      if (message.author.bot || !message.guild) return;

      // (Optionnel) Anti-spam ultra simple : ignore si message < 2 caractères
      if ((message.content || '').trim().length < 2) return;

      const XP_PER_MESSAGE = 10;
      await addXP(message, XP_PER_MESSAGE);
    } catch (error) {
      console.error('Erreur lors de l’ajout d’XP :', error);
    }
  },
};
