// Initialize the climate_monitor database
db = db.getSiblingDB('climate_monitor');

// Create a user for the application
db.createUser({
  user: 'climate_user',
  pwd: 'climate_password',
  roles: [
    {
      role: 'readWrite',
      db: 'climate_monitor'
    }
  ]
});

// Create indexes for better performance
db.sensordatas.createIndex({ "deviceId": 1, "timestamp": -1 });
db.sensordatas.createIndex({ "timestamp": -1 });
db.sensordatas.createIndex({ "location": 1 });

print('MongoDB initialized for climate monitoring system');