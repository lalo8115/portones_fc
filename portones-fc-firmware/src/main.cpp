#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

// ==================== CONFIGURACIÓN DE PINES ====================
const int NUM_GATES = 4;
const int SERVO_PINS[NUM_GATES] = {13, 12, 14, 27}; // Pines para Portón 1, 2, 3, 4

// ==================== WIFI & MQTT ====================
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
const char* MQTT_BROKER = "9c1124975c2646a1956d1f7c409b5ec7.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char* MQTT_TOPIC = "portones/gate/command";

// ==================== OBJETOS Y ESTADOS ====================
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
Servo gateServos[NUM_GATES];

enum GateState { IDLE, OPEN };
GateState states[NUM_GATES] = {IDLE, IDLE, IDLE, IDLE};
unsigned long openTimers[NUM_GATES] = {0, 0, 0, 0};

const unsigned long GATE_OPEN_DURATION = 5000;
const int POS_CLOSED = 0;
const int POS_OPEN = 90;

// Prototipos
void setupWiFi();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void processCommand(int gateId, const char* action);
void updateGates();
void publishStatus(int gateId, const char* status);
String getTimestamp();

// Función helper para timestamps
String getTimestamp() {
  unsigned long ms = millis();
  unsigned long secs = ms / 1000;
  unsigned long mins = secs / 60;
  unsigned long hours = mins / 60;
  ms = ms % 1000;
  secs = secs % 60;
  mins = mins % 60;
  
  char timestamp[16];
  snprintf(timestamp, sizeof(timestamp), "%02lu:%02lu:%02lu.%03lu", hours, mins, secs, ms);
  return String(timestamp);
}

void setup() {
  Serial.begin(115200);
  
  // Inicializar los 4 servos
  for(int i = 0; i < NUM_GATES; i++) {
    gateServos[i].attach(SERVO_PINS[i]);
    gateServos[i].write(POS_CLOSED);
    Serial.printf("[%s] [SERVO %d] Inicializado en pin %d\n", getTimestamp().c_str(), i + 1, SERVO_PINS[i]);
  }

  setupWiFi();
  espClient.setInsecure();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (!mqttClient.connected()) {
    Serial.printf("[%s] [MQTT] ✗ Desconectado del broker\n", getTimestamp().c_str());
    reconnectMQTT();
  }
  mqttClient.loop();
  updateGates();
  delay(10);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  // Esperamos JSON: {"gateId": 1-4, "action": "OPEN"}
  int gateId = doc["gateId"]; 
  const char* action = doc["action"];

  if (action && gateId >= 1 && gateId <= NUM_GATES) {
    processCommand(gateId, action);
  }
}

void processCommand(int gateId, const char* action) {
  int idx = gateId - 1; // convertimos a índice 0-based
  if (idx < 0 || idx >= NUM_GATES) return;

  if (strcmp(action, "OPEN") == 0 && states[idx] == IDLE) {
    Serial.printf("[%s] [GATE %d] Abriendo...\n", getTimestamp().c_str(), gateId);
    gateServos[idx].write(POS_OPEN);
    states[idx] = OPEN;
    openTimers[idx] = millis();
    publishStatus(gateId, "OPEN");
  }
}

void updateGates() {
  for (int i = 0; i < NUM_GATES; i++) {
    if (states[i] == OPEN && (millis() - openTimers[i] >= GATE_OPEN_DURATION)) {
      int gateId = i + 1;
      Serial.printf("[%s] [GATE %d] Cerrando automáticamente...\n", getTimestamp().c_str(), gateId);
      gateServos[i].write(POS_CLOSED);
      states[i] = IDLE;
      publishStatus(gateId, "CLOSED");
    }
  }
}

void publishStatus(int gateId, const char* status) {
  char statusMsg[80];
  snprintf(statusMsg, sizeof(statusMsg), "{\"gateId\": %d, \"status\": \"%s\"}", gateId, status);
  mqttClient.publish("portones/gate/status", statusMsg);
}

void setupWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\n[%s] [WiFi] Conectado\n", getTimestamp().c_str());
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.printf("[%s] [MQTT] Intentando conectar...\n", getTimestamp().c_str());
    if (mqttClient.connect("ESP32_Gate_Multi", "pedropapas", "Pedro9090")) {
      Serial.printf("[%s] [MQTT] ✓ Conectado al broker\n", getTimestamp().c_str());
      mqttClient.subscribe(MQTT_TOPIC);
      Serial.printf("[%s] [MQTT] Suscrito al topic: %s\n", getTimestamp().c_str(), MQTT_TOPIC);
    } else {
      Serial.printf("[%s] [MQTT] ✗ Error de conexión (código: %d)\n", getTimestamp().c_str(), mqttClient.state());
      delay(5000);
    }
  }
}