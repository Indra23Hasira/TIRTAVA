-- ================= AUTH =================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- owner, admin, kasir, gudang, produksi
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, -- jti
  user_id INTEGER NOT NULL,
  device_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_active_at TEXT DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- ================= COA / AKUNTANSI =================
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL -- aset, kewajiban, ekuitas, pendapatan, beban
);

CREATE TABLE IF NOT EXISTS journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_jurnal TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  ref_tipe TEXT,
  ref_id INTEGER,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  debit REAL NOT NULL DEFAULT 0,
  kredit REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(journal_id) REFERENCES journals(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);

-- ================= MASTER DATA =================
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- air_galon, es_kristal, bahan_baku, kemasan
  type TEXT NOT NULL, -- barang_jadi, bahan_baku
  unit TEXT NOT NULL DEFAULT 'pcs',
  harga_jual REAL NOT NULL DEFAULT 0,
  hpp_rata2 REAL NOT NULL DEFAULT 0,
  stok REAL NOT NULL DEFAULT 0,
  stok_minimum REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  tipe TEXT NOT NULL DEFAULT 'reguler', -- reguler, agen
  saldo_piutang REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  saldo_hutang REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cash_bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  jenis TEXT NOT NULL, -- kas, bank
  account_code TEXT NOT NULL, -- referensi ke COA (1101 Kas / 1102 Bank)
  saldo REAL NOT NULL DEFAULT 0
);

-- ================= PEMBELIAN =================
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_transaksi TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  supplier_id INTEGER NOT NULL,
  user_id INTEGER,
  jenis_bayar TEXT NOT NULL, -- cash, kredit
  akun_id INTEGER, -- jika cash, akun kas/bank sumber
  status TEXT NOT NULL DEFAULT 'posted',
  total REAL NOT NULL DEFAULT 0,
  jatuh_tempo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY(purchase_id) REFERENCES purchases(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- ================= PRODUKSI =================
CREATE TABLE IF NOT EXISTS productions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_produksi TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  product_id INTEGER NOT NULL, -- hasil jadi
  qty_hasil REAL NOT NULL,
  user_id INTEGER,
  total_hpp REAL NOT NULL DEFAULT 0,
  hpp_per_unit REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS production_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL, -- bahan baku
  qty REAL NOT NULL,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY(production_id) REFERENCES productions(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS production_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_id INTEGER NOT NULL,
  jenis TEXT NOT NULL, -- tenaga_kerja, listrik, overhead
  jumlah REAL NOT NULL,
  FOREIGN KEY(production_id) REFERENCES productions(id)
);

-- ================= STOK =================
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  jenis TEXT NOT NULL, -- in, out
  qty REAL NOT NULL,
  saldo_setelah REAL NOT NULL,
  ref_tipe TEXT,
  ref_id INTEGER,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- ================= PENJUALAN =================
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_transaksi TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  user_id INTEGER,
  jenis_bayar TEXT NOT NULL, -- cash, kredit
  akun_id INTEGER,
  status TEXT NOT NULL DEFAULT 'posted',
  total REAL NOT NULL DEFAULT 0,
  jatuh_tempo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  hpp_satuan REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(sale_id) REFERENCES sales(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- ================= KAS & BANK =================
CREATE TABLE IF NOT EXISTS cash_bank_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  akun_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  jenis TEXT NOT NULL, -- masuk, keluar
  jumlah REAL NOT NULL,
  ref_tipe TEXT,
  ref_id INTEGER,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(akun_id) REFERENCES cash_bank_accounts(id)
);

-- ================= PIUTANG & HUTANG =================
CREATE TABLE IF NOT EXISTS receivables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  jumlah REAL NOT NULL,
  sisa REAL NOT NULL,
  jatuh_tempo TEXT,
  status TEXT NOT NULL DEFAULT 'belum_lunas',
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS receivable_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receivable_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  jumlah REAL NOT NULL,
  akun_id INTEGER NOT NULL,
  FOREIGN KEY(receivable_id) REFERENCES receivables(id)
);

CREATE TABLE IF NOT EXISTS payables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  purchase_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  jumlah REAL NOT NULL,
  sisa REAL NOT NULL,
  jatuh_tempo TEXT,
  status TEXT NOT NULL DEFAULT 'belum_lunas',
  FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY(purchase_id) REFERENCES purchases(id)
);

CREATE TABLE IF NOT EXISTS payable_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payable_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  jumlah REAL NOT NULL,
  akun_id INTEGER NOT NULL,
  FOREIGN KEY(payable_id) REFERENCES payables(id)
);

-- ================= BEBAN OPERASIONAL =================
CREATE TABLE IF NOT EXISTS operational_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal TEXT NOT NULL,
  kategori TEXT NOT NULL,
  jumlah REAL NOT NULL,
  akun_id INTEGER NOT NULL,
  keterangan TEXT,
  user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ================= ASET TETAP =================
CREATE TABLE IF NOT EXISTS fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  kategori TEXT,
  tanggal_beli TEXT NOT NULL,
  harga_beli REAL NOT NULL,
  umur_bulan INTEGER NOT NULL,
  nilai_residu REAL NOT NULL DEFAULT 0,
  akumulasi_penyusutan REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset_depreciations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  periode TEXT NOT NULL,
  jumlah REAL NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES fixed_assets(id)
);
