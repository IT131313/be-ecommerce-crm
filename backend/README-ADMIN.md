# Sistem Login Admin E-commerce + CRM

## Fitur yang Telah Diimplementasi

### 1. Sistem Autentikasi Terpisah
- **Login Admin**: `/api/admin/auth/login`
- **Login User**: `/api/auth/login`
- Token JWT yang berbeda untuk admin dan user
- Session admin berlangsung lebih lama (8 jam vs 1 jam untuk user)

### 2. Middleware Akses Kontrol
- `adminAuthMiddleware`: Hanya admin yang bisa akses
- `userOnlyMiddleware`: Hanya user biasa yang bisa akses  
- `authMiddleware`: General authentication untuk kedua role

### 3. Forgot Password Admin
- **Endpoint**: `/api/admin/auth/forgot-password`
- **Endpoint**: `/api/admin/auth/reset-password`
- Mekanisme sama dengan user (PIN 4 digit via email)

### 4. Pemisahan Akses Fitur

#### Fitur Khusus Admin:
- **Dashboard**: `GET /api/admin/dashboard/stats`
- **Manage Users**: 
  - `GET /api/admin/users` - Lihat semua user
  - `DELETE /api/admin/users/:id` - Hapus user
- **Manage Products**:
  - `POST /api/products/` - Tambah produk
  - `PUT /api/admin/products/:id` - Update produk
  - `DELETE /api/admin/products/:id` - Hapus produk
  - `PATCH /api/products/:id/stock` - Update stock
  - `POST /api/products/ratings/:ratingId/reply` - Balas/ubah balasan untuk rating produk pengguna
- **Manage Orders**:
  - `GET /api/admin/orders` - Lihat semua order
  - `GET /api/admin/orders/:id` - Detail order
  - `PATCH /api/orders/:id/status` - Update status order
- **Manage Services**:
  - `POST /api/services/` - Tambah service
- **Manage Consultations**:
  - `GET /api/consultations/admin/all` - Lihat semua consultation
  - `PATCH /api/consultations/:id/status` - Update status
  - `POST /api/consultations/types` - Tambah tipe consultation
  - `POST /api/consultations/design-categories` - Tambah kategori design
  - `POST /api/consultations/design-styles` - Tambah style design

#### Fitur Khusus User:
- **Shopping Cart**: Semua endpoint `/api/cart/*`
- **Personal Orders**: `GET /api/orders/` (hanya order milik sendiri)
- **Cancel Orders**: `PATCH /api/orders/:id/cancel`
- **Product Rating**: `POST /api/products/:id/rating`
- **Personal Consultations**: Consultation endpoints (kecuali admin)

## Setup Database

1. Jalankan script SQL untuk membuat tabel admin:
```sql
-- Sudah ada di scripts/init-db.sql
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  reset_pin VARCHAR(10),
  reset_pin_expiry DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

2. Buat admin default:
```bash
node scripts/create-admin.js
```

Default admin:
- Email: `admin@example.com`
- Password: `admin123`

### First-Time Admin Setup (Self Register)
- Endpoint: `POST /api/admin/auth/setup`
- Gunanya untuk membuat admin pertama kali ketika tabel `admins` masih kosong. Endpoint mengembalikan JWT agar bisa langsung dipakai.

Contoh request:
```bash
POST /api/admin/auth/setup
{
  "email": "admin@example.com",
  "password": "admin123",
  "name": "System Administrator"
}
```

Perilaku keamanan:
- Jika sudah ada admin, endpoint akan menolak (403) secara default.
- Anda bisa mengizinkan setup tambahan dengan menambahkan `ADMIN_SETUP_KEY` di `.env` lalu sertakan `setupKey` di body:
```json
{
  "email": "second.admin@example.com",
  "password": "StrongPass123!",
  "name": "Admin Kedua",
  "setupKey": "<nilai_ADMIN_SETUP_KEY>"
}
```

Catatan:
- Endpoint ini juga otomatis memperbaiki akun admin yang sudah ada tetapi kolom `password` masih kosong/NULL (akan diisi hash bcrypt baru).

## Cara Menggunakan

### Login Admin
```bash
POST /api/admin/auth/login
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

Response:
```json
{
  "message": "Admin login successful",
  "token": "jwt_token_here",
  "admin": {
    "id": 1,
    "email": "admin@example.com", 
    "name": "System Administrator",
    "role": "admin"
  }
}
```

### Login User
```bash
POST /api/auth/login
{
  "emailOrUsername": "user@example.com",
  "password": "userpass"
}
```

### Akses Protected Endpoints
Semua request ke endpoint yang dilindungi harus menyertakan header:
```
Authorization: Bearer <jwt_token>
```

### Perbedaan Token
- **Admin Token**: Berisi `isAdmin: true` dan `role: 'admin'`
- **User Token**: Tidak berisi flag admin

## Keamanan

1. **Pemisahan Role**: Admin dan user tidak bisa saling mengakses fitur
2. **Token Validation**: Middleware memvalidasi role dari JWT token
3. **Longer Sessions**: Admin mendapat session 8 jam vs user 1 jam
4. **Protected Routes**: Semua endpoint sensitif dilindungi middleware

## Testing

Gunakan Postman atau curl untuk testing:

```bash
# Login admin
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Akses dashboard admin
curl -X GET http://localhost:3000/api/admin/dashboard/stats \
  -H "Authorization: Bearer <admin_token>"

# User tidak bisa akses dashboard admin (akan error 403)
curl -X GET http://localhost:3000/api/admin/dashboard/stats \
  -H "Authorization: Bearer <user_token>"
```

## Struktur File Baru

- `/routes/admin-auth.js` - Authentication khusus admin
- `/routes/admin.js` - Management routes khusus admin
- `/middleware/auth.js` - Updated dengan 3 middleware berbeda
- `/scripts/create-admin.js` - Script buat admin default
- `/scripts/init-db.sql` - Updated dengan tabel admin

## Database Schema

Tabel `admins` terpisah dari tabel `users` dengan kolom:
- `id` - Primary key
- `email` - Email admin (unique)
- `password` - Hashed password
- `name` - Nama admin
- `role` - Default 'admin'
- `reset_pin` & `reset_pin_expiry` - Untuk forgot password
- `created_at` - Timestamp
