const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// ---------------- PRODUK ----------------
router.get('/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  res.render('products', { products });
});

router.post('/products', (req, res) => {
  const { code, name, category, type, unit, harga_jual, stok_minimum } = req.body;
  db.prepare(`INSERT INTO products (code, name, category, type, unit, harga_jual, stok_minimum)
    VALUES (?,?,?,?,?,?,?)`).run(code, name, category, type, unit, +harga_jual || 0, +stok_minimum || 0);
  res.redirect('/products');
});

router.post('/products/:id/edit', (req, res) => {
  const { name, harga_jual, stok_minimum, is_active } = req.body;
  db.prepare(`UPDATE products SET name=?, harga_jual=?, stok_minimum=?, is_active=? WHERE id=?`)
    .run(name, +harga_jual || 0, +stok_minimum || 0, is_active ? 1 : 0, req.params.id);
  res.redirect('/products');
});

// ---------------- CUSTOMER ----------------
router.get('/customers', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
  res.render('customers', { customers });
});

router.post('/customers', (req, res) => {
  const { code, name, phone, address, tipe } = req.body;
  db.prepare('INSERT INTO customers (code, name, phone, address, tipe) VALUES (?,?,?,?,?)')
    .run(code, name, phone, address, tipe);
  res.redirect('/customers');
});

// ---------------- SUPPLIER ----------------
router.get('/suppliers', (req, res) => {
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name').all();
  res.render('suppliers', { suppliers });
});

router.post('/suppliers', (req, res) => {
  const { code, name, phone, address } = req.body;
  db.prepare('INSERT INTO suppliers (code, name, phone, address) VALUES (?,?,?,?)')
    .run(code, name, phone, address);
  res.redirect('/suppliers');
});

// ---------------- USER (hanya owner) ----------------
router.get('/users', requireRole('owner', 'admin'), (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name').all();
  res.render('users', { users });
});

router.post('/users', requireRole('owner', 'admin'), (req, res) => {
  const { name, email, password, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
    .run(name, email, hash, role);
  res.redirect('/users');
});

router.post('/users/:id/toggle', requireRole('owner', 'admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  db.prepare('UPDATE users SET is_active=? WHERE id=?').run(u.is_active ? 0 : 1, req.params.id);
  res.redirect('/users');
});

// ---------------- KAS & BANK (master akun) ----------------
router.post('/cashbank/accounts', requireRole('owner', 'admin'), (req, res) => {
  const { nama, jenis, saldo } = req.body;
  const account_code = jenis === 'bank' ? '1102' : '1101';
  db.prepare('INSERT INTO cash_bank_accounts (nama, jenis, account_code, saldo) VALUES (?,?,?,?)')
    .run(nama, jenis, account_code, +saldo || 0);
  res.redirect('/cashbank');
});

module.exports = router;
