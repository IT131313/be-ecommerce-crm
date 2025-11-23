const db = require('../config/database');

const TAGS = {
  PROSPECT_NEW: 'prospect_new',
  LOYAL: 'loyal',
  NEEDS_ATTENTION: 'needs_attention'
};

const VALID_TAGS = new Set(Object.values(TAGS));
const AUTO_STATUSES_FOR_PURCHASE = ['completed', 'shipped'];

async function getUserTagState(userId) {
  return db.get(
    'SELECT customer_tag, customer_tag_source FROM users WHERE id = ?',
    [userId]
  );
}

async function computeAutoTag(userId) {
  const completedPurchases = await db.get(
    `SELECT COUNT(*) AS count 
     FROM orders 
     WHERE user_id = ? AND status IN (${AUTO_STATUSES_FOR_PURCHASE.map(() => '?').join(',')})`,
    [userId, ...AUTO_STATUSES_FOR_PURCHASE]
  );

  const warrantyClaims = await db.get(
    `SELECT COUNT(*) AS count 
     FROM complaints 
     WHERE user_id = ?`,
    [userId]
  );

  if ((warrantyClaims?.count || 0) >= 2) {
    return TAGS.NEEDS_ATTENTION;
  }

  if ((completedPurchases?.count || 0) >= 3) {
    return TAGS.LOYAL;
  }

  return TAGS.PROSPECT_NEW;
}

async function applyAutoTag(userId) {
  const state = await getUserTagState(userId);
  if (!state) {
    return { updated: false, tag: null };
  }

  if (state.customer_tag_source === 'manual') {
    return { updated: false, tag: state.customer_tag, skipped: true };
  }

  const nextTag = await computeAutoTag(userId);
  if (nextTag !== state.customer_tag || state.customer_tag_source !== 'auto') {
    await db.run(
      'UPDATE users SET customer_tag = ?, customer_tag_source = "auto" WHERE id = ?',
      [nextTag, userId]
    );
    return { updated: true, tag: nextTag };
  }

  return { updated: false, tag: state.customer_tag };
}

async function setManualTag(userId, tag) {
  if (!VALID_TAGS.has(tag)) {
    const error = new Error('Invalid customer tag');
    error.status = 400;
    throw error;
  }

  const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  await db.run(
    'UPDATE users SET customer_tag = ?, customer_tag_source = "manual" WHERE id = ?',
    [tag, userId]
  );

  return { updated: true, tag, source: 'manual' };
}

async function resetToAuto(userId) {
  const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  await db.run(
    'UPDATE users SET customer_tag_source = "auto" WHERE id = ?',
    [userId]
  );

  return applyAutoTag(userId);
}

module.exports = {
  TAGS,
  VALID_TAGS,
  computeAutoTag,
  applyAutoTag,
  setManualTag,
  resetToAuto
};
