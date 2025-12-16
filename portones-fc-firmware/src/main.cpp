#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ==================== PIN CONFIGURATION ====================
#define SERVO_PIN 13  // GPIO 13 for servo control

// ==================== WIFI CONFIGURATION ====================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ==================== MQTT CONFIGURATION ====================
const char* MQTT_BROKER = "your-hivemq-broker.hivemq.cloud";
const int MQTT_PORT = 8883;  // Use 8883 for TLS/SSL
const char* MQTT_USERNAME = "your-mqtt-username";
const char* MQTT_PASSWORD = "your-mqtt-password";
const char* MQTT_CLIENT_ID = "ESP32_GateController";
const char* MQTT_TOPIC = "portones/gate/command";

// ==================== GLOBAL OBJECTS ====================
WiFiClient espClient;
PubSubClient mqttClient(espClient);
Servo gateServo;

// ==================== GATE STATE ====================
enum GateState {
  IDLE,
  OPENING,
  OPEN,
  CLOSING
};

GateState currentState = IDLE;
unsigned long gateOpenTime = 0;
const unsigned long GATE_OPEN_DURATION = 5000; // 5 seconds

// Servo positions
const int SERVO_CLOSED_POSITION = 0;    // 0 degrees = closed
const int SERVO_OPEN_POSITION = 90;     // 90 degrees = open

// ==================== FUNCTION DECLARATIONS ====================
void setupWiFi();
void setupMQTT();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void processGateCommand(const char* action);
void updateGateState();
void openGate();
void closeGate();

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n==========================================");
  Serial.println("   ESP32 Gate Controller Starting...");
  Serial.println("==========================================\n");

  // Initialize servo
  gateServo.attach(SERVO_PIN);
  gateServo.write(SERVO_CLOSED_POSITION);
  Serial.println("[SERVO] Initialized on GPIO " + String(SERVO_PIN));
  Serial.println("[SERVO] Set to closed position (0°)");

  // Connect to WiFi
  setupWiFi();

  // Setup MQTT
  setupMQTT();

  Serial.println("\n[SYSTEM] Setup complete. Ready to receive commands.\n");
}

// ==================== MAIN LOOP ====================
void loop() {
  // Ensure MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Update gate state (non-blocking)
  updateGateState();

  // Small delay to prevent watchdog issues
  delay(10);
}

// ==================== WIFI SETUP ====================
void setupWiFi() {
  Serial.println("[WiFi] Connecting to: " + String(WIFI_SSID));
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.println("[WiFi] IP Address: " + WiFi.localIP().toString());
    Serial.println("[WiFi] Signal Strength: " + String(WiFi.RSSI()) + " dBm");
  } else {
    Serial.println("\n[WiFi] Connection failed!");
    Serial.println("[WiFi] Restarting in 5 seconds...");
    delay(5000);
    ESP.restart();
  }
}

// ==================== MQTT SETUP ====================
void setupMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  Serial.println("[MQTT] Broker: " + String(MQTT_BROKER) + ":" + String(MQTT_PORT));
  
  reconnectMQTT();
}

// ==================== MQTT RECONNECT ====================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.println("[MQTT] Attempting connection...");
    
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("[MQTT] Connected!");
      
      // Subscribe to command topic
      if (mqttClient.subscribe(MQTT_TOPIC)) {
        Serial.println("[MQTT] Subscribed to topic: " + String(MQTT_TOPIC));
      } else {
        Serial.println("[MQTT] Failed to subscribe to topic!");
      }
      
      // Publish online status
      mqttClient.publish("portones/gate/status", "{\"status\":\"online\"}");
      
    } else {
      Serial.print("[MQTT] Connection failed, rc=");
      Serial.println(mqttClient.state());
      Serial.println("[MQTT] Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

// ==================== MQTT CALLBACK ====================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.println("\n[MQTT] Message received on topic: " + String(topic));
  
  // Convert payload to string
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  
  Serial.println("[MQTT] Payload: " + String(message));

  // Parse JSON
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.println("[JSON] Parse failed: " + String(error.c_str()));
    return;
  }

  // Extract action
  const char* action = doc["action"];
  const char* timestamp = doc["timestamp"];

  if (action) {
    Serial.println("[COMMAND] Action: " + String(action));
    if (timestamp) {
      Serial.println("[COMMAND] Timestamp: " + String(timestamp));
    }
    
    processGateCommand(action);
  } else {
    Serial.println("[COMMAND] No action field found in JSON");
  }
}

// ==================== PROCESS GATE COMMAND ====================
void processGateCommand(const char* action) {
  if (strcmp(action, "OPEN") == 0) {
    if (currentState == IDLE) {
      Serial.println("\n[GATE] Command accepted: OPEN");
      openGate();
    } else {
      Serial.println("[GATE] Command ignored: Gate is busy (State: " + String(currentState) + ")");
    }
  } else {
    Serial.println("[GATE] Unknown command: " + String(action));
  }
}

// ==================== OPEN GATE ====================
void openGate() {
  Serial.println("[GATE] Opening gate...");
  currentState = OPENING;
  
  gateServo.write(SERVO_OPEN_POSITION);
  
  Serial.println("[SERVO] Moved to open position (" + String(SERVO_OPEN_POSITION) + "°)");
  
  currentState = OPEN;
  gateOpenTime = millis();
  
  // Publish status
  mqttClient.publish("portones/gate/status", "{\"status\":\"open\"}");
  
  Serial.println("[GATE] Gate is now OPEN");
  Serial.println("[GATE] Will close in " + String(GATE_OPEN_DURATION / 1000) + " seconds");
}

// ==================== CLOSE GATE ====================
void closeGate() {
  Serial.println("[GATE] Closing gate...");
  currentState = CLOSING;
  
  gateServo.write(SERVO_CLOSED_POSITION);
  
  Serial.println("[SERVO] Moved to closed position (" + String(SERVO_CLOSED_POSITION) + "°)");
  
  currentState = IDLE;
  
  // Publish status
  mqttClient.publish("portones/gate/status", "{\"status\":\"closed\"}");
  
  Serial.println("[GATE] Gate is now CLOSED");
  Serial.println("[GATE] Ready for next command\n");
}

// ==================== UPDATE GATE STATE (Non-blocking) ====================
void updateGateState() {
  if (currentState == OPEN) {
    unsigned long currentTime = millis();
    
    // Check if it's time to close the gate
    if (currentTime - gateOpenTime >= GATE_OPEN_DURATION) {
      closeGate();
    }
  }
}
