/*
 * EcoFlow Manager — Firmware ESP32
 * ─────────────────────────────────────────────────────
 * Hardware necessário:
 *   - ESP32 (qualquer modelo com WiFi)
 *   - Sensor de corrente ACS712 (5A, 20A ou 30A) — pino 34
 *   - Divisor de tensão resistivo (para medir tensão DC) — pino 35
 *   - Sensor de temperatura NTC 10kΩ (opcional) — pino 32
 *
 * Bibliotecas necessárias (instalar pelo Library Manager do Arduino IDE):
 *   - ArduinoJson  (versão 6.x)
 *   - HTTPClient   (já inclusa no ESP32 core)
 *   - WiFi         (já inclusa no ESP32 core)
 *
 * Como instalar o ESP32 no Arduino IDE:
 *   File > Preferences > Additional Boards:
 *   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
 * ─────────────────────────────────────────────────────
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── Configurações WiFi ────────────────────────────────
const char* SSID     = "SEU_WIFI_AQUI";
const char* PASSWORD = "SUA_SENHA_AQUI";

// ── URL do backend (IP do computador na rede local) ───
// Descubra seu IP: no terminal Windows rode `ipconfig`, no Linux/Mac `ifconfig`
const char* BACKEND_URL = "http://192.168.1.100:3001/api/dados";

// ── Pinos dos sensores ────────────────────────────────
#define PINO_CORRENTE   34    // ACS712 — saída analógica
#define PINO_TENSAO     35    // Divisor de tensão
#define PINO_TEMP       32    // NTC 10kΩ (opcional)

// ── Configuração do ACS712 ────────────────────────────
// ACS712-5A:  sensibilidade = 185 mV/A
// ACS712-20A: sensibilidade = 100 mV/A
// ACS712-30A: sensibilidade = 66 mV/A
#define ACS712_SENSIBILIDADE  100.0   // mV/A — ajuste para o seu modelo
#define ACS712_OFFSET         2500.0  // mV — tensão de offset (normalmente 2500mV = 0A)

// ── Divisor de tensão ─────────────────────────────────
// Exemplo: R1 = 47kΩ, R2 = 3.3kΩ para medir até ~50V
// Fator = (R1 + R2) / R2
#define DIVISOR_FATOR   15.24   // Ajuste conforme seus resistores

// ── Intervalo de envio (ms) ───────────────────────────
#define INTERVALO_MS    3000

// ── Variáveis globais ─────────────────────────────────
unsigned long ultimoEnvio = 0;
float tensaoMedia   = 0;
float correnteMedia = 0;
int   numAmostras   = 50;   // amostras para média

// ─────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Serial.println("\n🌞 EcoFlow Manager — ESP32 iniciando...");

  // Configura pinos ADC
  analogReadResolution(12);      // 0-4095
  analogSetAttenuation(ADC_11db); // 0-3.6V

  // Conecta WiFi
  WiFi.begin(SSID, PASSWORD);
  Serial.print("Conectando ao WiFi");
  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi conectado!");
    Serial.print("   IP do ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Falha no WiFi — operando offline");
  }
}

// ─────────────────────────────────────────────────────
void loop() {
  // Lê sensores com média de múltiplas amostras (reduz ruído)
  float somaTensao   = 0;
  float somaCorrente = 0;

  for (int i = 0; i < numAmostras; i++) {
    // Leitura de tensão (pino 35)
    int adcTensao = analogRead(PINO_TENSAO);
    float vADC_tensao = (adcTensao / 4095.0) * 3.6;   // converte para volts
    somaTensao += vADC_tensao * DIVISOR_FATOR;

    // Leitura de corrente — ACS712 (pino 34)
    int adcCorrente = analogRead(PINO_CORRENTE);
    float vADC_corrente = (adcCorrente / 4095.0) * 3600.0;  // converte para mV
    float corrente = (vADC_corrente - ACS712_OFFSET) / ACS712_SENSIBILIDADE;
    somaCorrente += abs(corrente);   // valor absoluto (corrente positiva)

    delayMicroseconds(200);
  }

  tensaoMedia   = somaTensao   / numAmostras;
  correnteMedia = somaCorrente / numAmostras;

  // Filtra leituras muito baixas (ruído do ADC)
  if (tensaoMedia < 1.0)   tensaoMedia   = 0;
  if (correnteMedia < 0.1) correnteMedia = 0;

  float potencia = tensaoMedia * correnteMedia;

  // Leitura de temperatura (NTC 10kΩ)
  float temperatura = lerTemperatura();

  // Exibe no monitor serial
  Serial.printf("V=%.1fV  I=%.2fA  P=%.0fW  T=%.1f°C\n",
                 tensaoMedia, correnteMedia, potencia, temperatura);

  // Envia para o backend a cada INTERVALO_MS
  if (millis() - ultimoEnvio >= INTERVALO_MS) {
    ultimoEnvio = millis();
    enviarDados(tensaoMedia, correnteMedia, potencia, temperatura);
  }
}

// ─────────────────────────────────────────────────────
void enviarDados(float tensao, float corrente, float potencia, float temperatura) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi desconectado — tentando reconectar...");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");

  // Monta JSON
  StaticJsonDocument<200> doc;
  doc["tensao"]      = round(tensao * 10) / 10.0;
  doc["corrente"]    = round(corrente * 100) / 100.0;
  doc["potencia"]    = round(potencia);
  doc["temperatura"] = round(temperatura * 10) / 10.0;

  String jsonStr;
  serializeJson(doc, jsonStr);

  int httpCode = http.POST(jsonStr);

  if (httpCode == 200) {
    Serial.println("✅ Dados enviados ao backend");
  } else {
    Serial.printf("❌ Erro HTTP: %d\n", httpCode);
  }

  http.end();
}

// ─────────────────────────────────────────────────────
// Leitura de temperatura com NTC 10kΩ (equação Steinhart-Hart)
float lerTemperatura() {
  int adc = analogRead(PINO_TEMP);
  if (adc == 0) return 0;

  float R_NTC = 10000.0 * ((4095.0 / adc) - 1.0);  // resistência do NTC
  float tempK = 1.0 / (
    (1.0 / 298.15) +
    (1.0 / 3950.0) * log(R_NTC / 10000.0)
  );

  return tempK - 273.15;   // Kelvin → Celsius
}
