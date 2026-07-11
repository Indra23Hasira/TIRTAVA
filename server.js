const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { isNew } = require('./db/db'); // init db & schema

const app = express();
const PORT = process.env.PORT || 3000;

// Wajib di belakang reverse proxy (Railway/Render/Nginx) agar cookie secure & IP asli terbaca benar
app.set('trust proxy', 1);

// Auto-seed data awal jika database baru pertama kali dibuat (mis. volume baru di hosting)
if (isNew) {
  console.log('Database baru terdeteksi, menjalankan seed otomatis...');
  require('./db/seed');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.currentUser = null;
  res.locals.path = req.path;
  next();
});

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/', require('./routes/master'));
app.use('/', require('./routes/purchases'));
app.use('/', require('./routes/productions'));
app.use('/', require('./routes/cashbank'));
app.use('/', require('./routes/sales'));
app.use('/', require('./routes/receivables'));
app.use('/', require('./routes/expenses'));
app.use('/', require('./routes/journals'));
app.use('/', require('./routes/reports'));

app.use((req, res) => {
  res.status(404).render('error', { message: 'Halaman tidak ditemukan.', user: res.locals.currentUser });
});

app.listen(PORT, () => {
  console.log(`ERP Depot Air Galon & Es Kristal berjalan di http://localhost:${PORT}`);
});
