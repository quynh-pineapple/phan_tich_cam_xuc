/* bcrypt-lite.js · Băm mật khẩu bằng scrypt có sẵn trong Node (thay bcryptjs, không cần cài).
   Định dạng lưu: scrypt$<salt hex>$<hash hex>. Cùng giao diện hashSync / compareSync. */
'use strict';
const crypto = require('crypto');
const OPT = { N: 16384, r: 8, p: 1 };
exports.hashSync = (pw) => {
  const salt = crypto.randomBytes(16);
  return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(String(pw), salt, 32, OPT).toString('hex');
};
exports.compareSync = (pw, stored) => {
  const [tag, s, h] = String(stored || '').split('$');
  if (tag !== 'scrypt' || !s || !h) return false;
  const a = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 32, OPT);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
