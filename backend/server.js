const express = require("express");
const cors    = require("cors");
const http    = require("http");
const https   = require("https");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ─── Coordenadas (Paracambi, RJ) ─────────────────────────────────────────────
const LAT    = -22.6078;
const LON    = -43.7094;
const CIDADE = "Paracambi";

// ─── Estado global ────────────────────────────────────────────────────────────
let solarData = {
  tensao: 220.0, corrente: 10.6, potencia: 2340,
  energia_hoje: 11.2, energia_mes: 312,
  eficiencia: 84, temperatura_painel: 38.5,
  custo_kwh: 0.95,          // R$/kWh (tarifa média Brasil)
  potencia_instalada: 2800, // W pico
  investimento: 15000,      // R$ (custo da instalação)
  clima: { temperatura: 28, descricao: "Céu limpo", icone: "01d", umidade: 65, vento: 12, nebulosidade: 10, cidade: CIDADE, fator_geracao: 1.0 },
  previsao: [],             // próximos 3 dias
  paineis: [
    { id:"P1", potencia:390, eficiencia:92, status:"ok" },
    { id:"P2", potencia:375, eficiencia:89, status:"ok" },
    { id:"P3", potencia:298, eficiencia:71, status:"alerta" },
    { id:"P4", potencia:400, eficiencia:95, status:"ok" },
    { id:"P5", potencia:370, eficiencia:88, status:"ok" },
    { id:"P6", potencia:383, eficiencia:91, status:"ok" },
  ],
  alertas: [],
  historico_alertas: [],    // últimas 20 ocorrências
  historico_hoje: [],
  heatmap: [],              // 7 dias × 24h
  timestamp: new Date().toISOString(),
};

// ─── WMO weather codes ────────────────────────────────────────────────────────
function wmoDescricao(code, nuvens) {
  if (code === 0)   return { descricao:"Céu limpo",          icone:"01d" };
  if (code <= 2)    return { descricao:"Parcialmente nublado",icone:"02d" };
  if (code === 3)   return { descricao:"Nublado",             icone:"04d" };
  if (code <= 49)   return { descricao:"Névoa",               icone:"50d" };
  if (code <= 59)   return { descricao:"Garoa",               icone:"09d" };
  if (code <= 69)   return { descricao:"Chuva",               icone:"10d" };
  if (code <= 79)   return { descricao:"Neve",                icone:"13d" };
  if (code <= 84)   return { descricao:"Pancadas de chuva",   icone:"09d" };
  if (code <= 99)   return { descricao:"Tempestade",          icone:"11d" };
  return { descricao: nuvens > 50 ? "Nublado" : "Parcialmente nublado", icone:"03d" };
}

function fatorDeNuvens(n) {
  if (n > 80) return 0.25;
  if (n > 60) return 0.50;
  if (n > 40) return 0.70;
  if (n > 20) return 0.85;
  return 1.0;
}

// ─── Busca clima + previsão (Open-Meteo, sem key) ─────────────────────────────
function buscarClima() {
  return new Promise((resolve) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
      + `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,weather_code`
      + `&daily=temperature_2m_max,temperature_2m_min,weather_code,cloud_cover_mean,precipitation_sum`
      + `&timezone=America/Sao_Paulo&forecast_days=4`;

    https.get(url, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const j  = JSON.parse(raw);
          const c  = j.current;
          const d  = j.daily;
          const nv = c.cloud_cover || 0;
          const { descricao, icone } = wmoDescricao(c.weather_code, nv);

          solarData.clima = {
            temperatura:   Math.round(c.temperature_2m),
            descricao, icone,
            umidade:       c.relative_humidity_2m,
            vento:         Math.round(c.wind_speed_10m),
            nebulosidade:  nv,
            cidade:        CIDADE,
            fator_geracao: fatorDeNuvens(nv),
          };

          // Próximos 3 dias (índices 1,2,3)
          solarData.previsao = [1,2,3].map(i => {
            const nuvDia = d.cloud_cover_mean[i] || 0;
            const fator  = fatorDeNuvens(nuvDia);
            const { descricao: desc, icone: ico } = wmoDescricao(d.weather_code[i], nuvDia);
            const dias = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
            const dt   = new Date(); dt.setDate(dt.getDate() + i);
            return {
              dia:          dias[dt.getDay()],
              data:         dt.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }),
              temp_max:     Math.round(d.temperature_2m_max[i]),
              temp_min:     Math.round(d.temperature_2m_min[i]),
              descricao:    desc,
              icone:        ico,
              nebulosidade: Math.round(nuvDia),
              fator_geracao:fator,
              geracao_est:  parseFloat((14 * fator).toFixed(1)),
              chuva:        parseFloat((d.precipitation_sum[i] || 0).toFixed(1)),
            };
          });

          gerarAlertas();
          console.log(`[Clima] ${solarData.clima.descricao} ${solarData.clima.temperatura}°C nuvens=${nv}%`);
          resolve();
        } catch(e) {
          console.error("[Clima] Erro:", e.message);
          resolve();
        }
      });
    }).on("error", e => { console.error("[Clima] Req error:", e.message); resolve(); });
  });
}

// ─── Gera alertas e registra histórico ───────────────────────────────────────
function gerarAlertas() {
  const agora = new Date();
  const hora  = agora.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
  const alertas = [];

  if (solarData.clima.nebulosidade > 60)
    alertas.push({ tipo:"warn", msg:`Alta nebulosidade (${solarData.clima.nebulosidade}%) — geração em ${Math.round(solarData.clima.fator_geracao*100)}%`, hora:`Hoje, ${hora}` });

  if (solarData.clima.nebulosidade <= 20)
    alertas.push({ tipo:"ok", msg:`Céu limpo em ${CIDADE} — condições ideais de geração`, hora:`Hoje, ${hora}` });

  solarData.paineis.forEach(p => {
    if (p.status === "alerta")
      alertas.push({ tipo:"warn", msg:`${p.id} com eficiência ${p.eficiencia}% — verifique sujeira ou falha`, hora:`Hoje, ${hora}` });
  });

  if (solarData.temperatura_painel > 60)
    alertas.push({ tipo:"warn", msg:`Temperatura dos painéis em ${solarData.temperatura_painel}°C — acima do ideal`, hora:`Hoje, ${hora}` });

  if (solarData.potencia < 200 && new Date().getHours() >= 9 && new Date().getHours() <= 16)
    alertas.push({ tipo:"erro", msg:`Potência muito baixa (${solarData.potencia}W) durante horário de pico`, hora:`Hoje, ${hora}` });

  if (alertas.length === 0)
    alertas.push({ tipo:"ok", msg:"Todos os sistemas operando normalmente", hora:`Hoje, ${hora}` });

  // Registra novos alertas no histórico (máx 20)
  alertas.forEach(a => {
    const ultimo = solarData.historico_alertas[0];
    if (!ultimo || ultimo.msg !== a.msg) {
      solarData.historico_alertas.unshift({ ...a, timestamp: agora.toISOString() });
      if (solarData.historico_alertas.length > 20)
        solarData.historico_alertas.pop();
    }
  });

  solarData.alertas = alertas;
}

// ─── Heatmap 7 dias × 24h ────────────────────────────────────────────────────
function gerarHeatmap() {
  const dias = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const hoje = new Date();
  const mapa = [];
  for (let d = 6; d >= 0; d--) {
    const dt   = new Date(hoje); dt.setDate(hoje.getDate() - d);
    const row  = { dia: dias[dt.getDay()], horas: [] };
    const fRnd = 0.7 + Math.random() * 0.3;
    for (let h = 0; h < 24; h++) {
      const curva = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
      row.horas.push(parseFloat((curva * 2.6 * fRnd).toFixed(2)));
    }
    mapa.push(row);
  }
  solarData.heatmap = mapa;
}

// ─── Histórico do dia ─────────────────────────────────────────────────────────
function gerarHistorico() {
  const agora = new Date();
  const hist  = [];
  const fator = solarData.clima.fator_geracao;
  for (let h = 6; h <= agora.getHours(); h++) {
    const curva = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    hist.push({
      hora:     `${h}:00`,
      real:     parseFloat((curva * 2.6 * fator + Math.random() * 0.15 - 0.07).toFixed(2)),
      estimado: parseFloat((curva * 2.7).toFixed(2)),
    });
  }
  solarData.historico_hoje = hist;
}

// ─── Simulação ────────────────────────────────────────────────────────────────
setInterval(() => {
  const agora = new Date();
  const h     = agora.getHours() + agora.getMinutes() / 60;
  const curva = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
  const fator = solarData.clima.fator_geracao;

  solarData.potencia           = Math.max(0, parseFloat((curva * 2600 * fator + Math.random()*150-75).toFixed(0)));
  solarData.tensao             = parseFloat((218 + Math.random()*6).toFixed(1));
  solarData.corrente           = solarData.tensao > 0 ? parseFloat((solarData.potencia / solarData.tensao).toFixed(2)) : 0;
  solarData.eficiencia         = Math.min(100, Math.round((solarData.potencia / solarData.potencia_instalada) * 100));
  solarData.temperatura_painel = parseFloat((30 + curva * 20 * fator + Math.random()*3).toFixed(1));
  solarData.timestamp          = agora.toISOString();

  gerarAlertas();
  io.emit("atualizacao", solarData);
}, 3000);

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.post("/api/dados", (req, res) => {
  const { tensao, corrente, potencia, temperatura } = req.body;
  if (tensao      !== undefined) solarData.tensao             = parseFloat(tensao);
  if (corrente    !== undefined) solarData.corrente           = parseFloat(corrente);
  if (potencia    !== undefined) solarData.potencia           = parseFloat(potencia);
  if (temperatura !== undefined) solarData.temperatura_painel = parseFloat(temperatura);
  solarData.eficiencia = Math.min(100, Math.round((solarData.potencia / solarData.potencia_instalada)*100));
  solarData.timestamp  = new Date().toISOString();
  gerarAlertas();
  io.emit("atualizacao", solarData);
  res.json({ status:"ok" });
});

app.get("/api/dados",            (req, res) => res.json(solarData));
app.get("/api/clima",            (req, res) => res.json(solarData.clima));
app.get("/api/previsao",         (req, res) => res.json(solarData.previsao));
app.get("/api/historico",        (req, res) => res.json(solarData.historico_hoje));
app.get("/api/alertas",          (req, res) => res.json(solarData.alertas));
app.get("/api/historico-alertas",(req, res) => res.json(solarData.historico_alertas));
app.get("/api/heatmap",          (req, res) => res.json(solarData.heatmap));

// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on("connection", socket => {
  console.log("Dashboard conectado:", socket.id);
  socket.emit("atualizacao", solarData);
  socket.on("disconnect", () => console.log("Desconectado:", socket.id));
});

// ─── Init ─────────────────────────────────────────────────────────────────────
const PORT = 3001;
server.listen(PORT, async () => {
  console.log(`\n✅ EcoFlow Manager v3 rodando em http://localhost:${PORT}`);
  await buscarClima();
  gerarHistorico();
  gerarHeatmap();
  gerarAlertas();
  console.log("✅ Dados iniciais carregados\n");
});

setInterval(buscarClima,    10 * 60 * 1000);
setInterval(gerarHistorico, 60 * 60 * 1000);
setInterval(gerarHeatmap,   60 * 60 * 1000);
