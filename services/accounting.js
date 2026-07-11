const { db } = require('../db/db');
const dayjs = require('dayjs');

function getAccountByCode(code) {
  const acc = db.prepare('SELECT * FROM accounts WHERE code = ?').get(code);
  if (!acc) throw new Error(`Akun COA dengan kode ${code} tidak ditemukan`);
  return acc;
}

function nextNumber(prefix, table, column) {
  const today = dayjs().format('YYYYMMDD');
  const row = db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${column} LIKE ?`).get(`${prefix}-${today}%`);
  const seq = String(row.c + 1).padStart(3, '0');
  return `${prefix}-${today}-${seq}`;
}

/**
 * Posting jurnal umum. lines: [{code, debit, kredit}]
 * Total debit HARUS sama dengan total kredit (double-entry).
 */
function postJournal({ tanggal, ref_tipe, ref_id, keterangan, lines }) {
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalKredit = lines.reduce((s, l) => s + (l.kredit || 0), 0);
  if (Math.abs(totalDebit - totalKredit) > 0.01) {
    throw new Error(`Jurnal tidak balance: debit ${totalDebit} != kredit ${totalKredit}`);
  }
  const no_jurnal = nextNumber('JRN', 'journals', 'no_jurnal');
  const info = db.prepare(
    `INSERT INTO journals (no_jurnal, tanggal, ref_tipe, ref_id, keterangan) VALUES (?,?,?,?,?)`
  ).run(no_jurnal, tanggal, ref_tipe, ref_id, keterangan);
  const journalId = info.lastInsertRowid;

  const insDetail = db.prepare(
    `INSERT INTO journal_details (journal_id, account_id, debit, kredit) VALUES (?,?,?,?)`
  );
  for (const l of lines) {
    if (!l.debit && !l.kredit) continue;
    const acc = getAccountByCode(l.code);
    insDetail.run(journalId, acc.id, l.debit || 0, l.kredit || 0);
  }
  return journalId;
}

/** Update stok produk + catat kartu stok (stock_movements) */
function moveStock({ product_id, tanggal, jenis, qty, ref_tipe, ref_id, keterangan }) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) throw new Error('Produk tidak ditemukan');
  const delta = jenis === 'in' ? qty : -qty;
  const saldoBaru = product.stok + delta;
  if (jenis === 'out' && saldoBaru < -0.0001) {
    throw new Error(`Stok ${product.name} tidak cukup (tersedia ${product.stok}, diminta ${qty})`);
  }
  db.prepare('UPDATE products SET stok = ? WHERE id = ?').run(saldoBaru, product_id);
  db.prepare(
    `INSERT INTO stock_movements (product_id, tanggal, jenis, qty, saldo_setelah, ref_tipe, ref_id, keterangan)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(product_id, tanggal, jenis, qty, saldoBaru, ref_tipe, ref_id, keterangan);
  return saldoBaru;
}

/** Update HPP rata-rata (moving average) saat barang masuk (pembelian/produksi) */
function updateMovingAverage(product_id, qtyMasuk, hargaMasuk) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  const stokLama = product.stok;
  const hppLama = product.hpp_rata2;
  const totalLama = stokLama * hppLama;
  const totalBaru = totalLama + qtyMasuk * hargaMasuk;
  const stokBaru = stokLama + qtyMasuk;
  const hppBaru = stokBaru > 0 ? totalBaru / stokBaru : hargaMasuk;
  db.prepare('UPDATE products SET hpp_rata2 = ? WHERE id = ?').run(hppBaru, product_id);
  return hppBaru;
}

function updateCashBankBalance(akun_id, jenis, jumlah) {
  const delta = jenis === 'masuk' ? jumlah : -jumlah;
  db.prepare('UPDATE cash_bank_accounts SET saldo = saldo + ? WHERE id = ?').run(delta, akun_id);
}

function cashBankMutation({ akun_id, tanggal, jenis, jumlah, ref_tipe, ref_id, keterangan }) {
  db.prepare(
    `INSERT INTO cash_bank_mutations (akun_id, tanggal, jenis, jumlah, ref_tipe, ref_id, keterangan)
     VALUES (?,?,?,?,?,?,?)`
  ).run(akun_id, tanggal, jenis, jumlah, ref_tipe, ref_id, keterangan);
  updateCashBankBalance(akun_id, jenis, jumlah);
}

function accountCodeForAkun(akun_id) {
  const akun = db.prepare('SELECT * FROM cash_bank_accounts WHERE id = ?').get(akun_id);
  if (!akun) throw new Error('Akun kas/bank tidak ditemukan');
  return akun.account_code;
}

module.exports = {
  getAccountByCode,
  nextNumber,
  postJournal,
  moveStock,
  updateMovingAverage,
  cashBankMutation,
  accountCodeForAkun,
};
