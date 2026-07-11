const { db } = require('./db');
const bcrypt = require('bcryptjs');

function run() {
  const countUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (countUsers > 0) {
    console.log('Data sudah ada, skip seeding.');
    return;
  }

  console.log('Seeding data awal...');

  // ---- Chart of Accounts ----
  const accounts = [
    ['1101', 'Kas', 'aset'],
    ['1102', 'Bank', 'aset'],
    ['1103', 'Piutang Usaha', 'aset'],
    ['1104', 'Persediaan Bahan Baku & Kemasan', 'aset'],
    ['1105', 'Persediaan Barang Jadi', 'aset'],
    ['1201', 'Aset Tetap', 'aset'],
    ['1202', 'Akumulasi Penyusutan', 'aset'],
    ['2101', 'Hutang Usaha', 'kewajiban'],
    ['3101', 'Modal Pemilik', 'ekuitas'],
    ['3102', 'Laba Ditahan', 'ekuitas'],
    ['4101', 'Penjualan', 'pendapatan'],
    ['5101', 'Harga Pokok Penjualan (HPP)', 'beban'],
    ['5201', 'Biaya Produksi Dibebankan', 'beban'],
    ['6101', 'Beban Operasional', 'beban'],
    ['6102', 'Beban Penyusutan', 'beban'],
  ];
  const insAcc = db.prepare('INSERT INTO accounts (code, name, type) VALUES (?,?,?)');
  for (const a of accounts) insAcc.run(...a);

  // ---- User default ----
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
    .run('Administrator', 'admin@depot.com', hash, 'owner');

  // ---- Kas & Bank ----
  db.prepare('INSERT INTO cash_bank_accounts (nama, jenis, account_code, saldo) VALUES (?,?,?,?)')
    .run('Kas Toko', 'kas', '1101', 5000000);
  db.prepare('INSERT INTO cash_bank_accounts (nama, jenis, account_code, saldo) VALUES (?,?,?,?)')
    .run('Bank BCA', 'bank', '1102', 10000000);

  // ---- Modal awal (jurnal pembuka) ----
  const jrn = db.prepare(`INSERT INTO journals (no_jurnal, tanggal, ref_tipe, keterangan) VALUES (?,?,?,?)`)
    .run('JRN-OPENING-001', new Date().toISOString().slice(0,10), 'opening', 'Saldo awal modal pemilik');
  const kas = db.prepare("SELECT id FROM accounts WHERE code='1101'").get();
  const bank = db.prepare("SELECT id FROM accounts WHERE code='1102'").get();
  const modal = db.prepare("SELECT id FROM accounts WHERE code='3101'").get();
  const insJd = db.prepare('INSERT INTO journal_details (journal_id, account_id, debit, kredit) VALUES (?,?,?,?)');
  insJd.run(jrn.lastInsertRowid, kas.id, 5000000, 0);
  insJd.run(jrn.lastInsertRowid, bank.id, 10000000, 0);
  insJd.run(jrn.lastInsertRowid, modal.id, 0, 15000000);

  // ---- Produk ----
  const products = [
    ['BB-001', 'Air Baku (per liter)', 'bahan_baku', 'bahan_baku', 'liter', 0, 500, 100000, 5000],
    ['BB-002', 'Tutup Galon', 'kemasan', 'bahan_baku', 'pcs', 0, 300, 500, 100],
    ['BB-003', 'Plastik Segel', 'kemasan', 'bahan_baku', 'pcs', 0, 150, 500, 100],
    ['BB-004', 'Kantong Plastik Es', 'kemasan', 'bahan_baku', 'pcs', 0, 100, 1000, 200],
    ['FG-001', 'Air Galon Isi Ulang 19L', 'air_galon', 'barang_jadi', 'galon', 6000, 0, 50, 20],
    ['FG-002', 'Es Kristal Balok', 'es_kristal', 'barang_jadi', 'balok', 15000, 0, 30, 10],
    ['FG-003', 'Es Kristal Kantong 1kg', 'es_kristal', 'barang_jadi', 'kantong', 5000, 0, 40, 15],
  ];
  const insP = db.prepare(`INSERT INTO products (code, name, category, type, unit, harga_jual, hpp_rata2, stok, stok_minimum)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const p of products) insP.run(...p);

  // ---- Supplier ----
  const insS = db.prepare('INSERT INTO suppliers (code, name, phone, address) VALUES (?,?,?,?)');
  insS.run('SUP-001', 'CV Sumber Air Jaya', '081234567890', 'Jl. Industri No. 1');
  insS.run('SUP-002', 'Toko Kemasan Sejahtera', '081298765432', 'Jl. Pasar Baru No. 5');

  // ---- Customer ----
  const insC = db.prepare('INSERT INTO customers (code, name, phone, address, tipe) VALUES (?,?,?,?,?)');
  insC.run('CUST-001', 'Warung Bu Siti', '08111222333', 'Jl. Mawar No. 10', 'reguler');
  insC.run('CUST-002', 'Agen Barokah', '08199988877', 'Jl. Melati No. 20', 'agen');

  console.log('Seeding selesai. Login: admin@depot.com / admin123');
}

run();
