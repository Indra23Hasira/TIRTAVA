const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const acc = require('../services/accounting');

router.use(requireAuth);

router.get('/purchases', (req, res) => {
  const purchases = db.prepare(`
    SELECT p.*, s.name as supplier_name FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.id DESC LIMIT 100
  `).all();
  res.render('purchases', { purchases });
});

router.get('/purchases/new', (req, res) => {
  const suppliers = db.prepare('SELECT * FROM suppliers WHERE is_active=1 ORDER BY name').all();
  const products = db.prepare("SELECT * FROM products WHERE type='bahan_baku' AND is_active=1 ORDER BY name").all();
  const accounts = db.prepare('SELECT * FROM cash_bank_accounts').all();
  res.render('purchase_form', { suppliers, products, accounts });
});

router.post('/purchases', (req, res) => {
  const { supplier_id, tanggal, jenis_bayar, akun_id, jatuh_tempo, product_id, qty, harga } = req.body;

  const productIds = [].concat(product_id || []);
  const qtys = [].concat(qty || []);
  const hargas = [].concat(harga || []);

  const items = productIds.map((pid, i) => ({
    product_id: +pid,
    qty: +qtys[i],
    harga_satuan: +hargas[i],
    subtotal: +qtys[i] * +hargas[i],
  })).filter(it => it.product_id && it.qty > 0);

  if (items.length === 0) return res.redirect('/purchases/new');

  const total = items.reduce((s, it) => s + it.subtotal, 0);
  const no_transaksi = acc.nextNumber('PB', 'purchases', 'no_transaksi');
  const tgl = tanggal || dayjs().format('YYYY-MM-DD');

  const txn = db.transaction(() => {
    const info = db.prepare(`INSERT INTO purchases (no_transaksi, tanggal, supplier_id, user_id, jenis_bayar, akun_id, total, jatuh_tempo)
      VALUES (?,?,?,?,?,?,?,?)`).run(no_transaksi, tgl, +supplier_id, req.user.id, jenis_bayar, akun_id || null, total, jatuh_tempo || null);
    const purchaseId = info.lastInsertRowid;

    const insItem = db.prepare(`INSERT INTO purchase_items (purchase_id, product_id, qty, harga_satuan, subtotal) VALUES (?,?,?,?,?)`);
    for (const it of items) {
      insItem.run(purchaseId, it.product_id, it.qty, it.harga_satuan, it.subtotal);
      acc.updateMovingAverage(it.product_id, it.qty, it.harga_satuan);
      acc.moveStock({
        product_id: it.product_id, tanggal: tgl, jenis: 'in', qty: it.qty,
        ref_tipe: 'purchase', ref_id: purchaseId, keterangan: `Pembelian ${no_transaksi}`
      });
    }

    if (jenis_bayar === 'cash') {
      acc.cashBankMutation({
        akun_id: +akun_id, tanggal: tgl, jenis: 'keluar', jumlah: total,
        ref_tipe: 'purchase', ref_id: purchaseId, keterangan: `Pembayaran pembelian ${no_transaksi}`
      });
      const kodeAkun = acc.accountCodeForAkun(+akun_id);
      acc.postJournal({
        tanggal: tgl, ref_tipe: 'purchase', ref_id: purchaseId,
        keterangan: `Pembelian tunai ${no_transaksi}`,
        lines: [
          { code: '1104', debit: total, kredit: 0 },
          { code: kodeAkun, debit: 0, kredit: total },
        ]
      });
    } else {
      db.prepare(`INSERT INTO payables (supplier_id, purchase_id, tanggal, jumlah, sisa, jatuh_tempo) VALUES (?,?,?,?,?,?)`)
        .run(+supplier_id, purchaseId, tgl, total, total, jatuh_tempo || null);
      db.prepare('UPDATE suppliers SET saldo_hutang = saldo_hutang + ? WHERE id=?').run(total, +supplier_id);
      acc.postJournal({
        tanggal: tgl, ref_tipe: 'purchase', ref_id: purchaseId,
        keterangan: `Pembelian kredit ${no_transaksi}`,
        lines: [
          { code: '1104', debit: total, kredit: 0 },
          { code: '2101', debit: 0, kredit: total },
        ]
      });
    }
  });

  try {
    txn();
    res.redirect('/purchases');
  } catch (e) {
    res.status(400).render('error', { message: e.message, user: req.user });
  }
});

module.exports = router;
