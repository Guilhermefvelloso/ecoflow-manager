// ── Config ────────────────────────────────────────────────────────────────────
const socket = io("https://ecoflow-manager.onrender.com");

// ── Tema claro/escuro ─────────────────────────────────────────────────────────
const temaBtn = document.getElementById("theme-toggle");
let temaAtual = localStorage.getItem("tema") || "dark";
document.documentElement.setAttribute("data-theme", temaAtual);
temaBtn.textContent = temaAtual === "dark" ? "☀️" : "🌙";

temaBtn.addEventListener("click", () => {
  temaAtual = temaAtual === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", temaAtual);
  localStorage.setItem("tema", temaAtual);
  temaBtn.textContent = temaAtual === "dark" ? "☀️" : "🌙";
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const socket    = io(BACKEND);
const statusTxt = document.getElementById("status-txt");

socket.on("connect",     () => { statusTxt.textContent = "Sistema online"; statusTxt.style.color = "var(--verde)"; });
socket.on("disconnect",  () => { statusTxt.textContent = "Desconectado";   statusTxt.style.color = "var(--red)"; });
socket.on("atualizacao", (d)  => atualizarDashboard(d));

// ── Ícones de clima ───────────────────────────────────────────────────────────
const climaIcones = { "01d":"☀️","01n":"🌙","02d":"⛅","02n":"⛅","03d":"☁️","03n":"☁️","04d":"☁️","04n":"☁️","09d":"🌧️","09n":"🌧️","10d":"🌦️","10n":"🌦️","11d":"⛈️","11n":"⛈️","13d":"❄️","13n":"❄️","50d":"🌫️","50n":"🌫️" };

// ── Animação de contador ──────────────────────────────────────────────────────
function animarNumero(el, destino, casas = 0, prefixo = "", sufixo = "") {
  const atual  = parseFloat(el.dataset.valor || 0);
  const dur    = 600;
  const inicio = performance.now();
  function step(now) {
    const t   = Math.min((now - inicio) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const val  = atual + (destino - atual) * ease;
    el.textContent = prefixo + val.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + sufixo;
    if (t < 1) requestAnimationFrame(step);
    else el.dataset.valor = destino;
  }
  requestAnimationFrame(step);
}

// ── Clima ─────────────────────────────────────────────────────────────────────
function atualizarClima(c) {
  if (!c) return;
  document.getElementById("clima-icon").textContent  = climaIcones[c.icone] || "🌤️";
  document.getElementById("clima-temp").textContent  = `${c.temperatura}°C`;
  document.getElementById("clima-desc").textContent  = c.descricao;
  document.getElementById("clima-umidade").textContent = `💧 ${c.umidade}%`;
  document.getElementById("clima-vento").textContent   = `🌬️ ${c.vento} km/h`;
  document.getElementById("clima-nuvens").textContent  = `☁️ ${c.nebulosidade}%`;

  const pct   = Math.round(c.fator_geracao * 100);
  const badge = document.getElementById("fator-badge");
  badge.textContent = `⚡ ${pct}% geração`;
  badge.className   = "fator-badge " + (pct >= 80 ? "fator-alto" : pct >= 50 ? "fator-medio" : "fator-baixo");

  document.getElementById("clima-bar-fill").style.width      = pct + "%";
  document.getElementById("clima-bar-fill").style.background = pct >= 80 ? "var(--verde)" : pct >= 50 ? "var(--amber)" : "var(--red)";
  document.getElementById("clima-bar-pct").textContent       = `Fator solar: ${pct}%`;
}

// ── Previsão 3 dias ───────────────────────────────────────────────────────────
function atualizarPrevisao(prev) {
  if (!prev || !prev.length) return;
  const grid = document.getElementById("forecast-grid");
  grid.innerHTML = prev.map(d => {
    const icone = climaIcones[d.icone] || "🌤️";
    const cor   = d.fator_geracao >= 0.8 ? "var(--verde)" : d.fator_geracao >= 0.5 ? "var(--amber)" : "var(--red)";
    const pct   = Math.round(d.fator_geracao * 100);
    return `
      <div class="forecast-card">
        <div class="fc-dia">${d.dia}</div>
        <div class="fc-data">${d.data}</div>
        <div class="fc-icon">${icone}</div>
        <div class="fc-desc">${d.descricao}</div>
        <div class="fc-temp"><span class="max">${d.temp_max}°</span> / <span class="min">${d.temp_min}°</span></div>
        ${d.chuva > 0 ? `<div style="font-size:10px;color:var(--blue);margin-top:4px">🌧 ${d.chuva}mm</div>` : ""}
        <div class="fc-ger" style="color:${cor}">${d.geracao_est} kWh est.</div>
        <div class="fc-bar"><div class="fc-bar-fill" style="width:${pct}%;background:${cor}"></div></div>
      </div>`;
  }).join("");
}

// ── ROI ───────────────────────────────────────────────────────────────────────
function atualizarROI(d) {
  const economia_mes   = d.energia_mes * d.custo_kwh;
  const economia_ano   = economia_mes * 12;
  const anos_retorno   = d.investimento / economia_ano;
  const meses_retorno  = Math.round(anos_retorno * 12);
  const pct_recuperado = Math.min(100, Math.round((economia_ano / d.investimento) * 100 * 3)); // estimando 3 anos de uso

  document.getElementById("roi-economia-mes").textContent  = `R$ ${economia_mes.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  document.getElementById("roi-economia-ano").textContent  = `R$ ${economia_ano.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  document.getElementById("roi-retorno").textContent       = `${meses_retorno} meses`;
  document.getElementById("roi-investimento").textContent  = `R$ ${d.investimento.toLocaleString("pt-BR")}`;
  document.getElementById("roi-bar-fill").style.width      = pct_recuperado + "%";
  document.getElementById("roi-pct-label").textContent     = `${pct_recuperado}% recuperado (estimado)`;
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function renderHeatmap(dados) {
  if (!dados || !dados.length) return;
  const wrap  = document.getElementById("heatmap-wrap");
  const horas = [6,7,8,9,10,11,12,13,14,15,16,17,18];
  const max   = 2.6;

  function cor(v) {
    if (v <= 0)  return "var(--bg3)";
    const t = Math.min(v / max, 1);
    const r = Math.round(0   + t * 0);
    const g = Math.round(80  + t * 128);
    const b = Math.round(50  + t * 82);
    return `rgba(${r},${g+50},${b},${0.2 + t * 0.8})`;
  }

  let html = `<div class="heatmap-wrap"><table class="heatmap-table"><thead><tr><th></th>`;
  horas.forEach(h => html += `<th>${h}h</th>`);
  html += `</tr></thead><tbody>`;

  dados.forEach(row => {
    html += `<tr><td class="hm-day">${row.dia}</td>`;
    horas.forEach(h => {
      const v = row.horas[h] || 0;
      html += `<td style="background:${cor(v)}" title="${h}h: ${v.toFixed(2)} kW"></td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  wrap.innerHTML = html;
}

// ── Histórico de alertas ──────────────────────────────────────────────────────
function atualizarHistoricoAlertas(hist) {
  if (!hist || !hist.length) return;
  document.getElementById("hist-list").innerHTML = hist.map(a => `
    <div class="hist-item">
      <div class="alert-dot ${a.tipo}"></div>
      <div>
        <div class="hist-msg">${a.msg}</div>
        <div class="hist-time">${a.hora}</div>
      </div>
    </div>
  `).join("");
}

// ── Dashboard principal ───────────────────────────────────────────────────────
function atualizarDashboard(d) {
  // Métricas com animação
  animarNumero(document.getElementById("m-pot"), d.potencia, 0);
  animarNumero(document.getElementById("m-gen"), d.energia_hoje, 1);
  animarNumero(document.getElementById("m-mes"), d.energia_mes, 0);
  animarNumero(document.getElementById("m-eco"), Math.round(d.energia_mes * d.custo_kwh), 2);
  animarNumero(document.getElementById("m-co2"), Math.round(d.energia_mes * 0.475), 0);
  animarNumero(document.getElementById("m-temp"), d.temperatura_painel, 1);

  // Barras de progresso
  const metaPot = d.potencia_instalada || 2800;
  document.getElementById("bar-pot").style.width  = Math.min(100, Math.round(d.potencia / metaPot * 100)) + "%";
  document.getElementById("bar-gen").style.width  = Math.min(100, Math.round(d.energia_hoje / 14 * 100)) + "%";
  document.getElementById("bar-eff").style.width  = d.eficiencia + "%";

  const pctGen = Math.round((d.energia_hoje / 14) * 100);
  const dGen   = document.getElementById("d-gen");
  dGen.textContent = `${pctGen}% da meta diária`;
  dGen.className   = "metric-delta " + (pctGen >= 80 ? "up" : pctGen < 50 ? "down" : "warn");

  document.getElementById("d-pot").textContent  = d.potencia > 2000 ? "↑ Boa geração" : d.potencia > 1000 ? "→ Geração parcial" : "↓ Geração baixa";
  document.getElementById("d-pot").className    = "metric-delta " + (d.potencia > 2000 ? "up" : d.potencia > 1000 ? "warn" : "down");
  document.getElementById("d-temp").textContent = d.temperatura_painel > 60 ? "⚠️ Acima do ideal" : d.temperatura_painel > 45 ? "→ Normal" : "↓ Temperatura baixa";

  document.getElementById("v-val").textContent   = d.tensao.toFixed(1) + " V";
  document.getElementById("i-val").textContent   = d.corrente.toFixed(2) + " A";
  document.getElementById("eff-pct").textContent = d.eficiencia + "%";

  // Cor do gauge por eficiência
  const corGauge = d.eficiencia >= 70 ? "var(--verde)" : d.eficiencia >= 40 ? "var(--amber)" : "var(--red)";
  document.getElementById("eff-pct").style.color = corGauge;

  if (d.clima)             atualizarClima(d.clima);
  if (d.previsao)          atualizarPrevisao(d.previsao);
  if (d.paineis)           atualizarPaineis(d.paineis);
  if (d.alertas)           atualizarAlertas(d.alertas);
  if (d.historico_alertas) atualizarHistoricoAlertas(d.historico_alertas);
  if (d.heatmap)           renderHeatmap(d.heatmap);
  atualizarROI(d);
  atualizarGauge(d.eficiencia);
}

// ── Gráfico de linha ──────────────────────────────────────────────────────────
const dadosHist = {
  hoje:   { labels:["6h","7h","8h","9h","10h","11h","12h","13h","14h","15h","16h","17h","18h"], real:[0,.1,.4,.9,1.6,2.2,2.5,2.6,2.4,2.0,1.5,.8,.2], estimado:[0,.1,.5,1.0,1.7,2.3,2.6,2.7,2.5,2.1,1.6,.9,.2] },
  semana: { labels:["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"], real:[10.2,11.8,9.5,12.1,11.2,13.0,8.7], estimado:[11,11.5,11,11,11,12.5,10] },
  mes:    { labels:Array.from({length:17},(_,i)=>`${i+1}`), real:[11,13,10,12,9,14,11,12,13,10,11,14,12,11,10,13,11], estimado:Array(17).fill(12) }
};

let genChart;
function buildChart(p) {
  const { labels, real, estimado } = dadosHist[p];
  if (genChart) genChart.destroy();
  genChart = new Chart(document.getElementById("genChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label:"Real", data:real, borderColor:"#00D084", backgroundColor:"rgba(0,208,132,0.08)", fill:true, tension:0.4, pointRadius:3, borderWidth:2 },
        { label:"Estimado", data:estimado, borderColor:"rgba(255,184,48,0.6)", backgroundColor:"transparent", borderDash:[5,4], tension:0.4, pointRadius:0, borderWidth:1.5 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:"#7A8FA0", font:{ size:10, family:"'JetBrains Mono'" } }, grid:{ color:"rgba(255,255,255,0.04)" } },
        y:{ ticks:{ color:"#7A8FA0", font:{ size:10, family:"'JetBrains Mono'" } }, grid:{ color:"rgba(255,255,255,0.04)" } }
      }
    }
  });
}
buildChart("hoje");

function setView(p, btn) {
  document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  buildChart(p);
}

// ── Gauge ─────────────────────────────────────────────────────────────────────
let gaugeChart;
function atualizarGauge(pct) {
  const cor = pct >= 70 ? "#00D084" : pct >= 40 ? "#FFB830" : "#FF5757";
  if (!gaugeChart) {
    gaugeChart = new Chart(document.getElementById("gaugeChart"), {
      type:"doughnut",
      data:{ datasets:[{ data:[pct,100-pct], backgroundColor:[cor,"rgba(255,255,255,0.04)"], borderWidth:0, circumference:270, rotation:225 }] },
      options:{ responsive:false, cutout:"76%", plugins:{ legend:{display:false}, tooltip:{enabled:false} } }
    });
  } else {
    gaugeChart.data.datasets[0].data            = [pct, 100-pct];
    gaugeChart.data.datasets[0].backgroundColor = [cor,"rgba(255,255,255,0.04)"];
    gaugeChart.update("none");
  }
}
atualizarGauge(0);

// ── Painéis ───────────────────────────────────────────────────────────────────
function atualizarPaineis(paineis) {
  document.getElementById("panel-grid").innerHTML = paineis.map(p => `
    <div class="panel-cell ${p.status}">
      <div class="panel-id">${p.id}</div>
      <div class="panel-pct">${p.eficiencia}%</div>
      <div class="panel-w">${p.potencia}W</div>
    </div>`).join("");
}

// ── Alertas ───────────────────────────────────────────────────────────────────
function atualizarAlertas(alertas) {
  document.getElementById("alert-list").innerHTML = alertas.map(a => `
    <div class="alert-item">
      <div class="alert-dot ${a.tipo}"></div>
      <div>
        <div class="alert-msg">${a.msg}</div>
        <div class="alert-time">${a.hora}</div>
      </div>
    </div>`).join("");
}

// ── Fallback HTTP ─────────────────────────────────────────────────────────────
setTimeout(() => {
  if (statusTxt.textContent === "Conectando...") {
    fetch(`${BACKEND}/api/dados`).then(r=>r.json()).then(atualizarDashboard)
    .catch(()=>{ statusTxt.textContent = "Backend offline"; statusTxt.style.color = "var(--red)"; });
  }
}, 3000);
