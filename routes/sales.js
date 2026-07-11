const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const acc = require('../services/accounting');

router.use(requireAuth);

router.get('/sales', (req, res) => {
  const sales = db.prepare(`
    SELECT s.*, c.name as customer_name FROM sales s
    JOIN customers c ON c.id = s.customer_id
    ORDER BY s.id DESC LIMIT 100
  `).all();
  res.render('sales', { sales });
});

router.get('/sales/new', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers WHERE is_active=1 ORDER BY name').all();
  const products = db.prepare("SELECT * FROM products WHERE type='barang_jadi' AND is_active=1 ORDER BY name").all();
  const accounts = db.prepare('SELECT * FROM cash_bank_accounts').all();
  res.render('sale_form', { customers, products, accounts });
});

router.post('/sales', (req, res) => {
  const { customer_id, tanggal, jenis_bayar, akun_id, jatuh_tempo, product_id, qty, harga } = req.body;
  const tgl = tanggal || dayjs().format('YYYY-MM-DD');

  const productIds = [].concat(product_id || []);
  const qtys = [].concat(qty || []);
  const hargas = [].concat(harga || []);
  const items = productIds.map((pid, i) => ({
    product_id: +pid, qty: +qtys[i], harga_satuan: +hargas[i], subtotal: +qtys[i] * +hargas[i],
  })).filter(it => it.product_id && it.qty > 0);

  if (items.length === 0) return res.redirect('/sales/new');

  const total = items.reduce((s, it) => s + it.subtotal, 0);
  const no_transaksi = acc.nextNumber('SL', 'sales', 'no_transaksi');

  const txn = db.transaction(() => {
    const info = db.prepare(`INSERT INTO sales (no_transaksi, tanggal, customer_id, user_id, jenis_bayar, akun_id, total, jatuh_tempo)
      VALUES (?,?,?,?,?,?,?,?)`).run(no_transaksi, tgl, +customer_id, req.user.id, jenis_bayar, akun_id || null, total, jatuh_tempo || null);
    const saleId = info.lastInsertRowid;

    let totalHpp = 0;
    const insItem = db.prepare(`INSERT INTO sale_items (sale_id, product_id, qty, harga_satuan, subtotal, hpp_satuan) VALUES (?,?,?,?,?,?)`);
    for (const it of items) {
      const prod = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      const hppSatuan = prod.hpp_rata2;
      totalHpp += hppSatuan * it.qty;
      insItem.run(saleId, it.product_id, it.qty, it.harga_satuan, it.subtotal, hppSatuan);
      acc.moveStock({ product_id: it.product_id, tanggal: tgl, jenis: 'out', qty: it.qty, ref_tipe: 'sale', ref_id: saleId, keterangan: `Penjualan ${no_transaksi}` });
    }

    if (jenis_bayar === 'cash') {
      acc.cashBankMutation({ akun_id: +akun_id, tanggal: tgl, jenis: 'masuk', jumlah: total, ref_tipe: 'sale', ref_id: saleId, keterangan: `Penerimaan penjualan ${no_transaksi}` });
      const kodeAkun = acc.accountCodeForAkun(+akun_id);
      acc.postJournal({
        tanggal: tgl, ref_tipe: 'sale', ref_id: saleId, keterangan: `Penjualan tunai ${no_transaksi}`,
        lines: [
          { code: kodeAkun, debit: total, kredit: 0 },
          { code: '4101', debit: 0, kredit: total },
        ]
      });
    } else {
      db.prepare(`INSERT INTO receivables (customer_id, sale_id, tanggal, jumlah, sisa, jatuh_tempo) VALUES (?,?,?,?,?,?)`)
        .run(+customer_id, saleId, tgl, total, total, jatuh_tempo || null);
      db.prepare('UPDATE customers SET saldo_piutang = saldo_piutang + ? WHERE id=?').run(total, +customer_id);
      acc.postJournal({
        tanggal: tgl, ref_tipe: 'sale', ref_id: saleId, keterangan: `Penjualan kredit ${no_transaksi}`,
        lines: [
          { code: '1103', debit: total, kredit: 0 },
          { code: '4101', debit: 0, kredit: total },
        ]
      });
    }

    // Jurnal HPP (selalu terjadi, cash maupun kredit)
    if (totalHpp > 0) {
      acc.postJournal({
        tanggal: tgl, ref_tipe: 'sale_hpp', ref_id: saleId, keterangan: `HPP penjualan ${no_transaksi}`,
        lines: [
          { code: '5101', debit: totalHpp, kredit: 0 },
          { code: '1105', debit: 0, kredit: totalHpp },
        ]
      });
    }
  });

  try {
    txn();
    res.redirect('/sales');
  } catch (e) {
    res.status(400).render('error', { message: e.message, user: req.user });
  }
});

module.exports = router;
