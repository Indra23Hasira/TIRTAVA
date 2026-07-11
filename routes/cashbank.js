const express = require('express');
const router = express.Router();
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/cashbank', (req, res) => {
  const accounts = db.prepare('SELECT * FROM cash_bank_accounts ORDER BY nama').all();
  const mutations = db.prepare(`
    SELECT m.*, a.nama as akun_nama FROM cash_bank_mutations m
    JOIN cash_bank_accounts a ON a.id = m.akun_id
    ORDER BY m.id DESC LIMIT 100
  `).all();
  res.render('cashbank', { accounts, mutations });
});

router.get('/stock', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  const selectedId = req.query.product_id ? +req.query.product_id : (products[0]?.id || null);
  const movements = selectedId ? db.prepare(`
    SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 100
  `).all(selectedId) : [];
  res.render('stock', { products, movements, selectedId });
});

module.exports = router;
