
## API Quick Reference

Base URL: `http://localhost:3000`

Gunakan header `Content-Type: application/json` untuk request berbasis JSON. Endpoint bertanda ?? atau ????? membutuhkan:
`Authorization: Bearer your_jwt_token` untuk pengguna atau `Authorization: Bearer your_admin_jwt_token` untuk admin.

?? Public Endpoints (Tanpa Token)

1. Register User
POST http://localhost:3000/api/auth/register
Headers:
  Content-Type: application/json
Body:
{
  "email": "user@example.com",
  "username": "user123",
  "password": "secret123",
  "confirmPassword": "secret123"
}

2. Login User
POST http://localhost:3000/api/auth/login
Headers:
  Content-Type: application/json
Body:
{
  "emailOrUsername": "user@example.com",
  "password": "secret123"
}

3. Forgot Password (User)
POST http://localhost:3000/api/auth/forgot-password
Headers:
  Content-Type: application/json
Body:
{
  "email": "user@example.com"
}

4. Reset Password (User)
POST http://localhost:3000/api/auth/reset-password
Headers:
  Content-Type: application/json
Body:
{
  "email": "user@example.com",
  "pin": "1234",
  "newPassword": "newSecret123",
  "confirmNewPassword": "newSecret123"
}

5. Google Sign-In
POST http://localhost:3000/api/auth/google
Headers:
  Content-Type: application/json
Body:
{
  "idToken": "google_id_token"
}

6. Admin First-Time Setup
POST http://localhost:3000/api/admin/auth/setup
Headers:
  Content-Type: application/json
Body:
{
  "email": "admin@example.com",
  "password": "superSecret123",
  "name": "Super Admin",
  "setupKey": "ADMIN_SETUP_KEY_jika_diperlukan"
}

7. Admin Login
POST http://localhost:3000/api/admin/auth/login
Headers:
  Content-Type: application/json
Body:
{
  "email": "admin@example.com",
  "password": "superSecret123"
}

8. Admin Forgot Password
POST http://localhost:3000/api/admin/auth/forgot-password
Headers:
  Content-Type: application/json
Body:
{
  "email": "admin@example.com"
}

9. Admin Reset Password
POST http://localhost:3000/api/admin/auth/reset-password
Headers:
  Content-Type: application/json
Body:
{
  "email": "admin@example.com",
  "pin": "5678",
  "newPassword": "NewAdmin123",
  "confirmNewPassword": "NewAdmin123"
}

10. GET Consultation Types
GET http://localhost:3000/api/consultations/types
Menampilkan daftar tipe konsultasi yang tersedia.

11. GET Design Categories
GET http://localhost:3000/api/consultations/design-categories
Menampilkan kategori desain interior.

12. GET Design Styles
GET http://localhost:3000/api/consultations/design-styles
Menampilkan gaya desain interior.

13. List Products
GET http://localhost:3000/api/products
Menampilkan seluruh katalog produk.

14. Products By Category
GET http://localhost:3000/api/products/category/furniture
Ganti `furniture` dengan nama kategori produk.

15. Product Ratings Overview
GET http://localhost:3000/api/products/1/ratings
Ringkasan rating dan ulasan untuk produk tertentu.

16. List Services
GET http://localhost:3000/api/services
Menampilkan seluruh layanan.

17. Services By Category
GET http://localhost:3000/api/services/category/interior
Ganti `interior` dengan nama kategori layanan.

18. Service Detail
GET http://localhost:3000/api/services/1
Detail spesifik suatu layanan.

?? Protected Endpoints (Perlu Token Pengguna)

19. Logout User
POST http://localhost:3000/api/auth/logout
Headers:
  Authorization: Bearer your_jwt_token

20. Book New Consultation
POST http://localhost:3000/api/consultations
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: multipart/form-data
Body fields:
- serviceId: 1
- consultationTypeId: 1
- designCategoryId: 1 (wajib jika serviceId bukan 1 atau 3)
- designStyleId: 1 (wajib jika serviceId bukan 1 atau 3)
- consultationDate: 2024-08-15
- consultationTime: 10:00:00
- address: Jl. Sudirman No. 123, Jakarta
- notes: Butuh konsultasi untuk renovasi ruang tamu
- referenceImageOne (file, optional): contoh inspirasi 1
- referenceImageTwo (file, optional): contoh inspirasi 2
- referenceImages (file[], optional): alternatif jika ingin mengirim dua file sekaligus (maksimal 2 berkas)

Catatan: khusus serviceId 1 (Konstruksi Profesional) dan 3 (Instalasi Elektrik), field designCategoryId dan designStyleId boleh dikosongkan.

21. Get User's Consultations
GET http://localhost:3000/api/consultations
Headers:
  Authorization: Bearer your_jwt_token
Menampilkan daftar konsultasi milik pengguna (alternatif ringkas: GET /api/users/consultations).

22. Get Specific Consultation
GET http://localhost:3000/api/consultations/1
Headers:
  Authorization: Bearer your_jwt_token
Detail lengkap konsultasi tertentu.

23. Cancel Consultation
PATCH http://localhost:3000/api/consultations/1/cancel
Headers:
  Authorization: Bearer your_jwt_token
Membatalkan konsultasi selama status belum selesai/final dan belum pernah dibatalkan. 
Jika kontrak sudah mempunyai nominal proyek, sistem otomatis menghitung penalti 10% dari nilai kontrak
dan menandai `paymentStatus` menjadi `awaiting_cancellation_fee`.

Contoh respons:
{
  "message": "Consultation cancelled successfully",
  "cancellationFeePercent": 10,
  "cancellationFeeAmount": 2500000,
  "paymentStatus": "awaiting_cancellation_fee"
}

24. Set Pre-Contract Meeting Link (Admin)
PATCH http://localhost:3000/api/consultations/1/pre-contract-meeting
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "meetLink": "https://meet.example.com/room-123",
  "meetDatetime": "2024-10-12 10:00"
}
Catatan: meetDatetime opsional, meetLink wajib. Link akan muncul di detail konsultasi dan daftar konsultasi user/admin.

25. Products You Can Rate
GET http://localhost:3000/api/products/user/rateable
Headers:
  Authorization: Bearer your_jwt_token
Daftar produk yang sudah dikirim dan bisa diberi rating.

26. Submit Product Rating
POST http://localhost:3000/api/products/1/rating
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: application/json
Body:
{
  "rating": 5,
  "review": "Kualitas produk sangat memuaskan!",
  "orderId": 42
}

27. View Cart
GET http://localhost:3000/api/cart
Headers:
  Authorization: Bearer your_jwt_token
Melihat isi keranjang aktif.

28. Add Item To Cart
POST http://localhost:3000/api/cart/add
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: application/json
Body:
{
  "productId": 3,
  "quantity": 2
}

28. Update Cart Item Quantity
PATCH http://localhost:3000/api/cart/update/5
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: application/json
Body:
{
  "quantity": 1
}

29. Remove Cart Item
DELETE http://localhost:3000/api/cart/remove/5
Headers:
  Authorization: Bearer your_jwt_token
Menghapus item tertentu dari keranjang.

30. Checkout Cart
POST http://localhost:3000/api/cart/checkout
Headers:
  Authorization: Bearer your_jwt_token
Memproses keranjang menjadi pesanan baru.

Body (opsional untuk override profil):
{
  "shippingAddress": "Jl. Melati No. 10, Bandung",
  "contactPhone": "+62 812-3456-7890",
  "shippingMethod": "JNE" // atau "JNT"
}

Catatan:
- Jika profil pengguna sudah memiliki alamat/telepon, nilainya otomatis terisi, namun tetap bisa diedit saat checkout dengan mengirim field di atas.
- Field `shippingMethod` wajib diisi dan hanya menerima nilai "JNE" atau "JNT".

31. Order History
GET http://localhost:3000/api/orders
Headers:
  Authorization: Bearer your_jwt_token atau your_admin_jwt_token
Menampilkan daftar pesanan milik pengguna. Jika token admin digunakan, akan menampilkan semua pesanan.

32. Order Detail
GET http://localhost:3000/api/orders/10
Headers:
  Authorization: Bearer your_jwt_token atau your_admin_jwt_token
Detail item dan status pesanan tertentu. Pengguna hanya dapat melihat pesanan miliknya; admin dapat melihat pesanan mana pun.

33. Cancel Order
PATCH http://localhost:3000/api/orders/10/cancel
Headers:
  Authorization: Bearer your_jwt_token
Membatalkan pesanan selama belum dikirim atau selesai.

34. User Profile
GET http://localhost:3000/api/users/profile
Headers:
  Authorization: Bearer your_jwt_token
Profil dan ringkasan aktivitas pengguna.

35. Update Profile
PATCH http://localhost:3000/api/users/profile
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: application/json
Body:
{
  "email": "user@example.com",
  "username": "user_baru"
}

36. Change Password
PATCH http://localhost:3000/api/users/change-password
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: application/json
Body:
{
  "currentPassword": "secret123",
  "newPassword": "newSecret123",
  "confirmNewPassword": "newSecret123"
}

37. Delete Account
DELETE http://localhost:3000/api/users/account
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: application/json
Body:
{
  "password": "newSecret123"
}

38. Fetch Support Chat Room
GET http://localhost:3000/api/chat/room
Headers:
  Authorization: Bearer your_jwt_token
Mengambil atau membuat ruang chat dengan admin.

39. Mark Chat Messages Read
PATCH http://localhost:3000/api/chat/rooms/7/read
Headers:
  Authorization: Bearer your_jwt_token
Menandai pesan lawan bicara sebagai sudah dibaca.

40. View Warranty Tickets
GET http://localhost:3000/api/complaints/tickets
Headers:
  Authorization: Bearer your_jwt_token
Daftar tiket garansi aktif milik pengguna.

41. Submit Warranty Complaint
POST http://localhost:3000/api/complaints/create
Headers:
  Authorization: Bearer your_jwt_token
  Content-Type: multipart/form-data
Form-Data Fields:
  ticket_id: 12
  title: "Kompor tidak menyala"
  reason: "Produk tidak dapat digunakan sejak hari pertama"
  evidence_photo: (unggah foto JPG/PNG maks 5MB)

42. List My Complaints
GET http://localhost:3000/api/complaints/my-complaints
Headers:
  Authorization: Bearer your_jwt_token
Melihat status setiap pengaduan.

43. Complaint Detail
GET http://localhost:3000/api/complaints/15
Headers:
  Authorization: Bearer your_jwt_token
Detail pengaduan tertentu (admin juga dapat mengakses).

????? Admin Endpoints (Token Admin)

44. Admin Profile
GET http://localhost:3000/api/admin/auth/profile
Headers:
  Authorization: Bearer your_admin_jwt_token
Mengambil informasi akun admin yang sedang login.

45. Admin Logout
POST http://localhost:3000/api/admin/auth/logout
Headers:
  Authorization: Bearer your_admin_jwt_token

46. List Users
GET http://localhost:3000/api/admin/users
Headers:
  Authorization: Bearer your_admin_jwt_token

47. Create User
POST http://localhost:3000/api/admin/users
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "email": "pelanggan@contoh.com",
  "username": "pelanggan001",
  "password": "secret123",
  "confirmPassword": "secret123"
}

48. View User Detail
GET http://localhost:3000/api/admin/users/5
Headers:
  Authorization: Bearer your_admin_jwt_token

49. Update User
PUT http://localhost:3000/api/admin/users/5
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "email": "pelanggan@contoh.com",
  "username": "pelanggan_baru"
}

50. Reset User Password
PATCH http://localhost:3000/api/admin/users/5/reset-password
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "newPassword": "reset123",
  "confirmPassword": "reset123"
}

51. Delete User
DELETE http://localhost:3000/api/admin/users/5
Headers:
  Authorization: Bearer your_admin_jwt_token

52. List Orders (Admin)
GET http://localhost:3000/api/admin/orders
Headers:
  Authorization: Bearer your_admin_jwt_token

53. Order Detail (Admin)
GET http://localhost:3000/api/admin/orders/10
Headers:
  Authorization: Bearer your_admin_jwt_token

54. Dashboard Stats
GET http://localhost:3000/api/admin/dashboard/stats
Headers:
  Authorization: Bearer your_admin_jwt_token
Ringkasan metrik (total pengguna, order, revenue, produk, order terbaru).

55. Create Product (Admin)
POST http://localhost:3000/api/admin/products
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: multipart/form-data
Form-Data Fields:
  name: "Sofa Minimalis"
  description: "Sofa 3 dudukan nyaman"
  category: "furniture"
  price: 2500000
  stock: 10
  image (opsional): unggah file gambar

56. Update Product
PUT http://localhost:3000/api/admin/products/7
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: multipart/form-data atau application/json
Body/Form fields hanya isi kolom yang diubah (name, description, category, price, stock, image).

57. Delete Product
DELETE http://localhost:3000/api/admin/products/7
Headers:
  Authorization: Bearer your_admin_jwt_token

58. Update Product Stock
PATCH http://localhost:3000/api/admin/products/7/stock
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "stock": 25
}

59. Create Admin
POST http://localhost:3000/api/admin/admins
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "email": "cs@contoh.com",
  "password": "superSecret123",
 "name": "Customer Support"
}

60. List Admins
GET http://localhost:3000/api/admin/admins
Headers:
  Authorization: Bearer your_admin_jwt_token

61. Delete Admin
DELETE http://localhost:3000/api/admin/admins/4
Headers:
  Authorization: Bearer your_admin_jwt_token

62. Update Order Status
PATCH http://localhost:3000/api/orders/10/status
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "status": "shipped"
}

62b. Complete Order (User)
PATCH http://localhost:3000/api/orders/10/complete
Headers:
  Authorization: Bearer your_jwt_token
Catatan: hanya pemilik pesanan yang bisa memanggil endpoint ini dan status pesanan harus sudah `shipped`. Sistem otomatis menandai pesanan `completed`, menyalakan tiket garansi produk, dan memperbarui customer tag.

66. List Pending Shipments (Admin)
GET http://localhost:3000/api/admin/shipments/pending
Headers:
  Authorization: Bearer your_admin_jwt_token
Menampilkan pesanan yang alamat & tujuan sudah diisi pelanggan, belum memiliki nomor resi, dan status pesanan masih `pending` atau `confirmed`.

68. List Confirmed Shipments (Admin)
GET http://localhost:3000/api/admin/shipments/confirmed
Headers:
  Authorization: Bearer your_admin_jwt_token
Menampilkan pesanan yang sudah berstatus `confirmed`, alamat tujuan sudah diisi, dan belum memiliki nomor resi (siap input resi).

67. Set Tracking Number & Auto-Ship (Admin)
PATCH http://localhost:3000/api/admin/orders/10/ship
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "trackingNumber": "JNE-RESI-001234"
}
Catatan:
- Setelah disimpan, sistem otomatis mengubah status pesanan menjadi `shipped` dan mengisi `shipped_at`.
- Field baru pada pesanan: `tracking_number` dan `shipped_at` akan muncul pada respons detail dan daftar pesanan.

63. Get All Consultations (Admin)
GET http://localhost:3000/api/consultations/admin/all
Headers:
  Authorization: Bearer your_admin_jwt_token

64. Update Consultation Status
PATCH http://localhost:3000/api/consultations/5/status
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "status": "confirmed"
}

65. Add Consultation Type
POST http://localhost:3000/api/consultations/types
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "name": "Virtual Reality Consultation",
  "description": "Konsultasi menggunakan teknologi VR"
}

66. Add Design Category
POST http://localhost:3000/api/consultations/design-categories
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "name": "Scandinavian",
  "imageUrl": "/images/scandinavian.jpg"
}

67. Add Design Style
POST http://localhost:3000/api/consultations/design-styles
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "name": "Bohemian",
  "imageUrl": "/images/bohemian.jpg"
}

### Consultation Contract & Timeline Flow

- **Upload / Replace Contract (Admin)**
  POST `http://localhost:3000/api/consultations/:consultationId/contracts`
  Headers: Authorization (admin), `Content-Type: multipart/form-data`
  Body fields:
    - `contract`: PDF file (required)
    - `projectCost`: nominal biaya proyek dalam angka (required, contoh `25000000`)
  Respon mengembalikan metadata kontrak termasuk `projectCost`. Setelah kontrak tersimpan, status konsultasi berpindah ke `contract_uploaded`.

- **Download Contract (User/Admin)**
  GET `http://localhost:3000/api/consultations/:consultationId/contracts/:contractId/download`
  Mengunduh PDF kontrak apabila pengguna adalah admin atau pemilik konsultasi.

- **Get Contract & Timeline (User/Admin)**
  GET `http://localhost:3000/api/consultations/:consultationId/contracts`
  Mengembalikan detail kontrak (file path, `projectCost`, status pembayaran, informasi penalti) beserta daftar item timeline dan jumlah komentar per item.

- **Create/Replace Timeline Items (Admin)**
  POST `http://localhost:3000/api/consultations/:consultationId/contracts/:contractId/timeline`
  Body JSON menampung array `items` di mana setiap elemen WAJIB memiliki `activityType`:
    - `progress`: butuh `dueDate` (deadline progress).
    - `meeting`: butuh `meetingDatetime` (tanggal + jam meeting) dan opsional `meetingLink`.
    - `finalization`: butuh `dueDate`. Customer harus bayar lunas sebelum finalisasi boleh ditandai selesai.

  Contoh payload:
  ```json
  {
    "items": [
      { "title": "Kick-off", "description": "Review kontrak", "activityType": "progress", "dueDate": "2024-10-06" },
      { "title": "Meeting Desain Awal", "activityType": "meeting", "meetingDatetime": "2024-10-08 10:00", "meetingLink": "https://meet.example.com/abc" },
      { "title": "Render Final", "activityType": "finalization", "dueDate": "2024-10-20" }
    ]
  }
  ```
  Gunakan `useDefaultTemplate: true` untuk mengisi otomatis. Setelah timeline aktif, status konsultasi berubah ke `timeline_in_progress`.

- **Update Timeline Item Status (Admin)**
  PATCH `http://localhost:3000/api/consultations/:consultationId/contracts/:contractId/timeline/:timelineItemId`

  - Untuk meeting, cukup kirim body JSON (misalnya mengubah `status`, `meetingDatetime`, `meetingLink`).
  - Untuk progress/finalization, ketika mengganti `status` menjadi `completed` WAJIB memakai `multipart/form-data` dan menyertakan berkas `resultFile` (file hasil progres/final).
  - Finalisasi hanya boleh ditandai `completed` setelah `paymentStatus` konsultasi `paid`.

  Contoh (progress selesai):
  ```
  Form-Data:
    status = completed
    resultFile = (unggah PDF/ZIP/Gambar hasil)
  ```

  Ketika seluruh aktivitas selesai, sistem otomatis memindahkan konsultasi ke `awaiting_payment` dan `paymentStatus = awaiting_final_payment`. Setelah admin menandai `paymentStatus = paid`, aktivitas finalisasi dapat diunggah sehingga `final_delivery_status` berubah menjadi `delivered`.

- **Timeline Comments (Admin & Customer)**
  - GET `/:consultationId/contracts/:contractId/timeline/:timelineItemId/comments`
  - POST `/:consultationId/contracts/:contractId/timeline/:timelineItemId/comments`
  
  Kedua pihak dapat berdiskusi per item timeline. Payload POST:
  ```json
  {
    "message": "Mohon konfirmasi revisi konsep ke-2."
  }
  ```

- **Update Payment & Delivery Status (Admin)**
  PATCH `http://localhost:3000/api/consultations/:consultationId/payment-status`
  Body contoh:
  ```json
  {
    "paymentStatus": "paid",
    "finalDeliveryNote": "Hasil akhir sudah dikirim via email."
  }
  ```
  Nilai `paymentStatus` yang didukung: `not_ready`, `awaiting_cancellation_fee`, `cancellation_fee_recorded`, `awaiting_final_payment`, `paid`, `overdue`.
  `finalDeliveryStatus` otomatis menjadi `delivered` saat pembayaran ditandai `paid`, atau tetap bisa diatur manual (`withheld` jika pembayaran belum selesai).

## Integrasi Pembayaran Midtrans Snap

Sebelum memakai endpoint pembayaran, pastikan variabel `.env` berikut terisi:

```
MIDTRANS_SERVER_KEY=your_midtrans_server_key
MIDTRANS_CLIENT_KEY=your_midtrans_client_key
MIDTRANS_IS_PRODUCTION=false
```

Struktur transaksi disimpan di tabel baru `payment_transactions`. Untuk database yang sudah berjalan, jalankan migrasi:

```
mysql -u root < scripts/migrations/003_midtrans_snap.sql
```

Endpoint baru:

- **Get Midtrans Client Key**  
  GET `http://localhost:3000/api/payments/config` (header Authorization wajib). Mengembalikan `clientKey` & flag `isProduction` untuk inisialisasi Snap di frontend.

- **Create Snap Token for Order Checkout**  
  POST `http://localhost:3000/api/payments/orders/:orderId/snap` (token user/admin). Hanya pemilik order atau admin yang dapat memanggilnya. API mengembalikan `orderCode`, `snapToken`, dan `redirectUrl`. Jika sudah ada token pending, endpoint otomatis mereuse token lama agar tidak tercipta transaksi ganda.

- **Create Snap Token for Consultation**  
  POST `http://localhost:3000/api/payments/consultations/:consultationId/snap` (token user/admin). Body opsional:  
  ```json
  { "paymentType": "final" }
  ```  
  Gunakan `paymentType: "cancellation"` ketika konsultasi berada pada status `awaiting_cancellation_fee` agar Snap membuat tagihan penalti 10%.

- **Midtrans Webhook**  
  POST `http://localhost:3000/api/payments/webhook` menerima payload asli Midtrans tanpa autentikasi tambahan. Endpoint memverifikasi `signature_key` dan mengubah status:
  - `orders.status` ➜ `confirmed` ketika transaksi settlement
  - `consultations.payment_status` ➜ `paid` atau `cancellation_fee_recorded` sesuai tujuan transaksi

Catatan tambahan:
- `order_code` Midtrans selalu unik dan maksimal 50 karakter.
- Snap item detail mencakup ongkir sehingga `gross_amount` = total order.
- Log request/response Snap tersimpan di kolom `payment_response` untuk audit.

68. View Complaints Board
GET http://localhost:3000/api/admin/complaints
Headers:
  Authorization: Bearer your_admin_jwt_token
Tambahkan query ?status=pending atau ?priority=high untuk memfilter.

69. Accept Complaint
PATCH http://localhost:3000/api/admin/complaints/15/accept
Headers:
  Authorization: Bearer your_admin_jwt_token
Membuka chat room dan menetapkan admin penanggung jawab.

70. Reject Complaint
PATCH http://localhost:3000/api/admin/complaints/15/reject
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "admin_comment": "Keluhan tidak valid karena lampirannya tidak lengkap"
}

71. Update Complaint Priority
PATCH http://localhost:3000/api/admin/complaints/15/priority
Headers:
  Authorization: Bearer your_admin_jwt_token
  Content-Type: application/json
Body:
{
  "priority": "high"
}

72. Resolve Complaint
PATCH http://localhost:3000/api/admin/complaints/15/resolve
Headers:
  Authorization: Bearer your_admin_jwt_token
Menandai pengaduan selesai dan menutup chat room terkait.

73. Complaint Stats Overview
GET http://localhost:3000/api/admin/complaints/stats/overview
Headers:
  Authorization: Bearer your_admin_jwt_token

74. List Chat Rooms
GET http://localhost:3000/api/chat/rooms
Headers:
  Authorization: Bearer your_admin_jwt_token

75. Chat Room Messages
GET http://localhost:3000/api/chat/rooms/7/messages?limit=50&page=1
Headers:
  Authorization: Bearer your_admin_jwt_token

76. Claim Chat Room
PATCH http://localhost:3000/api/chat/rooms/7/assign
Headers:
  Authorization: Bearer your_admin_jwt_token
Mengambil alih percakapan pengguna.

77. Close Chat Room
PATCH http://localhost:3000/api/chat/rooms/7/close
Headers:
  Authorization: Bearer your_admin_jwt_token

78. Chat Stats
GET http://localhost:3000/api/chat/stats
Headers:
  Authorization: Bearer your_admin_jwt_token

79. Mark Messages Read (Admin)
PATCH http://localhost:3000/api/chat/rooms/7/read
Headers:
  Authorization: Bearer your_admin_jwt_token
Menandai pesan pengguna sebagai sudah dibaca (sama endpoint dengan #39).

80. Customer Segments (Admin)
GET http://localhost:3000/api/admin/customers/segments
Headers:
  Authorization: Bearer your_admin_jwt_token
Menampilkan daftar pelanggan + jumlah pembelian selesai (`completed`/`shipped`), jumlah klaim garansi, dan tag saat ini.

81. Set / Reset Customer Tag (Admin)
PATCH http://localhost:3000/api/admin/users/:id/tag
Headers:
  Authorization: Bearer your_admin_jwt_token
Body contoh (manual):
{
  "tag": "loyal"              // opsi: prospect_new, loyal, needs_attention
}
Body contoh (reset ke otomatis):
{
  "mode": "auto"
}

Aturan otomatis:
- Default pengguna baru: `prospect_new`.
- >=3 pembelian berstatus `completed`/`shipped`: `loyal` (otomatis, atau bisa ditetapkan admin kapan saja).
- >=2 klaim garansi/complaint: `needs_attention` (rekomendasi label UI: “Perlu Perhatian” agar lebih netral daripada “Bermasalah”).
