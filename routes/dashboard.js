const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const startMonth = dayjs().startOf('month').format('YYYY-MM-DD');

  const penjualanHariIni = db.prepare(`SELECT COALESCE(SUM(total),0) t FROM sales WHERE tanggal = ?`).get(today).t;
  const totalKas = db.prepare(`SELECT COALESCE(SUM(saldo),0) t FROM cash_bank_accounts`).get().t;
  const totalPiutang = db.prepare(`SELECT COALESCE(SUM(sisa),0) t FROM receivables WHERE status != 'lunas'`).get().t;
  const totalHutang = db.prepare(`SELECT COALESCE(SUM(sisa),0) t FROM payables WHERE status != 'lunas'`).get().t;

  const penjualanBulanIni = db.prepare(`SELECT COALESCE(SUM(total),0) t FROM sales WHERE tanggal >= ?`).get(startMonth).t;
  const hppBulanIni = db.prepare(`
    SELECT COALESCE(SUM(si.hpp_satuan * si.qty),0) t FROM sale_items si
    JOIN sales s ON s.id = si.sale_id WHERE s.tanggal >= ?
  `).get(startMonth).t;
  const labaKotorBulanIni = penjualanBulanIni - hppBulanIni;

  const trend = db.prepare(`
    SELECT tanggal, SUM(total) as total FROM sales
    WHERE tanggal >= date(?, '-29 day')
    GROUP BY tanggal ORDER BY tanggal
  `).all(today);

  const stokKritis = db.prepare(`SELECT * FROM products WHERE stok <= stok_minimum AND is_active=1 ORDER BY stok ASC`).all();

  const piutangJatuhTempo = db.prepare(`
    SELECT r.*, c.name as customer_name FROM receivables r
    JOIN customers c ON c.id = r.customer_id
    WHERE r.status != 'lunas' ORDER BY r.jatuh_tempo ASC LIMIT 5
  `).all();

  const customerTerbesar = db.prepare(`
    SELECT c.name, SUM(s.total) as total FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.tanggal >= ?
    GROUP BY c.id ORDER BY total DESC LIMIT 5
  `).all(startMonth);

  const produkTerlaris = db.prepare(`
    SELECT p.name, SUM(si.qty) as qty FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE s.tanggal >= ?
    GROUP BY p.id ORDER BY qty DESC LIMIT 5
  `).all(startMonth);

  res.render('dashboard', {
    penjualanHariIni, totalKas, totalPiutang, totalHutang, labaKotorBulanIni,
    trend, stokKritis, piutangJatuhTempo, customerTerbesar, produkTerlaris,
  });
});

module.exports = router;
