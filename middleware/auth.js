const jwt = require('jsonwebtoken');
const { db } = require('../db/db');

const JWT_SECRET = process.env.JWT_SECRET || 'depot-erp-secret-dev-key-change-in-production';

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND revoked = 0').get(payload.jti);
    if (!session) return res.redirect('/login');
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.sub);
    if (!user) return res.redirect('/login');

    db.prepare('UPDATE sessions SET last_active_at = datetime(\'now\') WHERE id = ?').run(payload.jti);

    req.user = user;
    req.sessionId = payload.jti;
    res.locals.currentUser = user;
    next();
  } catch (e) {
    return res.redirect('/login');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).render('error', { message: 'Anda tidak punya akses ke halaman ini.', user: req.user });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };
