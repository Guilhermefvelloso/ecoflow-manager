const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ─── Estado atual do sistema ────────────────────────────────────────────────
let solarData = {
  tensao: 220.0,       // V
  corrente: 10.6,      // A
  potencia: 2340,      // W
  energia_hoje: 11.2,  // kWh
  energia_mes: 312,    // kWh
  eficiencia: 84,      // %
  temperatura: 38.5,   // °C (temperatura do painel)
  paineis: [
    { id: "P1", potencia: 390, eficiencia: 92, status: "ok" },
    { id: "P2", potencia: 375, eficiencia: 89, status: "ok" },
    { id: "P3", potencia: 298, eficiencia: 71, status: "alerta" },
    { id: "P4", potencia: 400, eficiencia: 95, status: "ok" },
    { id: "P5", potencia: 370, eficiencia: 88, status: "ok" },
    { id: "P6", potencia: 383, eficiencia: 91, status: "ok" },
  ],
  historico_hoje: [], // preenchido abaixo
  timestamp: new Date().toISOString(),
};

// Gera histórico simulado das 6h até agora
function gerarHistorico() {
  const agora = new Date();
  const historico = [];
  for (let h = 6; h <= agora.getHours(); h++) {
    const fator = Math.sin(((h - 6) / 12) * Math.PI);
    historico.push({
      hora: `${h}:00`,
      real: parseFloat((fator * 2.6 + Math.random() * 0.2 - 0.1).toFixed(2)),
      estimado: parseFloat((fator * 2.7).toFixed(2)),
    });
  }
  return historico;
}
solarData.historico_hoje = gerarHistorico();

// ─── Rota: receber dados do ESP32 ────────────────────────────────────────────
app.post("/api/dados", (req, res) => {
  const { tensao, corrente, potencia, temperatura } = req.body;

  if (tensao !== undefined) solarData.tensao = parseFloat(tensao);
  if (corrente !== undefined) solarData.corrente = parseFloat(corrente);
  if (potencia !== undefined) solarData.potencia = parseFloat(potencia);
  if (temperatura !== undefined) solarData.temperatura = parseFloat(temperatura);

  solarData.eficiencia = Math.min(100, Math.round((solarData.potencia / 2800) * 100));
  solarData.timestamp = new Date().toISOString();

  // Emite para todos os clientes conectados via WebSocket
  io.emit("atualizacao", solarData);

  console.log(`[${solarData.timestamp}] P=${solarData.potencia}W V=${solarData.tensao}V I=${solarData.corrente}A`);
  res.json({ status: "ok", recebido: solarData });
});

// ─── Rota: retorna estado atual ───────────────────────────────────────────────
app.get("/api/dados", (req, res) => {
  res.json(solarData);
});

// ─── Rota: histórico ──────────────────────────────────────────────────────────
app.get("/api/historico", (req, res) => {
  res.json(solarData.historico_hoje);
});

// ─── Simulação automática (quando não tem hardware) ──────────────────────────
let simAtiva = true;
setInterval(() => {
  if (!simAtiva) return;

  const agora = new Date();
  const h = agora.getHours() + agora.getMinutes() / 60;
  const fator = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));

  solarData.potencia = parseFloat((fator * 2600 + Math.random() * 200 - 100).toFixed(0));
  solarData.tensao = parseFloat((218 + Math.random() * 6).toFixed(1));
  solarData.corrente = parseFloat((solarData.potencia / solarData.tensao).toFixed(2));
  solarData.eficiencia = Math.min(100, Math.round((solarData.potencia / 2800) * 100));
  solarData.temperatura = parseFloat((35 + fator * 10 + Math.random() * 3).toFixed(1));
  solarData.timestamp = agora.toISOString();

  io.emit("atualizacao", solarData);
}, 3000);

// Desativa simulação quando ESP32 envia dados reais
app.post("/api/dados", (req, res) => {
  simAtiva = false;
});

// ─── WebSocket connection ────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Dashboard conectado:", socket.id);
  socket.emit("atualizacao", solarData); // envia estado atual imediatamente
  socket.on("disconnect", () => console.log("Dashboard desconectado:", socket.id));
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n✅ EcoFlow Manager backend rodando em http://localhost:${PORT}`);
  console.log(`   POST /api/dados  → recebe dados do ESP32`);
  console.log(`   GET  /api/dados  → retorna estado atual`);
  console.log(`   Simulação automática: ATIVA (desativa quando ESP32 conectar)\n`);
});
