#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "esp_mac.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_http_client.h"
#include "esp_sntp.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include "cJSON.h"

// DHT11 includes (using bit-banging implementation)
#include "rom/ets_sys.h"

// WiFi Configuration - UPDATE THESE WITH YOUR NETWORK
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASS "YOUR_WIFI_PASSWORD"

// Server Configuration  
// IMPORTANT: Replace YOUR_LOCAL_IP with your Windows machine's IP address
// Find it using: ipconfig (look for IPv4 Address)
// Example: "http://192.168.1.100:3000/api/sensor-data"
#define SERVER_URL_LOCAL "http://YOUR_LOCAL_IP:3000/api/sensor-data"
#define MAX_HTTP_RECV_BUFFER 512
#define MAX_HTTP_OUTPUT_BUFFER 2048

// DHT11 Configuration
#define DHT11_PIN GPIO_NUM_4
#define DHT11_TIMEOUT_US 100

// Timing Configuration
#define UPLOAD_INTERVAL_MS (30 * 1000)  // 30 seconds

// WiFi Event Group
static EventGroupHandle_t s_wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT BIT1

static const char *TAG = "ESP32_Climate_Monitor";
static int s_retry_num = 0;
#define EXAMPLE_ESP_MAXIMUM_RETRY 5

// DHT11 Structure
typedef struct {
    float temperature;
    float humidity;
    bool valid;
} dht11_data_t;

// Function Prototypes
static void wifi_init_sta(void);
static void event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data);
static dht11_data_t read_dht11(void);
static esp_err_t http_event_handler(esp_http_client_event_t *evt);
static bool send_sensor_data(float temperature, float humidity);
static void sensor_task(void *pvParameters);
static void time_sync_notification_cb(struct timeval *tv);
static void initialize_sntp(void);

// WiFi Event Handler
static void event_handler(void* arg, esp_event_base_t event_base,
                         int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_num < EXAMPLE_ESP_MAXIMUM_RETRY) {
            esp_wifi_connect();
            s_retry_num++;
            ESP_LOGI(TAG, "retry to connect to the AP");
        } else {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
        ESP_LOGI(TAG,"connect to the AP fail");
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "got ip:" IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_num = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

// WiFi Initialization
static void wifi_init_sta(void)
{
    s_wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
            .pmf_cfg = {
                .capable = true,
                .required = false
            },
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA) );
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config) );
    ESP_ERROR_CHECK(esp_wifi_start() );

    ESP_LOGI(TAG, "wifi_init_sta finished.");

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
            WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
            pdFALSE,
            pdFALSE,
            portMAX_DELAY);

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "connected to ap SSID:%s", WIFI_SSID);
    } else if (bits & WIFI_FAIL_BIT) {
        ESP_LOGI(TAG, "Failed to connect to SSID:%s", WIFI_SSID);
    } else {
        ESP_LOGE(TAG, "UNEXPECTED EVENT");
    }
}

// SNTP Time Synchronization
static void time_sync_notification_cb(struct timeval *tv)
{
    ESP_LOGI(TAG, "Time synchronized");
}

static void initialize_sntp(void)
{
    ESP_LOGI(TAG, "Initializing SNTP");
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_set_time_sync_notification_cb(time_sync_notification_cb);
    esp_sntp_set_sync_mode(SNTP_SYNC_MODE_IMMED);
    esp_sntp_init();

    setenv("TZ", "UTC-0", 1);
    tzset();
}

// DHT11 Bit-Banging Implementation
static void dht11_send_start_signal(void)
{
    gpio_set_direction(DHT11_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(DHT11_PIN, 0);
    ets_delay_us(18000);  // 18ms low signal
    gpio_set_level(DHT11_PIN, 1);
    ets_delay_us(30);     // 30us high signal
    gpio_set_direction(DHT11_PIN, GPIO_MODE_INPUT);
}

static bool dht11_wait_for_signal(int level, int timeout_us)
{
    int count = 0;
    while (gpio_get_level(DHT11_PIN) != level) {
        if (count++ > timeout_us) {
            return false;
        }
        ets_delay_us(1);
    }
    return true;
}

static dht11_data_t read_dht11(void)
{
    dht11_data_t result = {0};
    uint8_t data[5] = {0};
    
    // Send start signal
    dht11_send_start_signal();
    
    // Wait for DHT11 response
    if (!dht11_wait_for_signal(0, 100) || !dht11_wait_for_signal(1, 100) || !dht11_wait_for_signal(0, 100)) {
        ESP_LOGE(TAG, "DHT11 response timeout");
        return result;
    }
    
    // Read 40 bits of data
    for (int i = 0; i < 40; i++) {
        if (!dht11_wait_for_signal(1, 100)) {
            ESP_LOGE(TAG, "DHT11 data timeout at bit %d", i);
            return result;
        }
        
        // Wait for 30us to determine if bit is 0 or 1
        ets_delay_us(30);
        
        if (gpio_get_level(DHT11_PIN) == 1) {
            data[i / 8] |= (1 << (7 - (i % 8)));
        }
        
        if (!dht11_wait_for_signal(0, 100)) {
            ESP_LOGE(TAG, "DHT11 bit end timeout at bit %d", i);
            return result;
        }
    }
    
    // Verify checksum
    uint8_t checksum = data[0] + data[1] + data[2] + data[3];
    if (checksum != data[4]) {
        ESP_LOGE(TAG, "DHT11 checksum error. Expected: %d, Got: %d", checksum, data[4]);
        return result;
    }
    
    // Extract temperature and humidity
    result.humidity = (float)data[0];
    result.temperature = (float)data[2];
    result.valid = true;
    
    ESP_LOGI(TAG, "🌡️ Temperature: %.1f°C | 💧 Humidity: %.0f%%", result.temperature, result.humidity);
    
    return result;
}

// HTTP Event Handler
static esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    static char *output_buffer;
    static int output_len;
    
    switch(evt->event_id) {
        case HTTP_EVENT_ERROR:
            ESP_LOGD(TAG, "HTTP_EVENT_ERROR");
            break;
        case HTTP_EVENT_ON_CONNECTED:
            ESP_LOGD(TAG, "HTTP_EVENT_ON_CONNECTED");
            break;
        case HTTP_EVENT_HEADER_SENT:
            ESP_LOGD(TAG, "HTTP_EVENT_HEADER_SENT");
            break;
        case HTTP_EVENT_ON_HEADER:
            ESP_LOGD(TAG, "HTTP_EVENT_ON_HEADER, key=%s, value=%s", evt->header_key, evt->header_value);
            break;
        case HTTP_EVENT_ON_DATA:
            ESP_LOGD(TAG, "HTTP_EVENT_ON_DATA, len=%d", evt->data_len);
            if (!esp_http_client_is_chunked_response(evt->client)) {
                if (evt->user_data) {
                    memcpy(evt->user_data + output_len, evt->data, evt->data_len);
                    output_len += evt->data_len;
                }
            }
            break;
        case HTTP_EVENT_ON_FINISH:
            ESP_LOGD(TAG, "HTTP_EVENT_ON_FINISH");
            if (evt->user_data) {
                *((char*)evt->user_data + output_len) = 0;
            }
            output_len = 0;
            break;
        case HTTP_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "HTTP_EVENT_DISCONNECTED");
            break;
        case HTTP_EVENT_REDIRECT:
            ESP_LOGD(TAG, "HTTP_EVENT_REDIRECT");
            break;
    }
    return ESP_OK;
}

// Send Sensor Data to Local Backend
static bool send_sensor_data(float temperature, float humidity)
{
    char local_response_buffer[MAX_HTTP_OUTPUT_BUFFER] = {0};
    bool success = false;
    
    ESP_LOGI(TAG, "📤 Sending data to local backend...");
    
    // Get current timestamp
    time_t now;
    time(&now);
    
    // Create JSON payload
    cJSON *json = cJSON_CreateObject();
    cJSON *device_id = cJSON_CreateString("ESP32-DHT11-001");
    cJSON *temperature_json = cJSON_CreateNumber(temperature);
    cJSON *humidity_json = cJSON_CreateNumber(humidity);
    cJSON *timestamp_json = cJSON_CreateNumber(now);
    cJSON *location = cJSON_CreateString("Living Room");
    
    cJSON_AddItemToObject(json, "deviceId", device_id);
    cJSON_AddItemToObject(json, "temperature", temperature_json);
    cJSON_AddItemToObject(json, "humidity", humidity_json);
    cJSON_AddItemToObject(json, "timestamp", timestamp_json);
    cJSON_AddItemToObject(json, "location", location);
    
    char *json_string = cJSON_Print(json);
    
    ESP_LOGI(TAG, "Payload: %s", json_string);
    
    // Configure HTTP client
    esp_http_client_config_t config = {
        .url = SERVER_URL_LOCAL,
        .event_handler = http_event_handler,
        .user_data = local_response_buffer,
        .disable_auto_redirect = true,
        .timeout_ms = 10000,
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_method(client, HTTP_METHOD_POST);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, json_string, strlen(json_string));
    
    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "📊 Response code: %d", status_code);
        
        if (status_code >= 200 && status_code < 300) {
            ESP_LOGI(TAG, "✅ Data uploaded successfully!");
            success = true;
        } else {
            ESP_LOGW(TAG, "⚠️ Server returned status %d", status_code);
        }
        
        if (strlen(local_response_buffer) > 0) {
            ESP_LOGD(TAG, "Response: %s", local_response_buffer);
        }
    } else {
        ESP_LOGE(TAG, "❌ Connection error: %s", esp_err_to_name(err));
    }
    
    esp_http_client_cleanup(client);
    free(json_string);
    cJSON_Delete(json);
    
    return success;
}

// Main Sensor Task
static void sensor_task(void *pvParameters)
{
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = pdMS_TO_TICKS(UPLOAD_INTERVAL_MS);
    
    while (1) {
        ESP_LOGI(TAG, "\n=== Climate Monitor Reading ===");
        
        // Read sensor data with retries
        dht11_data_t sensor_data;
        int retry_count = 0;
        const int max_retries = 3;
        
        do {
            if (retry_count > 0) {
                ESP_LOGI(TAG, "Retry %d/%d...", retry_count, max_retries - 1);
                vTaskDelay(pdMS_TO_TICKS(2000));
            }
            
            sensor_data = read_dht11();
            retry_count++;
        } while (!sensor_data.valid && retry_count < max_retries);
        
        if (sensor_data.valid) {
            // Check WiFi connection
            wifi_ap_record_t ap_info;
            if (esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK) {
                bool upload_success = send_sensor_data(sensor_data.temperature, sensor_data.humidity);
                if (upload_success) {
                    ESP_LOGI(TAG, "🎉 Data sent successfully!");
                } else {
                    ESP_LOGE(TAG, "💥 Failed to send data");
                }
            } else {
                ESP_LOGE(TAG, "❌ WiFi not connected!");
            }
        } else {
            ESP_LOGE(TAG, "❌ Failed to read DHT11 after %d attempts!", max_retries);
        }
        
        ESP_LOGI(TAG, "⏰ Next reading in %d seconds\n", UPLOAD_INTERVAL_MS / 1000);
        
        // Wait for next cycle
        vTaskDelayUntil(&xLastWakeTime, xFrequency);
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "=== ESP32 Climate Monitor Starting ===");
    
    // Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
    
    // Initialize DHT11 GPIO
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << DHT11_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);
    
    ESP_LOGI(TAG, "DHT11 sensor initialized on GPIO %d", DHT11_PIN);
    
    // Give DHT11 time to stabilize
    ESP_LOGI(TAG, "Waiting for DHT11 to stabilize...");
    vTaskDelay(pdMS_TO_TICKS(2000));
    
    // Initialize WiFi
    wifi_init_sta();
    
    // Initialize SNTP
    initialize_sntp();
    
    // Wait for time synchronization
    time_t now = 0;
    struct tm timeinfo = { 0 };
    int retry = 0;
    const int retry_count = 10;
    
    while (sntp_get_sync_status() == SNTP_SYNC_STATUS_RESET && ++retry < retry_count) {
        ESP_LOGI(TAG, "Waiting for time sync... (%d/%d)", retry, retry_count);
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
    
    time(&now);
    localtime_r(&now, &timeinfo);
    ESP_LOGI(TAG, "Current time: %s", asctime(&timeinfo));
    
    // Create sensor task
    xTaskCreate(sensor_task, "sensor_task", 8192, NULL, 5, NULL);
    
    ESP_LOGI(TAG, "🚀 Climate Monitor System Ready!");
}