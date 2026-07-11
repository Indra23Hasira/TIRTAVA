const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const acc = require('../services/accounting');

router.use(requireAuth);

// ---------------- PENGELUARAN OPERASIONAL ----------------
router.get('/expenses', (req, res) => {
  const expenses = db.prepare(`
    SELECT e.*, a.nama as akun_nama FROM operational_expenses e
    JOIN cash_bank_accounts a ON a.id = e.akun_id
    ORDER BY e.id DESC LIMIT 100
  `).all();
  const accounts = db.prepare('SELECT * FROM cash_bank_accounts').all();
  res.render('expenses', { expenses, accounts });
});

router.post('/expenses', (req, res) => {
  const { tanggal, kategori, jumlah, akun_id, keterangan } = req.body;
  const tgl = tanggal || dayjs().format('YYYY-MM-DD');
  const jml = +jumlah;

  const txn = db.transaction(() => {
    const info = db.prepare(`INSERT INTO operational_expenses (tanggal, kategori, jumlah, akun_id, keterangan, user_id)
      VALUES (?,?,?,?,?,?)`).run(tgl, kategori, jml, +akun_id, keterangan, req.user.id);

    acc.cashBankMutation({ akun_id: +akun_id, tanggal: tgl, jenis: 'keluar', jumlah: jml, ref_tipe: 'expense', ref_id: info.lastInsertRowid, keterangan: `Beban ${kategori}: ${keterangan || ''}` });
    const kodeAkun = acc.accountCodeForAkun(+akun_id);
    acc.postJournal({
      tanggal: tgl, ref_tipe: 'expense', ref_id: info.lastInsertRowid, keterangan: `Beban operasional: ${kategori}`,
      lines: [
        { code: '6101', debit: jml, kredit: 0 },
        { code: kodeAkun, debit: 0, kredit: jml },
      ]
    });
  });

  try { txn(); } catch (e) { return res.status(400).render('error', { message: e.message, user: req.user }); }
  res.redirect('/expenses');
});

// ---------------- ASET TETAP ----------------
router.get('/assets', (req, res) => {
  const assets = db.prepare('SELECT * FROM fixed_assets ORDER BY id DESC').all();
  res.render('assets', { assets });
});

router.post('/assets', (req, res) => {
  const { nama, kategori, tanggal_beli, harga_beli, umur_bulan, nilai_residu } = req.body;
  db.prepare(`INSERT INTO fixed_assets (nama, kategori, tanggal_beli, harga_beli, umur_bulan, nilai_residu)
    VALUES (?,?,?,?,?,?)`).run(nama, kategori, tanggal_beli, +harga_beli, +umur_bulan, +nilai_residu || 0);
  res.redirect('/assets');
});

// Hitung & posting penyusutan bulan berjalan (bisa dijalankan manual dari tombol / dijadwalkan cron)
router.post('/assets/:id/depreciate', (req, res) => {
  const asset = db.prepare('SELECT * FROM fixed_assets WHERE id=?').get(req.params.id);
  if (!asset) return res.redirect('/assets');
  const periode = dayjs().format('YYYY-MM');
  const already = db.prepare('SELECT * FROM asset_depreciations WHERE asset_id=? AND periode=?').get(asset.id, periode);
  if (already) return res.redirect('/assets');

  const penyusutanPerBulan = (asset.harga_beli - asset.nilai_residu) / asset.umur_bulan;
  const tgl = dayjs().format('YYYY-MM-DD');

  const txn = db.transaction(() => {
    db.prepare('INSERT INTO asset_depreciations (asset_id, periode, jumlah) VALUES (?,?,?)').run(asset.id, periode, penyusutanPerBulan);
    db.prepare('UPDATE fixed_assets SET akumulasi_penyusutan = akumulasi_penyusutan + ? WHERE id=?').run(penyusutanPerBulan, asset.id);
    acc.postJournal({
      tanggal: tgl, ref_tipe: 'depreciation', ref_id: asset.id, keterangan: `Penyusutan ${asset.nama} periode ${periode}`,
      lines: [
        { code: '6102', debit: penyusutanPerBulan, kredit: 0 },
        { code: '1202', debit: 0, kredit: penyusutanPerBulan },
      ]
    });
  });

  try { txn(); } catch (e) { return res.status(400).render('error', { message: e.message, user: req.user }); }
  res.redirect('/assets');
});

module.exports = router;
