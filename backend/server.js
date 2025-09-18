const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const promClient = require('prom-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const temperatureGauge = new promClient.Gauge({
  name: 'climate_temperature_celsius',
  help: 'Current temperature in Celsius',
  labelNames: ['device_id', 'location'],
  registers: [register]
});

const humidityGauge = new promClient.Gauge({
  name: 'climate_humidity_percent',
  help: 'Current humidity percentage',
  labelNames: ['device_id', 'location'],
  registers: [register]
});

const dataPointsCounter = new promClient.Counter({
  name: 'climate_data_points_total',
  help: 'Total number of climate data points received',
  labelNames: ['device_id', 'location'],
  registers: [register]
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/climate_monitor';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Sensor Data Schema
const sensorDataSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  temperature: {
    type: Number,
    required: true,
    min: -50,
    max: 100
  },
  humidity: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  location: {
    type: String,
    default: 'Unknown'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // Auto-delete after 30 days
  }
});

// Add indexes for better query performance
sensorDataSchema.index({ deviceId: 1, timestamp: -1 });
sensorDataSchema.index({ timestamp: -1 });

const SensorData = mongoose.model('SensorData', sensorDataSchema);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).end();
  }
});

// Receive sensor data from ESP32
app.post('/api/sensor-data', async (req, res) => {
  try {
    const { deviceId, temperature, humidity, location, timestamp } = req.body;

    // Validate required fields
    if (!deviceId || temperature === undefined || humidity === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: deviceId, temperature, humidity'
      });
    }

    // Validate data ranges
    if (temperature < -50 || temperature > 100) {
      return res.status(400).json({
        error: 'Temperature out of valid range (-50 to 100°C)'
      });
    }

    if (humidity < 0 || humidity > 100) {
      return res.status(400).json({
        error: 'Humidity out of valid range (0 to 100%)'
      });
    }

    // Create sensor data document
    const sensorData = new SensorData({
      deviceId,
      temperature: parseFloat(temperature),
      humidity: parseFloat(humidity),
      location: location || 'Unknown',
      timestamp: timestamp ? new Date(timestamp * 1000) : new Date()
    });

    // Save to MongoDB
    await sensorData.save();

    // Update Prometheus metrics
    const labels = { device_id: deviceId, location: location || 'Unknown' };
    temperatureGauge.set(labels, temperature);
    humidityGauge.set(labels, humidity);
    dataPointsCounter.inc(labels);

    console.log(`📊 Data received from ${deviceId}: ${temperature}°C, ${humidity}% (${location})`);

    res.status(201).json({
      message: 'Sensor data saved successfully',
      id: sensorData._id,
      timestamp: sensorData.timestamp
    });

  } catch (error) {
    console.error('Error saving sensor data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get latest sensor data
app.get('/api/sensor-data/latest', async (req, res) => {
  try {
    const { deviceId, limit = 10 } = req.query;

    const query = deviceId ? { deviceId } : {};
    const data = await SensorData.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      count: data.length,
      data
    });
  } catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get sensor data by time range
app.get('/api/sensor-data/range', async (req, res) => {
  try {
    const { deviceId, startTime, endTime, limit = 1000 } = req.query;

    let query = {};
    
    if (deviceId) {
      query.deviceId = deviceId;
    }

    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = new Date(startTime);
      if (endTime) query.timestamp.$lte = new Date(endTime);
    }

    const data = await SensorData.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      count: data.length,
      query: query,
      data
    });
  } catch (error) {
    console.error('Error fetching data range:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get sensor statistics
app.get('/api/sensor-data/stats', async (req, res) => {
  try {
    const { deviceId, hours = 24 } = req.query;

    const timeLimit = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    let matchQuery = { timestamp: { $gte: timeLimit } };
    if (deviceId) {
      matchQuery.deviceId = deviceId;
    }

    const stats = await SensorData.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$deviceId',
          avgTemperature: { $avg: '$temperature' },
          minTemperature: { $min: '$temperature' },
          maxTemperature: { $max: '$temperature' },
          avgHumidity: { $avg: '$humidity' },
          minHumidity: { $min: '$humidity' },
          maxHumidity: { $max: '$humidity' },
          dataPoints: { $sum: 1 },
          lastReading: { $max: '$timestamp' },
          location: { $last: '$location' }
        }
      }
    ]);

    res.json({
      timeRange: `Last ${hours} hours`,
      statistics: stats
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get all unique devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await SensorData.distinct('deviceId');
    
    const deviceInfo = await Promise.all(
      devices.map(async (deviceId) => {
        const latest = await SensorData.findOne({ deviceId })
          .sort({ timestamp: -1 })
          .lean();
        
        return {
          deviceId,
          location: latest?.location || 'Unknown',
          lastSeen: latest?.timestamp,
          lastTemperature: latest?.temperature,
          lastHumidity: latest?.humidity
        };
      })
    );

    res.json({
      count: devices.length,
      devices: deviceInfo
    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Climate Monitor Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`🌡️ API: http://localhost:${PORT}/api/sensor-data`);
});

module.exports = app;