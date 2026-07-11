const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const acc = require('../services/accounting');

router.use(requireAuth);

router.get('/productions', (req, res) => {
  const productions = db.prepare(`
    SELECT pr.*, p.name as product_name, p.unit FROM productions pr
    JOIN products p ON p.id = pr.product_id
    ORDER BY pr.id DESC LIMIT 100
  `).all();
  res.render('productions', { productions });
});

router.get('/productions/new', (req, res) => {
  const finishedGoods = db.prepare("SELECT * FROM products WHERE type='barang_jadi' AND is_active=1 ORDER BY name").all();
  const materials = db.prepare("SELECT * FROM products WHERE type='bahan_baku' AND is_active=1 ORDER BY name").all();
  const accounts = db.prepare('SELECT * FROM cash_bank_accounts').all();
  res.render('production_form', { finishedGoods, materials, accounts });
});

router.post('/productions', (req, res) => {
  const { product_id, qty_hasil, tanggal, material_id, material_qty, biaya_tenaga_kerja, biaya_listrik, biaya_overhead, akun_id } = req.body;
  const tgl = tanggal || dayjs().format('YYYY-MM-DD');

  const matIds = [].concat(material_id || []);
  const matQtys = [].concat(material_qty || []);
  const materials = matIds.map((mid, i) => ({ product_id: +mid, qty: +matQtys[i] }))
    .filter(m => m.product_id && m.qty > 0);

  const no_produksi = acc.nextNumber('PRD', 'productions', 'no_produksi');

  const txn = db.transaction(() => {
    let biayaBahan = 0;
    const matDetails = [];
    for (const m of materials) {
      const prod = db.prepare('SELECT * FROM products WHERE id=?').get(m.product_id);
      const subtotal = prod.hpp_rata2 * m.qty;
      biayaBahan += subtotal;
      matDetails.push({ ...m, harga_satuan: prod.hpp_rata2, subtotal });
    }

    const biayaProduksi = (+biaya_tenaga_kerja || 0) + (+biaya_listrik || 0) + (+biaya_overhead || 0);
    const totalHpp = biayaBahan + biayaProduksi;
    const qtyHasilNum = +qty_hasil;
    const hppPerUnit = qtyHasilNum > 0 ? totalHpp / qtyHasilNum : 0;

    const info = db.prepare(`INSERT INTO productions (no_produksi, tanggal, product_id, qty_hasil, user_id, total_hpp, hpp_per_unit)
      VALUES (?,?,?,?,?,?,?)`).run(no_produksi, tgl, +product_id, qtyHasilNum, req.user.id, totalHpp, hppPerUnit);
    const prodId = info.lastInsertRowid;

    const insMat = db.prepare(`INSERT INTO production_materials (production_id, product_id, qty, harga_satuan, subtotal) VALUES (?,?,?,?,?)`);
    for (const m of matDetails) {
      insMat.run(prodId, m.product_id, m.qty, m.harga_satuan, m.subtotal);
      acc.moveStock({ product_id: m.product_id, tanggal: tgl, jenis: 'out', qty: m.qty, ref_tipe: 'production', ref_id: prodId, keterangan: `Pemakaian bahan produksi ${no_produksi}` });
    }

    const insCost = db.prepare(`INSERT INTO production_costs (production_id, jenis, jumlah) VALUES (?,?,?)`);
    if (+biaya_tenaga_kerja) insCost.run(prodId, 'tenaga_kerja', +biaya_tenaga_kerja);
    if (+biaya_listrik) insCost.run(prodId, 'listrik', +biaya_listrik);
    if (+biaya_overhead) insCost.run(prodId, 'overhead', +biaya_overhead);

    // barang jadi masuk stok sebesar HPP produksi (moving average juga diterapkan agar konsisten)
    acc.updateMovingAverage(+product_id, qtyHasilNum, hppPerUnit);
    acc.moveStock({ product_id: +product_id, tanggal: tgl, jenis: 'in', qty: qtyHasilNum, ref_tipe: 'production', ref_id: prodId, keterangan: `Hasil produksi ${no_produksi}` });

    // Biaya produksi (tenaga kerja/listrik/overhead) dianggap dibayar tunai saat itu juga,
    // sehingga langsung mengurangi kas/bank -- bukan akun kontra yang membingungkan.
    const lines = [{ code: '1105', debit: totalHpp, kredit: 0 }];
    if (biayaBahan > 0) lines.push({ code: '1104', debit: 0, kredit: biayaBahan });
    if (biayaProduksi > 0) {
      if (!akun_id) throw new Error('Pilih akun kas/bank sumber dana biaya produksi');
      const kodeAkun = acc.accountCodeForAkun(+akun_id);
      lines.push({ code: kodeAkun, debit: 0, kredit: biayaProduksi });
      acc.cashBankMutation({
        akun_id: +akun_id, tanggal: tgl, jenis: 'keluar', jumlah: biayaProduksi,
        ref_tipe: 'production', ref_id: prodId, keterangan: `Biaya produksi ${no_produksi}`
      });
    }

    acc.postJournal({
      tanggal: tgl, ref_tipe: 'production', ref_id: prodId,
      keterangan: `Produksi ${no_produksi}`,
      lines
    });
  });

  try {
    txn();
    res.redirect('/productions');
  } catch (e) {
    res.status(400).render('error', { message: e.message, user: req.user });
  }
});

module.exports = router;
