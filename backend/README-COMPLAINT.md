# Sistema Pengaduan Pelanggan (Customer Complaint System)

## Deskripsi

Sistem pengaduan pelanggan yang terintegrasi dengan fitur chat untuk menangani klaim garansi produk. Sistem ini memungkinkan pelanggan mengajukan pengaduan terhadap produk yang rusak atau cacat, dan admin dapat mengelola pengaduan tersebut dengan sistem prioritas.

## Fitur Utama

### 1. **Tiket Garansi Otomatis**
- Tiket garansi dibuat otomatis ketika order berstatus 'confirmed'
- Setiap produk dalam order mendapat tiket garansi terpisah
- Masa garansi: 365 hari dari tanggal konfirmasi order
- Status tiket: active, used, expired

### 2. **Sistem Pengaduan**
- Pelanggan dapat mengajukan pengaduan menggunakan tiket garansi
- Upload foto sebagai bukti kerusakan/cacat produk
- Status pengaduan: pending, accepted, rejected, resolved
- Prioritas: low, medium, high (mempengaruhi urutan tampilan)

### 3. **Manajemen Admin**
- Menerima atau menolak pengaduan dengan komentar
- Mengatur prioritas pengaduan (tinggi, sedang, rendah)
- Chat langsung dengan pelanggan setelah pengaduan diterima
- Menandai pengaduan sebagai selesai
- Dashboard statistik pengaduan

### 4. **Integrasi Chat**
- Chat room otomatis dibuat ketika pengaduan diterima
- Menggunakan sistem chat yang sudah ada
- Admin dan pelanggan dapat berkomunikasi real-time
- Chat room ditutup otomatis ketika pengaduan selesai

## API Endpoints

### Customer Endpoints (`/api/complaints`)

#### Get Warranty Tickets
```
GET /api/complaints/tickets
Headers: Authorization: Bearer <token>
```
Mendapatkan daftar tiket garansi milik user.

#### Create Complaint
```
POST /api/complaints/create
Headers: Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- ticket_id (required): ID tiket garansi
- title (required): Judul pengaduan
- reason (required): Alasan pengaduan
- evidence_photo (optional): File foto bukti
```

#### Resubmit Rejected Complaint
```
PATCH /api/complaints/:complaintId/resubmit
Headers: Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- reason (optional): Alasan pengaduan yang diperbarui
- evidence_photo (optional): File foto bukti baru
```
Mengirim ulang pengaduan yang berstatus `rejected`. Data baru akan menggantikan alasan/bukti lama dan status kembali menjadi `pending` untuk ditinjau ulang admin.

#### Get My Complaints
```
GET /api/complaints/my-complaints
Headers: Authorization: Bearer <token>
```

#### Get Complaint Detail
```
GET /api/complaints/:complaintId
Headers: Authorization: Bearer <token>
```

### Admin Endpoints (`/api/admin`)

#### Get All Complaints
```
GET /api/admin/complaints?status=pending&priority=high&page=1&limit=20
Headers: Authorization: Bearer <admin_token>
```
Query parameters:
- status: pending, accepted, rejected, resolved
- priority: low, medium, high
- page: nomor halaman
- limit: jumlah per halaman

#### Accept Complaint
```
PATCH /api/admin/complaints/:complaintId/accept
Headers: Authorization: Bearer <admin_token>
```
Menerima pengaduan dan membuat chat room.

#### Reject Complaint
```
PATCH /api/admin/complaints/:complaintId/reject
Headers: Authorization: Bearer <admin_token>

Body:
{
  "admin_comment": "Alasan penolakan"
}
```

#### Update Priority
```
PATCH /api/admin/complaints/:complaintId/priority
Headers: Authorization: Bearer <admin_token>

Body:
{
  "priority": "high|medium|low"
}
```

#### Resolve Complaint
```
PATCH /api/admin/complaints/:complaintId/resolve
Headers: Authorization: Bearer <admin_token>
```
Menandai pengaduan selesai dan menutup chat room.

#### Get Statistics
```
GET /api/admin/complaints/stats/overview
Headers: Authorization: Bearer <admin_token>
```

## Database Schema

### warranty_tickets
```sql
- id (Primary Key)
- order_id (Foreign Key to orders)
- user_id (Foreign Key to users)
- product_id (Foreign Key to products)
- status (active, used, expired)
- issue_date
- expiry_date
- created_at
```

### complaints
```sql
- id (Primary Key)
- ticket_id (Foreign Key to warranty_tickets)
- user_id (Foreign Key to users)
- admin_id (Foreign Key to admins, nullable)
- title
- reason
- evidence_photo
- priority (low, medium, high)
- status (pending, accepted, rejected, resolved)
- admin_comment
- chat_room_id (Foreign Key to chat_rooms, nullable)
- created_at
- updated_at
- resolved_at
```

## Workflow Pengaduan

### 1. **Pembuatan Tiket**
- Order berstatus 'completed' → Trigger membuat tiket garansi untuk setiap produk
- Tiket berlaku 365 hari

### 2. **Pengajuan Pengaduan**
- Pelanggan pilih tiket garansi yang valid
- Isi form pengaduan + upload foto bukti
- Status: "pending" (Pengajuan Klaim)

### 3. **Proses Admin**
- Admin lihat daftar pengaduan (diurutkan berdasarkan prioritas)
- Pengaduan baru = prioritas "low" secara default
- Admin dapat:
  - Terima → Buat chat room + status "accepted"
  - Tolak → Beri komentar + status "rejected"
  - Pengguna bisa kirim ulang pengaduan yang ditolak dengan bukti baru melalui endpoint resubmit
  - Ubah prioritas → Mempengaruhi urutan tampilan

### 4. **Chat dan Penyelesaian**
- Setelah diterima → Chat room dibuka
- Admin dan pelanggan diskusi via chat
- Admin tandai "resolved" → Chat room ditutup

## Instalasi

1. Install dependencies:
```bash
npm install
```

2. Inisialisasi database complaint system:
```bash
npm run init-complaint-system
```

3. Buat direktori upload (sudah dibuat otomatis):
```bash
mkdir -p uploads/complaints
```

## Fitur Prioritas

Pengaduan diurutkan berdasarkan prioritas:
- **High (Tinggi)** → Tampil paling atas
- **Medium (Sedang)** → Tampil di tengah  
- **Low (Rendah)** → Tampil paling bawah

Dalam prioritas yang sama, diurutkan berdasarkan tanggal pembuatan (yang lama di atas).

## Keamanan

- Hanya pelanggan yang dapat mengajukan pengaduan dengan tiket miliknya
- File upload dibatasi hanya gambar dengan ukuran maksimal 5MB
- Admin hanya dapat mengakses endpoint admin
- Chat room hanya dapat diakses oleh pelanggan terkait dan admin
