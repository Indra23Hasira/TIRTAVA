# 💧 ERP Depot Air Galon & Pabrik Es Kristal

Aplikasi web manajemen bisnis terintegrasi hulu-hilir: Pembelian → Produksi → Stok → Penjualan → Kas/Piutang/Hutang → Jurnal Akuntansi Otomatis → Laporan Keuangan.

## Fitur
- Login email + **multi-device** (bisa dibuka di HP, laptop, tablet sekaligus, dengan halaman "Perangkat Aktif" untuk logout perangkat lain)
- Master Data: Produk, Customer, Supplier, User, Kas & Bank
- Pembelian (cash/kredit) — otomatis update stok & HPP moving average
- Produksi — hitung HPP otomatis dari bahan baku + biaya produksi
- Persediaan/Stok — kartu stok per produk
- Penjualan (cash/kredit) — otomatis update stok, HPP, piutang
- Kas & Bank, Piutang (dengan aging), Hutang (dengan aging)
- Pengeluaran Operasional, Aset Tetap & Penyusutan
- Jurnal Akuntansi otomatis (double-entry, selalu balance) + jurnal manual
- Laporan: Laba Rugi, Neraca, Arus Kas, Mutasi Stok, HPP, Produk Terlaris, Customer Terbesar
- Dashboard KPI real-time dengan grafik

## Cara Menjalankan

**Syarat:** Node.js versi 18 ke atas ([download di sini](https://nodejs.org) jika belum ada).

```bash
# 1. Masuk ke folder aplikasi
cd erp-app

# 2. Install dependencies
npm install

# 3. Isi data awal (Chart of Account, user admin, produk contoh)
npm run seed

# 4. Jalankan aplikasi
npm start
```

Buka browser ke **http://localhost:3000**

**Login default:**
- Email: `admin@depot.com`
- Password: `admin123`

> Setelah login pertama, segera buat user baru untuk staff (menu User) dan ganti/nonaktifkan akun admin default sesuai kebutuhan.

## Struktur Proyek
```
erp-app/
├── server.js              # entry point aplikasi
├── db/
│   ├── schema.sql          # struktur database (semua tabel)
│   ├── db.js                # koneksi SQLite
│   └── seed.js              # data awal (COA, user, produk contoh)
├── middleware/
│   └── auth.js              # autentikasi JWT + sesi multi-device
├── services/
│   └── accounting.js        # accounting engine: jurnal otomatis, mutasi stok, HPP
├── routes/                  # semua endpoint per modul
└── views/                   # halaman (EJS + Tailwind)
```

## Cara Kerja Accounting Engine
Setiap transaksi (Pembelian, Produksi, Penjualan, Pembayaran) memanggil `services/accounting.js` yang otomatis:
1. **`moveStock()`** — update stok produk & catat kartu stok (stock_movements)
2. **`updateMovingAverage()`** — update HPP rata-rata produk saat barang masuk
3. **`cashBankMutation()`** — update saldo kas/bank & catat mutasi
4. **`postJournal()`** — posting jurnal double-entry (validasi debit = kredit)

Karena semua transaksi lewat satu engine yang sama, **Neraca akan selalu balance** dan Laba Rugi/Arus Kas otomatis konsisten dengan seluruh transaksi — sudah diuji end-to-end.

## Database
Menggunakan **SQLite** (file `db/erp.sqlite`) — tidak perlu install database server terpisah, cukup jalan langsung. File ini otomatis dibuat saat pertama kali `npm run seed` dijalankan.

Untuk penggunaan produksi/multi-user beban tinggi, database ini bisa dimigrasikan ke **PostgreSQL** dengan mengganti `db/db.js` dan query `better-sqlite3` → driver PostgreSQL (`pg`), karena skema SQL-nya kompatibel.

## Deploy ke Server (Opsional)
Agar bisa diakses dari beberapa device di lokasi berbeda (bukan cuma localhost), deploy ke VPS/cloud:
```bash
# Di server (Ubuntu contoh)
npm install --production
npm run seed   # hanya sekali di awal
npm install -g pm2
pm2 start server.js --name depot-erp
pm2 save
```
Lalu arahkan domain/IP ke port 3000 (atau pasang Nginx reverse proxy + SSL).

## Catatan Penting Sebelum Produksi Sungguhan
- Ganti `JWT_SECRET` di `middleware/auth.js` (atau set environment variable `JWT_SECRET`) dengan nilai rahasia yang kuat.
- Set cookie `secure: true` di `routes/auth.js` bila sudah pakai HTTPS.
- Backup rutin file `db/erp.sqlite`.
- Biaya produksi (tenaga kerja/listrik/overhead) pada modul Produksi dianggap dibayar tunai langsung dari akun kas/bank yang dipilih dan otomatis dikapitalisasi ke HPP barang jadi.
