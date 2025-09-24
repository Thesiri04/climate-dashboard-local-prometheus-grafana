# ระบบตรวจสอบสภาพอากาศ (Climate Monitoring System)

ระบบตรวจสอบสภาพอากาศแบบครบวงจรที่ใช้ ESP32 พร้อมการเก็บข้อมูล การตรวจสอบ และการแสดงผลแบบเรียลไทม์

### จัดทำโดย
1. นางสาวรพีพรรณ ธงชัย 66030158
2. นางสาวสิริรุ่งนภา พลซื่อ 66030188

## สถาปัตยกรรมระบบ

```
ESP32 (DHT11) → Backend (Node.js) → MongoDB → Prometheus → Grafana → Frontend
```

## ส่วนประกอบหลัก

### 1. เซ็นเซอร์ ESP32 (ESP-IDF)
- เซ็นเซอร์วัดอุณหภูมิและความชื้น DHT11
- การเชื่อมต่อ WiFi
- ส่งข้อมูลไปยัง backend ทุก 30 วินาทีำ
- ใช้เครื่องมือ ESP-IDF

### 2. เซิร์ฟเวอร์ Backend (Node.js/Express)
- รับข้อมูลเซ็นเซอร์ผ่าน HTTP POST
- เก็บข้อมูลใน MongoDB
- จัดหา REST API
- Prometheus Metrics enpoint
- **พอร์ต**: 3000

### 3. ฐานข้อมูล MongoDB
- เก็บข้อมูลพร้อมการลบอัตโนมัติ (30 วัน)
- สร้าง index เพื่อให้ค้นหาข้อมูลใน Mongodb ง่ายขึ้น เช่น ค้นหาตาม timestamp 
- **พอร์ต**: 27017

### 4. การตรวจสอบ Prometheus
- ดึงเมตริกจาก backend
- **พอร์ต**: 9090

### 5. แดชบอร์ด Grafana
- การแสดงผลแบบเรียลไทม์
- แดชบอร์ดที่ตั้งค่าไว้แล้ว
- **พอร์ต**: 3001 (แมปจาก 3000)
- **ข้อมูลเข้าสู่ระบบ**: admin/admin123 (ค่าเริ่มต้น)

### 6. แดชบอร์ด Frontend (React)
- แสดงข้อมูลแบบเรียลไทม์
- กราฟข้อมูลประวัติ
- ลิงก์ไปยัง Grafana
- **พอร์ต**: 3002

## การเริ่มต้นใช้งานอย่างรวดเร็ว

### 1. เริ่มต้นโครงสร้างพื้นฐาน

```bash
# ใน WSL Ubuntu
cd /home/thesiri/EmbbedSysLocal
docker-compose up -d
```

### 2. ตรวจสอบบริการ

- Backend: http://localhost:3000/health
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin123)
- Frontend: http://localhost:3002
- MongoDB: localhost:27017

### 3. การตั้งค่า ESP32

1. เปิดโปรเจค ESP32 ใน Windows (นอก WSL)
2. อัปเดต `main.c`:
   - แทนที่ `YOUR_WIFI_SSID` ด้วยชื่อ WiFi
   - แทนที่ `YOUR_WIFI_PASSWORD` ด้วยรหัสผ่าน WiFi 
   - แทนที่ `YOUR_LOCAL_IP` ด้วย IP ของเครื่อง Windows (ใช้ `ipconfig`)
   - ตัวอย่าง: `"http://192.168.1.100:3000/api/sensor-data"`
3. Build และ flash ไปยัง ESP32

### 4. การต่อสาย

เชื่อมต่อ DHT11 กับ ESP32:
- VCC → 3.3V
- GND → GND
- DATA → GPIO 4

## API Endpoints

### Backend (พอร์ต 3000)
- `POST /api/sensor-data` - รับข้อมูลเซ็นเซอร์
- `GET /api/sensor-data/latest` - ข้อมูลล่าสุด
- `GET /api/sensor-data/range` - ข้อมูลตามช่วงเวลา
- `GET /api/sensor-data/stats` - สถิติ
- `GET /api/devices` - รายการอุปกรณ์
- `GET /health` - ตรวจสอบสถานะ
- `GET /metrics` - เมตริก Prometheus

### รูปแบบข้อมูล
```json
{
  "deviceId": "ESP32-DHT11-001",
  "temperature": 25.5,
  "humidity": 60,
  "location": "ห้องนั่งเล่น",
  "timestamp": 1695123456
}
```

### แดชบอร์ด Grafana
- กราฟอุณหภูมิและความชื้นแบบเรียลไทม์
- แสดงค่าปัจจุบัน
- ตัวนับจุดข้อมูล
- ตัวบ่งชี้สถานะ backend

## โครงสร้างไฟล์

```
EmbbedSysLocal/
├── ESP32/
│   └── main.c                          # โค้ดเซ็นเซอร์ ESP32
├── backend/
│   ├── server.js                       # Backend Node.js
│   ├── package.json
│   ├── Dockerfile
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js                      # Frontend React
│   │   ├── App.css
│   │   └── index.js
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── prometheus/
│   ├── prometheus.yml                  # การตั้งค่า Prometheus
│   └── rules/
│       └── climate_alerts.yml          # กฎการแจ้งเตือน
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── prometheus.yml          # แหล่งข้อมูล Grafana
│       └── dashboards/
│           ├── dashboards.yml
│           └── climate-dashboard.json  # แดชบอร์ดที่สร้างไว้
├── mongodb/
│   └── init/
│       └── init-db.js                  # การเริ่มต้น MongoDB
├── docker-compose.yml                 # การจัดการ stack ทั้งหมด
└── README.md
```




