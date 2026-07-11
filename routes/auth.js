const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/db');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

router.get('/login', (req, res) => {
  if (req.cookies?.token) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { email, password, device_name } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.render('login', { error: 'Email atau password salah.' });
  }

  const jti = uuidv4();
  db.prepare(
    `INSERT INTO sessions (id, user_id, device_name, ip_address, user_agent) VALUES (?,?,?,?,?)`
  ).run(jti, user.id, device_name || 'Perangkat tidak dikenal', req.ip, req.headers['user-agent'] || '');

  const token = jwt.sign({ sub: user.id, jti }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 3600 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(payload.jti);
    } catch (e) {}
  }
  res.clearCookie('token');
  res.redirect('/login');
});

// Daftar & kelola device aktif (multi-device session management)
router.get('/account/devices', requireAuth, (req, res) => {
  const sessions = db.prepare(
    `SELECT * FROM sessions WHERE user_id = ? AND revoked = 0 ORDER BY last_active_at DESC`
  ).all(req.user.id);
  res.render('devices', { sessions, currentSessionId: req.sessionId });
});

router.post('/account/devices/:id/revoke', requireAuth, (req, res) => {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.redirect('/account/devices');
});

module.exports = router;
