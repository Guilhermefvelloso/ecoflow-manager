# 🌞 EcoFlow Manager

Plataforma de monitoramento de energia solar — EcoTech Solutions

---

## Estrutura do projeto

```
ecoflow-manager/
├── backend/
│   ├── server.js        ← Servidor Node.js (API + WebSocket)
│   └── package.json
├── frontend/
│   └── index.html      ← Dashboard web (abre direto no navegador)
└── firmware/
    └── ecoflow_esp32.ino ← Código para o ESP32 (Arduino IDE)
```

---

## ▶️ Como rodar (passo a passo)

### 1. Backend (servidor)

Você precisa ter o **Node.js** instalado.
Baixe em: https://nodejs.org

```bash
# Entre na pasta do backend
cd backend

# Instale as dependências (só na primeira vez)
npm install

# Rode o servidor
npm start
```

O terminal vai mostrar:
```
✅ EcoFlow Manager backend rodando em http://localhost:3001
   Simulação automática: ATIVA
```

### 2. Frontend (dashboard)

Abra o arquivo `frontend/index.html` direto no navegador.
Ou use a extensão **Live Server** no VSCode:
- Clique com botão direito no `index.html`
- Selecione "Open with Live Server"

O dashboard vai conectar automaticamente ao backend e mostrar os dados em tempo real.

---

## 🔌 Configurar o ESP32 (quando tiver o hardware)

### Materiais necessários
- 1x ESP32 (qualquer modelo)
- 1x Sensor de corrente ACS712 (5A, 20A ou 30A)
- Resistores para divisor de tensão: R1=47kΩ, R2=3.3kΩ
- Sensor de temperatura NTC 10kΩ (opcional)

### Conexões
| Componente       | Pino ESP32 |
|-----------------|------------|
| ACS712 (saída)  | GPIO 34    |
| Divisor tensão  | GPIO 35    |
| NTC temperatura | GPIO 32    |

### Configurar Arduino IDE
1. Instale o suporte ao ESP32:
   - File > Preferences > Additional Boards Manager URLs:
   - Cole: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools > Board > Boards Manager > busque "esp32" > Install

2. Instale a biblioteca ArduinoJson:
   - Sketch > Include Library > Manage Libraries
   - Busque "ArduinoJson" > Install (versão 6.x)

3. Abra o arquivo `firmware/ecoflow_esp32.ino`

4. Edite as linhas:
```cpp
const char* SSID        = "SEU_WIFI_AQUI";
const char* PASSWORD    = "SUA_SENHA_AQUI";
const char* BACKEND_URL = "http://192.168.1.100:3001/api/dados";
```
> Para descobrir o IP do seu computador:
> - Windows: abra o CMD e rode `ipconfig`
> - Linux/Mac: rode `ifconfig`

5. Selecione a placa: Tools > Board > ESP32 Dev Module
6. Clique em Upload (→)

---

## 🧪 Testar sem hardware (simulação)

O backend já simula dados automaticamente!
Basta rodar o servidor e abrir o dashboard — os dados serão gerados automaticamente seguindo um perfil solar realista.

Para testar o envio manual, use o terminal:
```bash
curl -X POST http://localhost:3001/api/dados \
  -H "Content-Type: application/json" \
  -d '{"tensao": 220.5, "corrente": 10.8, "potencia": 2381, "temperatura": 42.3}'
```

---

## 🛠️ Tecnologias utilizadas

| Camada    | Tecnologia                        |
|-----------|-----------------------------------|
| Frontend  | HTML5, CSS3, JavaScript, Chart.js |
| Backend   | Node.js, Express, Socket.io       |
| Firmware  | C++ (Arduino), ESP32              |
| Protocolo | REST API + WebSocket (tempo real) |

---

Projeto desenvolvido por **EcoTech Solutions** — Práticas Extensionistas V
