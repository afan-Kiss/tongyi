/** 买家昵称：优先展示未脱敏的完整昵称 */

function str(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

/** 千帆/小红书常见脱敏：S*、陈*、134***7505 等 */
function isMaskedBuyerNick(nick) {
  const s = str(nick);
  if (!s || s === '买家') return false;
  if (s.includes('*')) return true;
  if (/^[xX]{1,4}$/.test(s)) return true;
  return false;
}

/** 多个来源合并时，优先未脱敏、更长的昵称 */
function pickBestBuyerNick(...candidates) {
  const list = [...new Set(candidates.map(str).filter(Boolean))];
  if (!list.length) return '买家';
  const clear = list.filter((n) => !isMaskedBuyerNick(n));
  const pool = clear.length ? clear : list.filter((n) => n !== '买家');
  if (!pool.length) return list[0] || '买家';
  return pool.sort((a, b) => b.length - a.length)[0];
}

module.exports = {
  isMaskedBuyerNick,
  pickBestBuyerNick,
};
