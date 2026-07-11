const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function periodFilter(req) {
  const start = req.query.start || dayjs().startOf('month').format('YYYY-MM-DD');
  const end = req.query.end || dayjs().format('YYYY-MM-DD');
  return { start, end };
}

// ---------------- LABA RUGI ----------------
router.get('/reports/laba-rugi', (req, res) => {
  const { start, end } = periodFilter(req);
  const rows = db.prepare(`
    SELECT a.type, a.code, a.name, COALESCE(SUM(jd.debit),0) debit, COALESCE(SUM(jd.kredit),0) kredit
    FROM journal_details jd
    JOIN journals j ON j.id = jd.journal_id
    JOIN accounts a ON a.id = jd.account_id
    WHERE j.tanggal BETWEEN ? AND ? AND a.type IN ('pendapatan','beban')
    GROUP BY a.id ORDER BY a.type DESC, a.code
  `).all(start, end);

  const pendapatan = rows.filter(r => r.type === 'pendapatan').map(r => ({ ...r, nilai: r.kredit - r.debit }));
  const beban = rows.filter(r => r.type === 'beban').map(r => ({ ...r, nilai: r.debit - r.kredit }));
  const totalPendapatan = pendapatan.reduce((s, r) => s + r.nilai, 0);
  const totalBeban = beban.reduce((s, r) => s + r.nilai, 0);
  const labaBersih = totalPendapatan - totalBeban;

  res.render('reports/laba_rugi', { start, end, pendapatan, beban, totalPendapatan, totalBeban, labaBersih });
});

// ---------------- NERACA ----------------
router.get('/reports/neraca', (req, res) => {
  const asOf = req.query.as_of || dayjs().format('YYYY-MM-DD');
  const rows = db.prepare(`
    SELECT a.type, a.code, a.name, COALESCE(SUM(jd.debit),0) debit, COALESCE(SUM(jd.kredit),0) kredit
    FROM journal_details jd
    JOIN journals j ON j.id = jd.journal_id
    JOIN accounts a ON a.id = jd.account_id
    WHERE j.tanggal <= ?
    GROUP BY a.id ORDER BY a.type, a.code
  `).all(asOf);

  const aset = rows.filter(r => r.type === 'aset').map(r => ({ ...r, nilai: r.debit - r.kredit }));
  const kewajiban = rows.filter(r => r.type === 'kewajiban').map(r => ({ ...r, nilai: r.kredit - r.debit }));
  const ekuitas = rows.filter(r => r.type === 'ekuitas').map(r => ({ ...r, nilai: r.kredit - r.debit }));
  const pendapatan = rows.filter(r => r.type === 'pendapatan').reduce((s, r) => s + (r.kredit - r.debit), 0);
  const beban = rows.filter(r => r.type === 'beban').reduce((s, r) => s + (r.debit - r.kredit), 0);
  const labaBerjalan = pendapatan - beban;

  const totalAset = aset.reduce((s, r) => s + r.nilai, 0);
  const totalKewajiban = kewajiban.reduce((s, r) => s + r.nilai, 0);
  const totalEkuitas = ekuitas.reduce((s, r) => s + r.nilai, 0) + labaBerjalan;

  res.render('reports/neraca', { asOf, aset, kewajiban, ekuitas, labaBerjalan, totalAset, totalKewajiban, totalEkuitas });
});

// ---------------- ARUS KAS ----------------
router.get('/reports/arus-kas', (req, res) => {
  const { start, end } = periodFilter(req);
  const rows = db.prepare(`
    SELECT ref_tipe, jenis, SUM(jumlah) total FROM cash_bank_mutations
    WHERE tanggal BETWEEN ? AND ?
    GROUP BY ref_tipe, jenis ORDER BY ref_tipe
  `).all(start, end);

  const masuk = rows.filter(r => r.jenis === 'masuk');
  const keluar = rows.filter(r => r.jenis === 'keluar');
  const totalMasuk = masuk.reduce((s, r) => s + r.total, 0);
  const totalKeluar = keluar.reduce((s, r) => s + r.total, 0);

  res.render('reports/arus_kas', { start, end, masuk, keluar, totalMasuk, totalKeluar, netCash: totalMasuk - totalKeluar });
});

// ---------------- MUTASI STOK ----------------
router.get('/reports/mutasi-stok', (req, res) => {
  const { start, end } = periodFilter(req);
  const products = db.prepare('SELECT * FROM products ORDER BY name').all();
  const productId = req.query.product_id ? +req.query.product_id : (products[0]?.id);
  const movements = productId ? db.prepare(`
    SELECT * FROM stock_movements WHERE product_id=? AND tanggal BETWEEN ? AND ? ORDER BY id
  `).all(productId, start, end) : [];
  res.render('reports/mutasi_stok', { start, end, products, productId, movements });
});

// ---------------- HPP PER PRODUK ----------------
router.get('/reports/hpp', (req, res) => {
  const { start, end } = periodFilter(req);
  const rows = db.prepare(`
    SELECT pr.no_produksi, pr.tanggal, p.name as product_name, pr.qty_hasil, pr.total_hpp, pr.hpp_per_unit
    FROM productions pr JOIN products p ON p.id = pr.product_id
    WHERE pr.tanggal BETWEEN ? AND ? ORDER BY pr.tanggal DESC
  `).all(start, end);
  res.render('reports/hpp', { start, end, rows });
});

// ---------------- PRODUK TERLARIS ----------------
router.get('/reports/produk-terlaris', (req, res) => {
  const { start, end } = periodFilter(req);
  const rows = db.prepare(`
    SELECT p.name, p.unit, SUM(si.qty) as total_qty, SUM(si.subtotal) as total_omzet
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE s.tanggal BETWEEN ? AND ?
    GROUP BY p.id ORDER BY total_qty DESC
  `).all(start, end);
  res.render('reports/produk_terlaris', { start, end, rows });
});

// ---------------- CUSTOMER TERBESAR ----------------
router.get('/reports/customer-terbesar', (req, res) => {
  const { start, end } = periodFilter(req);
  const rows = db.prepare(`
    SELECT c.name, c.tipe, COUNT(s.id) jumlah_transaksi, SUM(s.total) total_omzet
    FROM sales s JOIN customers c ON c.id = s.customer_id
    WHERE s.tanggal BETWEEN ? AND ?
    GROUP BY c.id ORDER BY total_omzet DESC
  `).all(start, end);
  res.render('reports/customer_terbesar', { start, end, rows });
});

module.exports = router;
