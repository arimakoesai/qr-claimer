# QRCOIN Farcaster Auto-Claim

## Fitur Utama

- Mendukung multi-akun
- Autentikasi Farcaster via Privy
- Cek status klaim
- Transaksi on-chain 
- Argumen fleksibel: `--auction`, `--min`

---

## Prasyarat

Pastikan sudah terpasang:

- **Node.js v18+**  
  Cek dengan:
  ```bash
  node -v
  ```
- **Git** (opsional, untuk clone repository)
- Koneksi internet yang stabil ke jaringan **Base**

---

## Clone / Download Proyek

```bash
git clone https://github.com/arimakoesai/qr-claimer.git
cd qr-claimer
```

Atau download ZIP dari GitHub dan ekstrak manual.

---

## Instal Dependency

```bash
npm install
```

Dependency utama:
- [axios](https://www.npmjs.com/package/axios) — HTTP client
- [ethers](https://www.npmjs.com/package/ethers) — library Ethereum

---

## Siapkan File Akun

1️⃣ Duplikat file contoh:
```bash
cp pkfid.example.txt pkfid.txt
```

2️⃣ Buka `pkfid.txt` dan isi dengan format berikut:
```
0xPRIVATE_KEY|FID_NUMBER
```

Contoh:
```
0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|1111111
0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|2222222
0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc|3333333
```

---

## Menjalankan Script

```bash
node qrcoin.js --auction 234 --min 500
```

| Argumen | Deskripsi | Default |
|----------|------------|----------|
| `--auction` | ID lelang QRCOIN aktif | `150` |
| `--min` | Minimum jumlah token untuk diklaim | `1000` |

---

## Contoh Output

```
Menggunakan auction ID: 234
Minimum token claim: 500

Terkoneksi ke Base RPC

Proses FID 1234567
Alamat: 0x71c7656ec7ab88b098defb751b7401b5f6d8976f
Login sebagai @arimakoesai
Pre-check claimed? tidak
TX Hash: https://basescan.org/tx/0x3170ac98eabd14628475f91f970bf8cc5241bbc7196dba904adc0cc9234706ba
Konfirmasi klaim OK - Amount: 20000QR
Status setelah klaim: sudah

================= HASIL =================
Total token berhasil diklaim: 20000
Selesai
```

---

## Perintah Ringkas

```bash
# Clone project
git clone https://github.com/arimakoesai/qr-claimer.git
cd qr-claimer

# Install dependency
npm install

# Tambah akun
cp pkfid.example.txt pkfid.txt
nano pkfid.txt  # isi private key dan FID kamu

# Jalankan
node qrcoin.js --auction 200 --min 500
```

---

## Tips & Catatan

- Gunakan `--auction` sesuai ID aktif hari ini (misal 200)
- Jalankan script saat gas jaringan Base sedang rendah
- Gunakan VPS agar tidak disconnect
- Cek transaksi di [BaseScan](https://basescan.org)

---

## ⚖️ Lisensi

MIT License © 2025  
Dibuat oleh [@arimakoesai](https://github.com/arimakoesai)

---

**Disclaimer:**  
Script ini dibuat untuk tujuan **edukasi dan otomatisasi pribadi**.  
Gunakan dengan risiko sendiri.
