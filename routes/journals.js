const express = require('express');
const router = express.Router();
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const acc = require('../services/accounting');
const dayjs = require('dayjs');

router.use(requireAuth);

router.get('/journals', (req, res) => {
  const journals = db.prepare('SELECT * FROM journals ORDER BY id DESC LIMIT 100').all();
  const details = db.prepare(`
    SELECT jd.journal_id, a.code, a.name, jd.debit, jd.kredit
    FROM journal_details jd JOIN accounts a ON a.id = jd.account_id
    ORDER BY jd.id
  `).all();
  const detailMap = {};
  for (const d of details) {
    if (!detailMap[d.journal_id]) detailMap[d.journal_id] = [];
    detailMap[d.journal_id].push(d);
  }
  res.render('journals', { journals, detailMap });
});

router.get('/journals/manual', (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY code').all();
  res.render('journal_manual', { accounts });
});

router.post('/journals/manual', (req, res) => {
  const { tanggal, keterangan, account_code, debit, kredit } = req.body;
  const codes = [].concat(account_code || []);
  const debits = [].concat(debit || []);
  const kredits = [].concat(kredit || []);
  const lines = codes.map((c, i) => ({ code: c, debit: +debits[i] || 0, kredit: +kredits[i] || 0 })).filter(l => l.code);

  try {
    acc.postJournal({ tanggal: tanggal || dayjs().format('YYYY-MM-DD'), ref_tipe: 'manual', ref_id: null, keterangan, lines });
    res.redirect('/journals');
  } catch (e) {
    res.status(400).render('error', { message: e.message, user: req.user });
  }
});

module.exports = router;
