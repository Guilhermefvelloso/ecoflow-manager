// ── Conecta ao backend via WebSocket ──────────────────────────────────────────
const socket = io("https://ecoflow-manager.onrender.com");
const statusTxt = document.getElementById("status-txt");

socket.on("connect", () => {
  statusTxt.textContent = "Sistema online";
  statusTxt.style.color = "var(--verde)";
});

socket.on("disconnect", () => {
  statusTxt.textContent = "Desconectado";
  statusTxt.style.color = "var(--red)";
});

socket.on("atualizacao", (data) => atualizarDashboard(data));

// ── Atualiza todos os elementos com os dados recebidos ────────────────────────
function atualizarDashboard(d) {
  document.getElementById("m-pot").textContent = d.potencia.toLocaleString("pt-BR");
  document.getElementById("m-gen").textContent = d.energia_hoje.toFixed(1);
  document.getElementById("m-mes").textContent = d.energia_mes;
  document.getElementById("m-eco").textContent = Math.round(d.energia_mes * 0.6).toLocaleString("pt-BR");
  document.getElementById("m-co2").textContent = Math.round(d.energia_mes * 0.475);
  document.getElementById("v-val").textContent = d.tensao.toFixed(1) + " V";
  document.getElementById("i-val").textContent = d.corrente.toFixed(2) + " A";
  document.getElementById("eff-pct").textContent = d.eficiencia + "%";

  const meta = 14;
  const pct = Math.round((d.energia_hoje / meta) * 100);
  const dGen = document.getElementById("d-gen");
  dGen.textContent = `${pct}% da meta diária`;
  dGen.className = "metric-delta " + (pct >= 80 ? "up" : pct < 50 ? "down" : "");

  document.getElementById("d-pot").textContent =
    d.potencia > 2000 ? "↑ Boa geração" :
    d.potencia > 1000 ? "→ Geração parcial" : "↓ Geração baixa";

  atualizarGauge(d.eficiencia);
  atualizarPaineis(d.paineis);
}

// ── Dados históricos para os gráficos ─────────────────────────────────────────
const dados = {
  hoje: {
    labels:    ["6h","7h","8h","9h","10h","11h","12h","13h","14h","15h","16h","17h","18h"],
    real:      [0, 0.1, 0.4, 0.9, 1.6, 2.2, 2.5, 2.6, 2.4, 2.0, 1.5, 0.8, 0.2],
    estimado:  [0, 0.1, 0.5, 1.0, 1.7, 2.3, 2.6, 2.7, 2.5, 2.1, 1.6, 0.9, 0.2]
  },
  semana: {
    labels:   ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"],
    real:     [10.2, 11.8, 9.5, 12.1, 11.2, 13.0, 8.7],
    estimado: [11,   11.5, 11,  11,   11,   12.5, 10]
  },
  mes: {
    labels:   Array.from({length: 17}, (_, i) => `${i + 1}`),
    real:     [11,13,10,12,9,14,11,12,13,10,11,14,12,11,10,13,11],
    estimado: Array(17).fill(12)
  }
};

// ── Gráfico de linha (geração) ────────────────────────────────────────────────
let genChart;

function buildChart(periodo) {
  const { labels, real, estimado } = dados[periodo];
  if (genChart) genChart.destroy();

  genChart = new Chart(document.getElementById("genChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Real",
          data: real,
          borderColor: "#1D9E75",
          backgroundColor: "rgba(29,158,117,0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          borderWidth: 2
        },
        {
          label: "Estimado",
          data: estimado,
          borderColor: "rgba(239,159,39,0.6)",
          backgroundColor: "transparent",
          borderDash: [5, 4],
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8b949e", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#8b949e", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.05)" } }
      }
    }
  });
}

buildChart("hoje");

function setView(periodo, btn) {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  buildChart(periodo);
}

// ── Gauge de eficiência (doughnut) ────────────────────────────────────────────
let gaugeChart;

function atualizarGauge(pct) {
  if (!gaugeChart) {
    gaugeChart = new Chart(document.getElementById("gaugeChart"), {
      type: "doughnut",
      data: {
        datasets: [{
          data: [pct, 100 - pct],
          backgroundColor: ["#1D9E75", "rgba(255,255,255,0.05)"],
          borderWidth: 0,
          circumference: 270,
          rotation: 225
        }]
      },
      options: {
        responsive: false,
        cutout: "74%",
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  } else {
    gaugeChart.data.datasets[0].data = [pct, 100 - pct];
    gaugeChart.update("none");
  }
}

atualizarGauge(0);

// ── Painéis solares ───────────────────────────────────────────────────────────
function atualizarPaineis(paineis) {
  const grid = document.getElementById("panel-grid");
  grid.innerHTML = paineis.map(p => `
    <div class="panel-cell ${p.status}">
      <div class="panel-id">${p.id}</div>
      <div class="panel-pct">${p.eficiencia}%</div>
    </div>
  `).join("");
}

// ── Fallback HTTP: busca dados se WebSocket demorar ───────────────────────────
setTimeout(() => {
  if (statusTxt.textContent === "Conectando...") {
    fetch("http://localhost:3001/api/dados")
      .then(r => r.json())
      .then(atualizarDashboard)
      .catch(() => {
        statusTxt.textContent = "Backend offline";
        statusTxt.style.color = "var(--red)";
      });
  }
}, 3000);
