const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const acc = require('../services/accounting');

router.use(requireAuth);

// ---------------- PIUTANG ----------------
router.get('/receivables', (req, res) => {
  const receivables = db.prepare(`
    SELECT r.*, c.name as customer_name, s.no_transaksi
    FROM receivables r
    JOIN customers c ON c.id = r.customer_id
    JOIN sales s ON s.id = r.sale_id
    WHERE r.status != 'lunas'
    ORDER BY r.jatuh_tempo ASC
  `).all();
  const today = dayjs();
  const withAging = receivables.map(r => {
    const days = r.jatuh_tempo ? today.diff(dayjs(r.jatuh_tempo), 'day') : 0;
    return { ...r, overdue: r.jatuh_tempo && days > 0, days_overdue: days };
  });
  const accounts = db.prepare('SELECT * FROM cash_bank_accounts').all();
  res.render('receivables', { receivables: withAging, accounts });
});

router.post('/receivables/:id/pay', (req, res) => {
  const { jumlah, akun_id, tanggal } = req.body;
  const tgl = tanggal || dayjs().format('YYYY-MM-DD');
  const rec = db.prepare('SELECT * FROM receivables WHERE id=?').get(req.params.id);
  if (!rec) return res.redirect('/receivables');
  const bayar = Math.min(+jumlah, rec.sisa);

  const txn = db.transaction(() => {
    db.prepare('INSERT INTO receivable_payments (receivable_id, tanggal, jumlah, akun_id) VALUES (?,?,?,?)')
      .run(rec.id, tgl, bayar, +akun_id);
    const sisaBaru = rec.sisa - bayar;
    db.prepare('UPDATE receivables SET sisa=?, status=? WHERE id=?')
      .run(sisaBaru, sisaBaru <= 0.01 ? 'lunas' : 'sebagian', rec.id);
    db.prepare('UPDATE customers SET saldo_piutang = saldo_piutang - ? WHERE id=?').run(bayar, rec.customer_id);

    acc.cashBankMutation({ akun_id: +akun_id, tanggal: tgl, jenis: 'masuk', jumlah: bayar, ref_tipe: 'receivable_payment', ref_id: rec.id, keterangan: `Pelunasan piutang #${rec.id}` });
    const kodeAkun = acc.accountCodeForAkun(+akun_id);
    acc.postJournal({
      tanggal: tgl, ref_tipe: 'receivable_payment', ref_id: rec.id, keterangan: `Pelunasan piutang #${rec.id}`,
      lines: [
        { code: kodeAkun, debit: bayar, kredit: 0 },
        { code: '1103', debit: 0, kredit: bayar },
      ]
    });
  });

  try { txn(); } catch (e) { return res.status(400).render('error', { message: e.message, user: req.user }); }
  res.redirect('/receivables');
});

// ---------------- HUTANG ----------------
router.get('/payables', (req, res) => {
  const payables = db.prepare(`
    SELECT p.*, s.name as supplier_name, pu.no_transaksi
    FROM payables p
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN purchases pu ON pu.id = p.purchase_id
    WHERE p.status != 'lunas'
    ORDER BY p.jatuh_tempo ASC
  `).all();
  const today = dayjs();
  const withAging = payables.map(p => {
    const days = p.jatuh_tempo ? today.diff(dayjs(p.jatuh_tempo), 'day') : 0;
    return { ...p, overdue: p.jatuh_tempo && days > 0, days_overdue: days };
  });
  const accounts = db.prepare('SELECT * FROM cash_bank_accounts').all();
  res.render('payables', { payables: withAging, accounts });
});

router.post('/payables/:id/pay', (req, res) => {
  const { jumlah, akun_id, tanggal } = req.body;
  const tgl = tanggal || dayjs().format('YYYY-MM-DD');
  const pay = db.prepare('SELECT * FROM payables WHERE id=?').get(req.params.id);
  if (!pay) return res.redirect('/payables');
  const bayar = Math.min(+jumlah, pay.sisa);

  const txn = db.transaction(() => {
    db.prepare('INSERT INTO payable_payments (payable_id, tanggal, jumlah, akun_id) VALUES (?,?,?,?)')
      .run(pay.id, tgl, bayar, +akun_id);
    const sisaBaru = pay.sisa - bayar;
    db.prepare('UPDATE payables SET sisa=?, status=? WHERE id=?')
      .run(sisaBaru, sisaBaru <= 0.01 ? 'lunas' : 'sebagian', pay.id);
    db.prepare('UPDATE suppliers SET saldo_hutang = saldo_hutang - ? WHERE id=?').run(bayar, pay.supplier_id);

    acc.cashBankMutation({ akun_id: +akun_id, tanggal: tgl, jenis: 'keluar', jumlah: bayar, ref_tipe: 'payable_payment', ref_id: pay.id, keterangan: `Pembayaran hutang #${pay.id}` });
    const kodeAkun = acc.accountCodeForAkun(+akun_id);
    acc.postJournal({
      tanggal: tgl, ref_tipe: 'payable_payment', ref_id: pay.id, keterangan: `Pembayaran hutang #${pay.id}`,
      lines: [
        { code: '2101', debit: bayar, kredit: 0 },
        { code: kodeAkun, debit: 0, kredit: bayar },
      ]
    });
  });

  try { txn(); } catch (e) { return res.status(400).render('error', { message: e.message, user: req.user }); }
  res.redirect('/payables');
});

module.exports = router;
