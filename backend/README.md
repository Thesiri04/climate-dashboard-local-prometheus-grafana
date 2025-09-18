# Climate Monitor Backend

Node.js/Express backend server for ESP32 climate monitoring system.

## Features

- Receives sensor data from ESP32 via HTTP POST
- Stores data in MongoDB with automatic expiration (30 days)
- Provides REST API for data retrieval
- Prometheus metrics integration
- Data validation and error handling
- Health checks and monitoring

## API Endpoints

### Sensor Data
- `POST /api/sensor-data` - Receive data from ESP32
- `GET /api/sensor-data/latest` - Get latest readings
- `GET /api/sensor-data/range` - Get data by time range
- `GET /api/sensor-data/stats` - Get statistics

### Monitoring
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics
- `GET /api/devices` - List all devices

## Data Format

ESP32 should send data in this format:
```json
{
  "deviceId": "ESP32-DHT11-001",
  "temperature": 25.5,
  "humidity": 60,
  "location": "Living Room",
  "timestamp": 1695123456
}
```

## Installation

```bash
npm install
npm start
```

## Docker

This service is designed to run in a Docker container as part of the climate monitoring stack.