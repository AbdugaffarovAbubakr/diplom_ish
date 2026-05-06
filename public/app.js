const form = document.getElementById("analyzeForm");
const resultEmpty = document.getElementById("resultEmpty");
const resultBlock = document.getElementById("resultBlock");
const historyList = document.getElementById("historyList");
const exportHistoryBtn = document.getElementById("exportHistoryBtn");
const toggleStatsBtn = document.getElementById("toggleStatsBtn");
const statsSection = document.getElementById("statsSection");

let chart;
let ageChart;
let genderChart;
let maritalChart;
let loanMonthsChart;
let cachedHistory = [];

const LEVEL_UZ = {
  low: "past",
  medium: "o'rta",
  high: "yuqori"
};

const STATUS_UZ = {
  approved: "tasdiqlandi",
  caution: "ehtiyotkorlik bilan",
  rejected: "rad etildi",
  no_request: "so'rov yo'q"
};

const FILTER_UZ = {
  "HIGH RISK": "YUQORI XAVF",
  MEDIUM: "O'RTA XAVF",
  "LOW RISK": "PAST XAVF"
};

function formatMoney(value) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(value));
}

function setRiskBadge(level) {
  const el = document.getElementById("riskLevel");
  el.className = `pill ${level}`;
  el.textContent = LEVEL_UZ[level] || level;
}

function drawChart(data) {
  const ctx = document.getElementById("riskChart");
  const expenseRisk = (data.details?.expenseRatio || 0) * 100;
  const paymentRisk = data.details?.paymentRisk || 0;

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["ML Risk", "Expense Risk", "Payment Risk", "Final Risk"],
      datasets: [
        {
          label: "Risk %",
          data: [data.details.mlRisk, expenseRisk, paymentRisk, data.riskScore],
          backgroundColor: ["#ef4444", "#f59e0b", "#0ea5e9", "#6366f1"]
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { min: 0, max: 100 }
      }
    }
  });
}

function getAgeRange(age) {
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
}

function getLoanMonthBucket(months) {
  if (months <= 3) return "3 oy";
  if (months <= 6) return "6 oy";
  if (months <= 12) return "12 oy";
  if (months <= 24) return "24 oy";
  return "24+ oy";
}

function buildPercentLabels(mapObj) {
  const entries = Object.entries(mapObj);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0) || 1;
  return {
    labels: entries.map((entry) => `${entry[0]} (${((entry[1] / total) * 100).toFixed(1)}%)`),
    values: entries.map((entry) => entry[1])
  };
}

function destroyStatsCharts() {
  [ageChart, genderChart, maritalChart, loanMonthsChart].forEach((item) => {
    if (item) item.destroy();
  });
}

function renderPieChart(canvasId, labels, values) {
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: ["#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#14b8a6"]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  });
}

function renderStatistics(history) {
  if (!Array.isArray(history) || history.length === 0) {
    statsSection.style.display = "none";
    return;
  }

  const ageMap = {};
  const genderMap = { Erkak: 0, Ayol: 0 };
  const maritalMap = { "Turmush qurgan": 0, "Turmush qurmagan": 0 };
  const monthsMap = { "3 oy": 0, "6 oy": 0, "12 oy": 0, "24 oy": 0, "24+ oy": 0 };

  history.forEach((item) => {
    const ageKey = getAgeRange(Number(item.age || 0));
    ageMap[ageKey] = (ageMap[ageKey] || 0) + 1;

    if (item.gender === "female") genderMap.Ayol += 1;
    else genderMap.Erkak += 1;

    if (item.maritalStatus === "married") maritalMap["Turmush qurgan"] += 1;
    else maritalMap["Turmush qurmagan"] += 1;

    const bucket = getLoanMonthBucket(Number(item.loanMonths || 0));
    monthsMap[bucket] += 1;
  });

  destroyStatsCharts();

  const ageData = buildPercentLabels(ageMap);
  const genderData = buildPercentLabels(genderMap);
  const maritalData = buildPercentLabels(maritalMap);
  const monthsData = buildPercentLabels(monthsMap);

  ageChart = renderPieChart("ageChart", ageData.labels, ageData.values);
  genderChart = renderPieChart("genderChart", genderData.labels, genderData.values);
  maritalChart = renderPieChart("maritalChart", maritalData.labels, maritalData.values);
  loanMonthsChart = renderPieChart("loanMonthsChart", monthsData.labels, monthsData.values);
}

function renderLoanRecommendations(items = []) {
  const wrap = document.getElementById("loanRecommendations");
  if (!Array.isArray(items) || items.length === 0) {
    wrap.innerHTML = "<p>Tavsiyalar topilmadi.</p>";
    return;
  }

  wrap.innerHTML = items
    .map(
      (item) => `
      <div class="recommendation-item">
        <h4>${item.months} oy</h4>
        <p><strong>Tavsiya kredit:</strong> ${formatMoney(item.recommendedLoan)} UZS</p>
        <p><strong>Oylik to'lov:</strong> ${formatMoney(item.monthlyPayment)} UZS</p>
        <p><strong>Risk:</strong> ${item.risk}% (${LEVEL_UZ[item.level] || item.level})</p>
        <p><strong>Filter:</strong> ${FILTER_UZ[item.riskFilter] || item.riskFilter}</p>
        <p><strong>Izoh:</strong> ${item.why}</p>
      </div>`
    )
    .join("");
}

async function loadHistory() {
  const res = await fetch("/api/history");
  const list = await res.json();
  cachedHistory = Array.isArray(list) ? list : [];

  if (!Array.isArray(list) || list.length === 0) {
    historyList.innerHTML = "<p>Hozircha history mavjud emas.</p>";
    if (statsSection.style.display !== "none") {
      renderStatistics([]);
    }
    return;
  }

  historyList.innerHTML = list
    .map(
      (item) => `
      <div class="history-item">
        <div class="history-top">
          <div>
            <strong>${new Date(item.createdAt).toLocaleString()}</strong><br>
            Risk: ${item.result.riskScore}% (${LEVEL_UZ[item.result.riskLevel] || item.result.riskLevel}) | Maks: ${formatMoney(item.result.maxLoan)} UZS
          </div>
          <button class="delete-btn" onclick="deleteHistory('${item._id}')">O'chirish</button>
        </div>
      </div>`
    )
    .join("");
}

async function deleteHistory(id) {
  await fetch(`/api/history/${id}`, { method: "DELETE" });
  await loadHistory();
}

window.deleteHistory = deleteHistory;

exportHistoryBtn.addEventListener("click", () => {
  window.location.href = "/api/history/export";
});

toggleStatsBtn.addEventListener("click", () => {
  const isHidden = statsSection.style.display === "none";
  statsSection.style.display = isHidden ? "block" : "none";
  toggleStatsBtn.textContent = isHidden ? "Statistikani yopish" : "Statistika";
  if (isHidden) renderStatistics(cachedHistory);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fd = new FormData(form);
  const payload = {
    age: Number(fd.get("age")),
    gender: fd.get("gender"),
    monthlyIncome: Number(fd.get("monthlyIncome")),
    monthlyExpenses: Number(fd.get("monthlyExpenses")),
    jobStatus: fd.get("jobStatus"),
    jobType: fd.get("jobType"),
    maritalStatus: fd.get("maritalStatus"),
    livingType: fd.get("livingType"),
    requestedLoan: Number(fd.get("requestedLoan")),
    loanMonths: Number(fd.get("loanMonths")),
    assets: {
      houseValue: Number(fd.get("houseValue")),
      carValue: Number(fd.get("carValue")),
      otherAssets: Number(fd.get("otherAssets"))
    }
  };

  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.errors ? data.errors.join("\n") : data.message);
    return;
  }

  resultEmpty.style.display = "none";
  resultBlock.style.display = "block";

  document.getElementById("riskScore").textContent = `${data.riskScore}%`;
  setRiskBadge(data.riskLevel);
  document.getElementById("maxLoan").textContent = `${formatMoney(data.maxLoan)} UZS`;
  document.getElementById("status").textContent = STATUS_UZ[data.status] || data.status;
  document.getElementById("mcRepay").textContent = `${data.confidence}%`;
  document.getElementById("mlRepay").textContent = `${data.details.mlRepayProbability}%`;

  document.getElementById("recommendations").innerHTML = data.recommendations
    .map((item) => `<li>${item}</li>`)
    .join("");

  renderLoanRecommendations(data.loanRecommendations);
  drawChart(data);
  await loadHistory();
});

loadHistory();
