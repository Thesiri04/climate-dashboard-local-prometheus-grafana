import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
const GRAFANA_URL = process.env.REACT_APP_GRAFANA_URL || 'http://localhost:3001';

function App() {
  const [currentData, setCurrentData] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Fetch latest data
  const fetchLatestData = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/sensor-data/latest?limit=1`);
      if (response.data.data && response.data.data.length > 0) {
        setCurrentData(response.data.data[0]);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Error fetching latest data:', err);
      setError('Failed to fetch latest data');
    }
  };

  // Fetch historical data
  const fetchHistoricalData = async (deviceId = '') => {
    try {
      const params = new URLSearchParams();
      if (deviceId) params.append('deviceId', deviceId);
      params.append('limit', '100');
      
      const response = await axios.get(`${BACKEND_URL}/api/sensor-data/latest?${params}`);
      
      const processedData = response.data.data.map(item => ({
        ...item,
        time: moment(item.timestamp).format('HH:mm'),
        datetime: moment(item.timestamp).format('MMM DD, HH:mm')
      })).reverse();
      
      setHistoricalData(processedData);
    } catch (err) {
      console.error('Error fetching historical data:', err);
      setError('Failed to fetch historical data');
    }
  };

  // Fetch devices
  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/devices`);
      setDevices(response.data.devices || []);
      if (response.data.devices && response.data.devices.length > 0) {
        setSelectedDevice(response.data.devices[0].deviceId);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Failed to fetch devices');
    }
  };

  // Initial data fetch
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await Promise.all([
        fetchDevices(),
        fetchLatestData(),
        fetchHistoricalData()
      ]);
      setLoading(false);
    };

    initializeData();
  }, []);

  // Fetch historical data when device changes
  useEffect(() => {
    if (selectedDevice) {
      fetchHistoricalData(selectedDevice);
    }
  }, [selectedDevice]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLatestData();
      if (selectedDevice) {
        fetchHistoricalData(selectedDevice);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedDevice]);

  const getTemperatureColor = (temp) => {
    if (temp < 10) return '#3b82f6'; // Blue
    if (temp < 20) return '#06b6d4'; // Cyan
    if (temp < 25) return '#10b981'; // Green
    if (temp < 30) return '#f59e0b'; // Yellow
    if (temp < 35) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  const getHumidityColor = (humidity) => {
    if (humidity < 30) return '#ef4444'; // Red
    if (humidity < 40) return '#f97316'; // Orange
    if (humidity < 60) return '#10b981'; // Green
    if (humidity < 70) return '#f59e0b'; // Yellow
    return '#3b82f6'; // Blue
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading climate data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>⚠️ Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="header">
        <h1>🌡️ Climate Monitoring Dashboard</h1>
        <div className="header-info">
          {lastUpdate && (
            <p>Last updated: {moment(lastUpdate).format('HH:mm:ss')}</p>
          )}
          <a 
            href={`${GRAFANA_URL}/d/climate-monitoring`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="grafana-link"
          >
            📊 Open Grafana Dashboard
          </a>
        </div>
      </header>

      <main className="main-content">
        {/* Current Readings */}
        {currentData && (
          <section className="current-readings">
            <h2>Current Readings</h2>
            <div className="readings-grid">
              <div className="reading-card temperature">
                <h3>🌡️ Temperature</h3>
                <div 
                  className="reading-value"
                  style={{ color: getTemperatureColor(currentData.temperature) }}
                >
                  {currentData.temperature.toFixed(1)}°C
                </div>
                <p className="reading-location">{currentData.location}</p>
                <p className="reading-time">
                  {moment(currentData.timestamp).fromNow()}
                </p>
              </div>
              
              <div className="reading-card humidity">
                <h3>💧 Humidity</h3>
                <div 
                  className="reading-value"
                  style={{ color: getHumidityColor(currentData.humidity) }}
                >
                  {currentData.humidity.toFixed(0)}%
                </div>
                <p className="reading-location">{currentData.location}</p>
                <p className="reading-time">
                  {moment(currentData.timestamp).fromNow()}
                </p>
              </div>

              <div className="reading-card device">
                <h3>📱 Device</h3>
                <div className="reading-value device-id">
                  {currentData.deviceId}
                </div>
                <p className="reading-location">{currentData.location}</p>
                <p className="reading-time">Active</p>
              </div>
            </div>
          </section>
        )}

        {/* Device Selector */}
        {devices.length > 1 && (
          <section className="device-selector">
            <label htmlFor="device-select">Select Device:</label>
            <select 
              id="device-select"
              value={selectedDevice} 
              onChange={(e) => setSelectedDevice(e.target.value)}
            >
              {devices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.deviceId} - {device.location}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* Historical Charts */}
        <section className="charts-section">
          <h2>Historical Data (Last 100 readings)</h2>
          
          {historicalData.length > 0 ? (
            <div className="charts-grid">
              <div className="chart-container">
                <h3>Temperature Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#9ca3af"
                    />
                    <YAxis 
                      stroke="#9ca3af"
                      label={{ value: '°C', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      labelFormatter={(value, payload) => {
                        if (payload && payload.length > 0) {
                          return payload[0].payload.datetime;
                        }
                        return value;
                      }}
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: 'none',
                        borderRadius: '8px',
                        color: '#f9fafb'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#ef4444" 
                      fill="#ef4444"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-container">
                <h3>Humidity Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#9ca3af"
                    />
                    <YAxis 
                      stroke="#9ca3af"
                      label={{ value: '%', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      labelFormatter={(value, payload) => {
                        if (payload && payload.length > 0) {
                          return payload[0].payload.datetime;
                        }
                        return value;
                      }}
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: 'none',
                        borderRadius: '8px',
                        color: '#f9fafb'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="humidity" 
                      stroke="#3b82f6" 
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-container combined-chart">
                <h3>Combined Temperature & Humidity</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#9ca3af"
                    />
                    <YAxis 
                      yAxisId="temp"
                      stroke="#ef4444"
                      label={{ value: '°C', angle: -90, position: 'insideLeft' }}
                    />
                    <YAxis 
                      yAxisId="humidity"
                      orientation="right"
                      stroke="#3b82f6"
                      label={{ value: '%', angle: 90, position: 'insideRight' }}
                    />
                    <Tooltip 
                      labelFormatter={(value, payload) => {
                        if (payload && payload.length > 0) {
                          return payload[0].payload.datetime;
                        }
                        return value;
                      }}
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: 'none',
                        borderRadius: '8px',
                        color: '#f9fafb'
                      }}
                    />
                    <Legend />
                    <Line 
                      yAxisId="temp"
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      dot={false}
                      name="Temperature (°C)"
                    />
                    <Line 
                      yAxisId="humidity"
                      type="monotone" 
                      dataKey="humidity" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={false}
                      name="Humidity (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="no-data">
              <p>No historical data available</p>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>ESP32 Climate Monitoring System - Real-time sensor data</p>
        <div className="footer-links">
          <a href={`${GRAFANA_URL}`} target="_blank" rel="noopener noreferrer">
            Grafana
          </a>
          <a href={`${BACKEND_URL}/health`} target="_blank" rel="noopener noreferrer">
            Backend Status
          </a>
          <a href="http://localhost:9090" target="_blank" rel="noopener noreferrer">
            Prometheus
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;