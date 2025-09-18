# ระบบตรวจสอบสภาพอากาศ (Climate Monitoring System)

ระบบตรวจสอบสภาพอากาศแบบครบวงจรที่ใช้ ESP32 พร้อมการเก็บข้อมูล การตรวจสอบ และการแสดงผลแบบเรียลไทม์

## สถาปัตยกรรมระบบ

```
ESP32 (DHT11) → Backend (Node.js) → MongoDB → Prometheus → Grafana → Frontend
```

## ส่วนประกอบหลัก

### 1. เซ็นเซอร์ ESP32 (ESP-IDF)
- เซ็นเซอร์วัดอุณหภูมิและความชื้น DHT11
- การเชื่อมต่อ WiFi
- ส่งข้อมูลไปยัง backend ทุก 30 วินาทีำ
- **ตำแหน่ง**: Windows (นอก WSL) - ใช้เครื่องมือ ESP-IDF

### 2. เซิร์ฟเวอร์ Backend (Node.js/Express)
- รับข้อมูลเซ็นเซอร์ผ่าน HTTP POST
- เก็บข้อมูลใน MongoDB
- จัดหา REST API
- จุดสิ้นสุดเมตริก Prometheus
- **พอร์ต**: 3000

### 3. ฐานข้อมูล MongoDB
- เก็บข้อมูลพร้อมการลบอัตโนมัติ (30 วัน)
- จัดทำดัชนีเพื่อประสิทธิภาพ
- **พอร์ต**: 27017

### 4. การตรวจสอบ Prometheus
- ดึงเมตริกจาก backend
- กฎการแจ้งเตือนสำหรับระดับอุณหภูมิ/ความชื้น
- **พอร์ต**: 9090

### 5. แดชบอร์ด Grafana
- การแสดงผลแบบเรียลไทม์
- แดชบอร์ดที่ตั้งค่าไว้แล้ว
- **พอร์ต**: 3001 (แมปจาก 3000)
- **ข้อมูลเข้าสู่ระบบ**: admin/admin123

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
   - แทนที่ `YOUR_WIFI_SSID` ด้วยชื่อ WiFi ของคุณ
   - แทนที่ `YOUR_WIFI_PASSWORD` ด้วยรหัสผ่าน WiFi ของคุณ
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

## การตรวจสอบและแจ้งเตือน

### การแจ้งเตือน Prometheus
- อุณหภูมิสูงเกินไป (>35°C)
- อุณหภูมิต่ำเกินไป (<10°C)
- ความชื้นสูงเกินไป (>80%)
- ความชื้นต่ำเกินไป (<20%)
- ไม่มีข้อมูลล่าสุด (10 นาที)
- บริการ backend ล่ม

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

## การแก้ไขปัญหา

### ปัญหา ESP32
1. ตรวจสอบข้อมูลเข้าสู่ระบบ WiFi ใน `main.c`
2. ตรวจสอบที่อยู่ IP ในพื้นที่ใน SERVER_URL_LOCAL
3. ตรวจสอบการต่อสาย DHT11 ให้ถูกต้อง
4. ตรวจสอบ serial monitor สำหรับสถานะการเชื่อมต่อ

### ปัญหา Backend
1. ตรวจสอบการเชื่อมต่อ MongoDB: `docker logs climate-mongodb`
2. ตรวจสอบ log backend: `docker logs climate-backend`
3. ตรวจสอบว่าพอร์ต 3000 ไม่ได้ใช้งาน

### ปัญหา Grafana
1. ข้อมูลเข้าสู่ระบบเริ่มต้น: admin/admin123
2. แดชบอร์ดควรโหลดอัตโนมัติ
3. ตรวจสอบการเชื่อมต่อแหล่งข้อมูล Prometheus

### ปัญหาเครือข่าย
1. ตรวจสอบให้แน่ใจว่าบริการทั้งหมดอยู่ในเครือข่ายเดียวกัน
2. ตรวจสอบการตั้งค่า firewall สำหรับพอร์ต 3000, 3001, 3002, 9090
3. ตรวจสอบให้แน่ใจว่า ESP32 และคอมพิวเตอร์อยู่ในเครือข่าย WiFi เดียวกัน

## การปรับแต่ง

### การเพิ่มเซ็นเซอร์ใหม่
1. แก้ไขโค้ด ESP32 เพื่ออ่านเซ็นเซอร์เพิ่มเติม
2. อัปเดต schema และ API ของ backend
3. เพิ่มเมตริกใหม่ให้ Prometheus
4. อัปเดตแดชบอร์ด Grafana
5. ขยายกราฟ frontend

### การเปลี่ยนการเก็บข้อมูล
- MongoDB: แก้ไขฟิลด์ `expires` ใน schema (ปัจจุบัน 30 วัน)
- Prometheus: ปรับ `--storage.tsdb.retention.time` ใน docker-compose.yml

### การแจ้งเตือน
แก้ไข `prometheus/rules/climate_alerts.yml` เพื่อปรับเปลี่ยนขีดจำกัดอุณหภูมิ/ความชื้น

## หมายเหตุสำหรับการใช้งานจริง

- เปลี่ยนรหัสผ่าน Grafana เริ่มต้น
- ตั้งค่าการยืนยันตัวตนที่เหมาะสมสำหรับบริการทั้งหมด
- ตั้งค่าใบรับรอง SSL/TLS
- ตั้งค่าการหมุนเวียน log
- ตรวจสอบการใช้ดิสก์สำหรับ data volume
- พิจารณาใช้ตัวแปรสภาพแวดล้อมสำหรับการตั้งค่าที่ละเอียดอ่อน

## เมตริกที่แสดงในระบบ

จากการตรวจสอบระบบ เมตริกที่สำคัญที่แสดงในแดshboard ได้แก่:

- **อุณหภูมิ**: 24°C (climate_temperature_celsius)
- **ความชื้น**: 76% (climate_humidity_percent)  
- **จำนวนข้อมูล**: 22 จุดข้อมูล (climate_data_points_total)

## ลิขสิทธิ์

MIT License - สามารถนำไปแก้ไขและแจกจ่ายได้อย่างอิสระ