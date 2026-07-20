# TDSS — ระบบวางแผนงานขนส่ง

โปรเจกต์ธีสิส: Transport/Logistics Decision Support System — สร้างงานขนส่ง → วางแผนเส้นทาง/ยานพาหนะ → รับคำแนะนำด้วยวิธี AHP (Analytic Hierarchy Process) → อนุมัติแผน → ติดตามผ่าน Dashboard/Reports พร้อม System Owner Console สำหรับดูแลหลายองค์กร

## โครงสร้างโปรเจกต์

- `backend/` — FastAPI + SQLAlchemy + JWT auth, โค้ด TDSS ทั้งหมดอยู่ใต้ `backend/app/tdss/` (AI Module อยู่ใต้ `backend/app/tdss/ai/` — ดู [docs/AI_MODULE.md](docs/AI_MODULE.md))
- `frontend/` — React + TypeScript + Vite, ธีม TDSS (sidebar เข้ม `#171717`, accent แดง `#D71920`)

## รันโปรเจกต์บนเครื่อง (local)

### Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/activate        # Windows
pip install -r requirements.txt
cp .env.example .env           # ค่า default ใช้ SQLite ในเครื่องได้เลย
uvicorn app.main:app --reload --port 8000
python -m app.tdss.seed        # สร้างข้อมูลตัวอย่าง (บัญชีทดสอบแสดงในหน้า login)
```

เปิด `http://localhost:8000/docs` เพื่อดู API (Swagger)

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

เปิด `http://localhost:5173`

### ทดสอบ backend

```bash
cd backend
pytest -q
```

## Deploy ขึ้น Cloud

### Database → Neon (Postgres free, ไม่หมดอายุ)

1. สร้างโปรเจกต์บน [Neon](https://console.neon.tech/) (ใช้ฟรี, ต่างจาก Render Postgres ตรงที่ไม่หมดอายุใน 90 วัน)
2. คัดลอก connection string (รูปแบบ `postgresql://user:password@host/dbname?sslmode=require`) ไว้ใช้ตั้งเป็น `DATABASE_URL` ในขั้นถัดไป

### Backend → Render

1. Push โค้ดขึ้น GitHub
2. สร้าง Web Service ใหม่บน Render ชี้ไปที่ repo นี้ folder `backend/` (Render จะใช้ `backend/render.yaml` เป็น Blueprint สร้าง Web Service ให้อัตโนมัติ)
3. ตั้งค่า Environment Variable ด้วยตนเอง (ทั้งสองตัวถูก mark `sync: false` ใน render.yaml เพราะเป็นค่าที่ต้องกรอกเอง):
   - `DATABASE_URL` — connection string จาก Neon (ขั้นตอนด้านบน)
   - `CORS_ORIGINS` — URL ของ frontend หลัง deploy (เช่น `https://your-app.vercel.app`)
   - (`JWT_SECRET` ถูกสร้างให้อัตโนมัติจาก render.yaml)
4. Deploy แล้วจดโดเมนที่ได้ (เช่น `https://tdss-api.onrender.com`)
5. รัน seed ข้อมูลตัวอย่างบน production (ผ่าน Render Shell): `python -m app.tdss.seed`

### Frontend → Vercel

1. Import repo นี้เข้า Vercel, ตั้ง Root Directory เป็น `frontend`
2. ตั้งค่า Environment Variable: `VITE_API_URL` = โดเมน backend จาก Render
3. Deploy — Vercel จะ build ด้วย `npm run build` อัตโนมัติ

หลัง deploy ทั้งสองฝั่งแล้ว อย่าลืมกลับไปอัปเดต `CORS_ORIGINS` บน Render ให้ตรงกับโดเมน Vercel จริง แล้ว redeploy backend อีกครั้ง

## หมายเหตุ

ไฟล์ `.mp4` ในโฟลเดอร์นี้ (วิดีโออ้างอิง/ตัวอย่าง prototype) ถูกใส่ไว้ใน `.gitignore` เพราะไฟล์ใหญ่ — ไม่ได้ลบ แค่ไม่เข้า git
