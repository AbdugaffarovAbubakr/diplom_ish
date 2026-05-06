// Utility: keeps values inside a numeric range.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Utility: maps asset amount to a coarse level.
function getAssetLevel(totalAssets) {
  if (totalAssets >= 40000) return "high";
  if (totalAssets > 0) return "medium";
  return "none";
}

// Utility: converts assets into capped risk buffer points.
function calculateAssetImpact(totalAssets) {
  let assetImpact = 0;
  if (totalAssets >= 40000) assetImpact = 20;
  else if (totalAssets > 0) assetImpact = 12;

  // Hard cap requested by business rule.
  assetImpact = Math.min(assetImpact, 30);
  // Asset should never dominate overall risk.
  return Math.min(assetImpact, 20);
}

// Utility: logistic transform.
function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

const FEATURE_WEIGHTS = {
  incomeWeight: 0.4,
  expenseWeight: 0.3,
  loanCapacityWeight: 0.2,
  assetWeight: 0.1
};

const FUZZY_BLEND_WEIGHT = 0.15;

// Builds profile-based risk and capacity adjustments from categorical factors.
function calculateProfileAdjustment({ jobStatus, jobType, maritalStatus, livingType }) {
  const jobStatusRiskMap = { stable: -6, unstable: 8, unemployed: 16 };
  const jobTypeRiskMap = { high: -4, medium: 0, low: 5 };
  const maritalRiskMap = { married: -2, single: 2 };
  const livingRiskMap = { independent: -2, withParents: 1 };

  const riskAdjustment =
    (jobStatusRiskMap[jobStatus] ?? 0) +
    (jobTypeRiskMap[jobType] ?? 0) +
    (maritalRiskMap[maritalStatus] ?? 0) +
    (livingRiskMap[livingType] ?? 0);

  const capacityMultiplier =
    (jobStatus === "stable" ? 1.05 : jobStatus === "unstable" ? 0.92 : 0.82) *
    (jobType === "high" ? 1.05 : jobType === "low" ? 0.95 : 1.0) *
    (maritalStatus === "married" ? 1.02 : 0.99) *
    (livingType === "independent" ? 1.02 : 0.98);

  return {
    riskAdjustment,
    capacityMultiplier: clamp(capacityMultiplier, 0.75, 1.15)
  };
}

// Left shoulder membership for fuzzy sets.
function leftShoulder(x, min, max) {
  if (x <= min) return 1;
  if (x >= max) return 0;
  return (max - x) / (max - min);
}

// Right shoulder membership for fuzzy sets.
function rightShoulder(x, min, max) {
  if (x <= min) return 0;
  if (x >= max) return 1;
  return (x - min) / (max - min);
}

// Triangular membership for fuzzy sets.
function triangle(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x === b) return 1;
  if (x < b) return (x - a) / (b - a);
  return (c - x) / (c - b);
}

// Calculates fuzzy risk as a soft uncertainty-aware signal.
function calculateFuzzyRisk({ monthlyIncome, expenseRatio, paymentRatio, totalAssets }) {
  const incomeLow = leftShoulder(monthlyIncome, 3000000, 7000000);
  const incomeMedium = triangle(monthlyIncome, 3000000, 7000000, 12000000);
  const incomeHigh = rightShoulder(monthlyIncome, 7000000, 12000000);

  const expenseLow = leftShoulder(expenseRatio, 0.35, 0.55);
  const expenseHigh = rightShoulder(expenseRatio, 0.55, 0.8);

  const paymentLow = leftShoulder(paymentRatio, 0.25, 0.45);
  const paymentHigh = rightShoulder(paymentRatio, 0.45, 0.7);

  let riskLow = 0;
  let riskMedium = 0;
  let riskHigh = 0;

  riskHigh = Math.max(riskHigh, Math.min(incomeLow, expenseHigh));
  riskHigh = Math.max(riskHigh, Math.min(incomeLow, paymentHigh));
  riskLow = Math.max(riskLow, Math.min(incomeHigh, expenseLow));
  riskLow = Math.max(riskLow, Math.min(incomeHigh, paymentLow));
  riskMedium = Math.max(riskMedium, Math.min(incomeMedium, Math.max(expenseLow, paymentLow)));

  if (totalAssets > 0) {
    riskLow = Math.max(riskLow, 0.35);
  }

  const numerator = riskLow * 25 + riskMedium * 50 + riskHigh * 82;
  const denominator = riskLow + riskMedium + riskHigh || 1;
  return clamp(numerator / denominator, 10, 95);
}

// Calculates ML repayment probability and ML risk.
function calculateMLRisk({ age, monthlyIncome, monthlyExpenses, jobStatus, jobType, totalAssets }) {
  const incomeM = monthlyIncome / 1000000;
  const expensesM = monthlyExpenses / 1000000;
  const assetsM = totalAssets / 10000;
  const expenseRatio = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : 1;

  const jobStability = jobStatus === "stable" ? 1 : jobStatus === "unstable" ? 0.5 : 0.2;
  const jobClass = jobType === "high" ? 1 : jobType === "medium" ? 0.6 : 0.3;

  const z =
    -1.2 +
    incomeM * 0.15 +
    assetsM * 0.18 +
    (age / 100) * 0.35 +
    jobStability * 0.9 +
    jobClass * 0.3 -
    expensesM * 0.12 -
    expenseRatio * 1.05;

  const rawProbability = logistic(z);
  const mlProbability = clamp(rawProbability, 0, 0.95);
  const mlRisk = (1 - mlProbability) * 100;

  return {
    mlProbability,
    mlRisk
  };
}

// Calculates income-driven risk (income is the strongest signal).
function calculateIncomeRisk(monthlyIncome) {
  const benchmarkIncome = 8000000;
  const incomeRatio = monthlyIncome / benchmarkIncome;
  const incomeRisk = 100 / (1 + Math.pow(incomeRatio, 1.35));
  return clamp(incomeRisk, 5, 100);
}

// Calculates monthly payment and payment ratio.
function calculatePaymentMetrics({ requestedLoan, loanMonths, monthlyIncome }) {
  const monthlyPayment = requestedLoan === 0 ? 0 : requestedLoan / loanMonths;
  const paymentRatio = monthlyIncome > 0 ? monthlyPayment / monthlyIncome : 1;

  return {
    monthlyPayment,
    paymentRatio
  };
}

// Non-linear payment risk: square amplification.
function calculatePaymentRisk(paymentRatio) {
  return clamp(Math.pow(paymentRatio, 2.2) * 100, 0, 100);
}

// Non-linear expense risk: 1.5 power amplification.
function calculateExpenseRisk(expenseRatio) {
  return clamp(Math.pow(expenseRatio, 2) * 100, 0, 100);
}

// Loan term factor: short term increases risk, long term decreases risk.
function calculateTermFactor(loanMonths) {
  return 1 / (1 + Math.log(loanMonths));
}

// Calculates final risk score with non-linear components.
function calculateRisk({
  incomeRisk,
  paymentRisk,
  expenseRisk,
  totalAssets,
  requestedLoan,
  profileRiskAdjustment
}) {
  const baseRisk =
    incomeRisk * FEATURE_WEIGHTS.incomeWeight +
    expenseRisk * FEATURE_WEIGHTS.expenseWeight +
    paymentRisk * FEATURE_WEIGHTS.loanCapacityWeight;

  // Asset is only support factor and cannot reduce more than 20% of base risk.
  const rawAssetImpact = calculateAssetImpact(totalAssets);
  const assetImpact = Math.min(rawAssetImpact, baseRisk * 0.2);

  let risk = baseRisk - assetImpact * FEATURE_WEIGHTS.assetWeight;
  risk += profileRiskAdjustment;

  // Realistic floor: excellent profiles are rare.
  risk = Math.max(risk, 10);

  // Ensure small requested loans do not get unrealistically high risk.
  if (requestedLoan > 0 && requestedLoan <= 3000000) {
    risk = Math.min(risk, 40);
  }

  return {
    riskScore: clamp(risk, 0, 100),
    baseRisk,
    assetImpact
  };
}

// Blends core risk with fuzzy risk in a controlled way.
function blendRiskWithFuzzy(coreRisk, fuzzyRisk) {
  return clamp(coreRisk * (1 - FUZZY_BLEND_WEIGHT) + fuzzyRisk * FUZZY_BLEND_WEIGHT, 10, 100);
}

// Maps numeric risk score to a level.
function getRiskLevel(riskScore) {
  if (riskScore <= 30) return "low";
  if (riskScore <= 60) return "medium";
  return "high";
}

// Calculates max loan using affordability, risk scaling and asset bonus.
function calculateMaxLoan({ monthlyIncome, monthlyExpenses, loanMonths, finalRiskScore, totalAssets }) {
  const freeMoney = monthlyIncome - monthlyExpenses;
  const baseCapacity = Math.max(0, freeMoney * 0.4);

  let maxLoan = baseCapacity * loanMonths;

  if (finalRiskScore > 70) maxLoan *= 0.6;
  if (finalRiskScore < 30) maxLoan *= 1.3;

  const assetLevel = getAssetLevel(totalAssets);
  if (assetLevel === "medium") maxLoan *= 1.1;
  if (assetLevel === "high") maxLoan *= 1.2;

  return {
    freeMoney,
    baseCapacity,
    maxLoan: Math.max(0, Math.round(maxLoan))
  };
}

// Applies profile multiplier to max loan while keeping model stable.
function applyProfileCapacity(maxLoan, capacityMultiplier) {
  return Math.max(0, Math.round(maxLoan * capacityMultiplier));
}

// Decides requested loan status by tolerance policy.
function decideLoanStatus(requestedLoan, maxLoan) {
  if (requestedLoan === 0) return "no_request";
  if (requestedLoan <= maxLoan) return "approved";
  if (requestedLoan <= maxLoan * 1.3) return "caution";
  return "rejected";
}

// Converts payment ratio to stress label.
function getStressLevel(paymentRatio) {
  if (paymentRatio > 0.5) return "HIGH STRESS";
  if (paymentRatio >= 0.3) return "MEDIUM";
  return "SAFE";
}

// Builds explanation text for why risk is at current level.
function generateExplanation({
  paymentRatio,
  expenseRatio,
  loanMonths,
  totalAssets,
  mlRisk,
  jobStatus,
  jobType,
  maritalStatus,
  livingType
}) {
  const reasons = [];

  if (paymentRatio > 0.6) reasons.push("to'lov/daromad nisbati juda yuqori bo'lgani uchun risk keskin oshdi");
  else if (paymentRatio >= 0.3) reasons.push("to'lov yuklamasi o'rtacha darajada");
  else reasons.push("to'lov yuklamasi past va nazorat ostida");

  if (expenseRatio > 0.7) reasons.push("xarajatlar daromadga nisbatan yuqori");
  if (loanMonths <= 6) reasons.push("qisqa muddat tufayli risk bosimi kuchaydi");
  if (loanMonths >= 18) reasons.push("uzoq muddat tufayli risk yumshadi");

  if (totalAssets > 0) reasons.push("mavjud aktivlar riskni cheklangan miqdorda pasaytirdi");
  else reasons.push("aktivlar yo'qligi himoya buferini kamaytirdi");

  if (jobStatus === "unstable" || jobStatus === "unemployed") reasons.push("ish holati riskni oshiruvchi omil bo'ldi");
  if (jobType === "low") reasons.push("ish turi past kategoriyada bo'lgani uchun risk yuqoriroq baholandi");
  if (maritalStatus === "married") reasons.push("oilaviy barqarorlik riskni biroz yumshatdi");
  if (livingType === "independent") reasons.push("mustaqil yashash moliyaviy intizom signali sifatida ijobiy baholandi");

  reasons.push(`ML signal bazaviy barqarorlikni ${mlRisk.toFixed(1)} darajada ko'rsatdi`);

  return reasons.join("; ") + ".";
}

// Maps payment ratio to strategy risk filter.
function getStrategyRiskFilter(paymentRatio) {
  if (paymentRatio > 0.6) return "HIGH RISK";
  if (paymentRatio >= 0.3) return "MEDIUM";
  return "LOW RISK";
}

// Creates plain-language reason for each strategy row.
function buildWhyText({ months, paymentRatio, totalAssets, freeMoney }) {
  const reasons = [];

  if (paymentRatio > 0.6) reasons.push("oylik to'lov daromadga nisbatan yuqori");
  else if (paymentRatio >= 0.3) reasons.push("oylik to'lov boshqariladigan, lekin nazorat talab qiladi");
  else reasons.push("oylik to'lov daromadga nisbatan xavfsiz diapazonda");

  if (totalAssets > 0) reasons.push("mavjud aktivlar kredit limitini oshirishga yordam berdi");
  else reasons.push("aktivlar yo'qligi sabab konservativ limit saqlandi");

  if (months <= 6) reasons.push("qisqa muddat sabab tavsiya konservativroq");
  if (months >= 12 && freeMoney > 0) reasons.push("uzoqroq muddat oylik bosimni kamaytiradi");

  return reasons.join("; ") + ".";
}

// Calculates recommendation for a specific loan term.
function calculateTermRecommendation({ months, multiplier, monthlyIncome, monthlyExpenses, mlRisk, totalAssets }) {
  const freeMoney = monthlyIncome - monthlyExpenses;
  const baseCapacity = Math.max(0, freeMoney * 0.4);
  const assetBonusRate = getAssetLevel(totalAssets) === "high" ? 0.2 : totalAssets > 0 ? 0.1 : 0;

  const recommendedLoan = Math.max(0, Math.round(baseCapacity * months * multiplier * (1 + assetBonusRate)));
  const monthlyPayment = months > 0 ? recommendedLoan / months : 0;
  const paymentRatio = monthlyIncome > 0 ? monthlyPayment / monthlyIncome : 1;
  const paymentRisk = calculatePaymentRisk(paymentRatio);

  const riskScore = clamp(mlRisk * 0.5 + paymentRisk * 0.5, 0, 100);

  return {
    months,
    recommendedLoan,
    risk: Number(riskScore.toFixed(2)),
    level: getRiskLevel(riskScore),
    monthlyPayment: Math.round(monthlyPayment),
    paymentRatio: Number(paymentRatio.toFixed(4)),
    riskFilter: getStrategyRiskFilter(paymentRatio),
    why: buildWhyText({ months, paymentRatio, totalAssets, freeMoney })
  };
}

// Calculates 3-month conservative strategy.
function calculate3Months(input) {
  return calculateTermRecommendation({ ...input, months: 3, multiplier: 0.85 });
}

// Calculates 6-month moderate strategy.
function calculate6Months(input) {
  return calculateTermRecommendation({ ...input, months: 6, multiplier: 1.0 });
}

// Calculates 12-month balanced strategy.
function calculate12Months(input) {
  return calculateTermRecommendation({ ...input, months: 12, multiplier: 1.1 });
}

// Calculates 24-month maximum safe strategy.
function calculate24Months(input) {
  return calculateTermRecommendation({ ...input, months: 24, multiplier: 1.2 });
}

// Builds all optimal loan strategy recommendations.
function buildLoanRecommendations({ monthlyIncome, monthlyExpenses, mlRisk, totalAssets }) {
  const sharedInput = { monthlyIncome, monthlyExpenses, mlRisk, totalAssets };
  return [
    calculate3Months(sharedInput),
    calculate6Months(sharedInput),
    calculate12Months(sharedInput),
    calculate24Months(sharedInput)
  ];
}

// Generates user-facing recommendations.
function generateRecommendation({ monthlyIncome, monthlyExpenses, jobStatus, totalAssets, paymentRatio }) {
  const recommendations = [];
  const expenseRatio = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : 1;

  if (expenseRatio > 0.6) recommendations.push("Xarajatni kamaytiring");
  if (jobStatus === "unstable") recommendations.push("Barqaror ish toping");
  if (totalAssets === 0) recommendations.push("Mol-mulkni oshiring");
  if (paymentRatio > 0.5) recommendations.push("Kredit summasini kamaytirish yoki muddatni uzaytirish tavsiya etiladi");

  if (recommendations.length === 0) {
    recommendations.push("Moliyaviy ko'rsatkichlar qoniqarli, intizomni saqlang");
  }

  return recommendations;
}

// Orchestrates end-to-end scoring and loan decision.
function analyzeRisk(payload) {
  const {
    age,
    monthlyIncome,
    monthlyExpenses,
    jobStatus,
    jobType,
    maritalStatus,
    livingType,
    assets,
    requestedLoan,
    loanMonths
  } = payload;

  const totalAssets =
    Number(assets?.houseValue || 0) + Number(assets?.carValue || 0) + Number(assets?.otherAssets || 0);

  const expenseRatio = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : 1;

  const { mlProbability, mlRisk } = calculateMLRisk({
    age,
    monthlyIncome,
    monthlyExpenses,
    jobStatus,
    jobType,
    totalAssets
  });

  const paymentMetrics = calculatePaymentMetrics({
    requestedLoan,
    loanMonths,
    monthlyIncome
  });

  const incomeRisk = calculateIncomeRisk(monthlyIncome);
  const paymentRisk = calculatePaymentRisk(paymentMetrics.paymentRatio);
  const expenseRisk = calculateExpenseRisk(expenseRatio);
  const termFactor = calculateTermFactor(loanMonths);
  const fuzzyRisk = calculateFuzzyRisk({
    monthlyIncome,
    expenseRatio,
    paymentRatio: paymentMetrics.paymentRatio,
    totalAssets
  });

  const profileAdjustment = calculateProfileAdjustment({
    jobStatus,
    jobType,
    maritalStatus,
    livingType
  });

  const riskBundle = calculateRisk({
    incomeRisk,
    paymentRisk,
    expenseRisk,
    totalAssets,
    requestedLoan,
    profileRiskAdjustment: profileAdjustment.riskAdjustment
  });
  let finalRiskScore = riskBundle.riskScore + termFactor * 4;
  finalRiskScore = blendRiskWithFuzzy(finalRiskScore, fuzzyRisk);
  finalRiskScore = clamp(Math.max(finalRiskScore, 10), 0, 100);

  const riskLevel = getRiskLevel(finalRiskScore);

  const loanCapacity = calculateMaxLoan({
    monthlyIncome,
    monthlyExpenses,
    loanMonths,
    finalRiskScore,
    totalAssets
  });
  loanCapacity.maxLoan = applyProfileCapacity(loanCapacity.maxLoan, profileAdjustment.capacityMultiplier);

  const status = decideLoanStatus(requestedLoan, loanCapacity.maxLoan);
  const confidence = clamp(100 - finalRiskScore, 0, 100);
  const safeLoan = Math.max(0, Math.round(loanCapacity.maxLoan * 0.8));
  const stressLevel = getStressLevel(paymentMetrics.paymentRatio);

  const recommendations = generateRecommendation({
    monthlyIncome,
    monthlyExpenses,
    jobStatus,
    totalAssets,
    paymentRatio: paymentMetrics.paymentRatio
  });

  const loanRecommendations = buildLoanRecommendations({
    monthlyIncome,
    monthlyExpenses,
    mlRisk,
    totalAssets
  });

  const explanation = generateExplanation({
    paymentRatio: paymentMetrics.paymentRatio,
    expenseRatio,
    loanMonths,
    totalAssets,
    mlRisk,
    jobStatus,
    jobType,
    maritalStatus,
    livingType
  });

  return {
    riskScore: Number(finalRiskScore.toFixed(2)),
    riskLevel,
    explanation,
    maxLoan: loanCapacity.maxLoan,
    safeLoan,
    confidence: Number(confidence.toFixed(2)),
    stressLevel,
    status,
    recommendations,
    loanRecommendations,
    details: {
      freeMoney: Number(loanCapacity.freeMoney.toFixed(2)),
      baseCapacity: Number(loanCapacity.baseCapacity.toFixed(2)),
      paymentCapacity: Number(loanCapacity.baseCapacity.toFixed(2)),
      monthlyPayment: Number(paymentMetrics.monthlyPayment.toFixed(2)),
      paymentRatio: Number(paymentMetrics.paymentRatio.toFixed(4)),
      paymentRisk: Number(paymentRisk.toFixed(2)),
      expenseRatio: Number(expenseRatio.toFixed(4)),
      expenseRisk: Number(expenseRisk.toFixed(2)),
      fuzzyRisk: Number(fuzzyRisk.toFixed(2)),
      incomeRisk: Number(incomeRisk.toFixed(2)),
      termFactor: Number(termFactor.toFixed(4)),
      baseRisk: Number(riskBundle.baseRisk.toFixed(2)),
      assetImpact: Number(riskBundle.assetImpact.toFixed(2)),
      profileRiskAdjustment: Number(profileAdjustment.riskAdjustment.toFixed(2)),
      profileCapacityMultiplier: Number(profileAdjustment.capacityMultiplier.toFixed(4)),
      mlRepayProbability: Number((mlProbability * 100).toFixed(2)),
      mlRisk: Number(mlRisk.toFixed(2)),
      safeLoan,
      confidence: Number(confidence.toFixed(2)),
      stressLevel,
      totalAssets
    }
  };
}

module.exports = {
  analyzeRisk,
  calculateRisk,
  calculateFuzzyRisk,
  blendRiskWithFuzzy,
  calculateIncomeRisk,
  calculatePaymentRisk,
  calculateTermFactor,
  calculateMaxLoan,
  applyProfileCapacity,
  calculateProfileAdjustment,
  decideLoanStatus,
  calculateMLRisk,
  generateRecommendation,
  generateExplanation,
  calculatePaymentMetrics,
  getStressLevel,
  getRiskLevel,
  buildLoanRecommendations,
  calculate3Months,
  calculate6Months,
  calculate12Months,
  calculate24Months
};
