const mongoose = require("mongoose");

const assetsSchema = new mongoose.Schema(
  {
    houseValue: { type: Number, default: 0 },
    carValue: { type: Number, default: 0 },
    otherAssets: { type: Number, default: 0 }
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    riskScore: Number,
    riskLevel: String,
    explanation: String,
    maxLoan: Number,
    safeLoan: Number,
    confidence: Number,
    stressLevel: String,
    status: String,
    recommendations: [String],
    loanRecommendations: [
      {
        months: Number,
        recommendedLoan: Number,
        risk: Number,
        level: String,
        monthlyPayment: Number,
        paymentRatio: Number,
        riskFilter: String,
        why: String
      }
    ],
    details: {
      freeMoney: Number,
      baseCapacity: Number,
      paymentCapacity: Number,
      monthlyPayment: Number,
      paymentRatio: Number,
      paymentRisk: Number,
      expenseRatio: Number,
      expenseRisk: Number,
      fuzzyRisk: Number,
      incomeRisk: Number,
      termFactor: Number,
      baseRisk: Number,
      assetImpact: Number,
      profileRiskAdjustment: Number,
      profileCapacityMultiplier: Number,
      mlRepayProbability: Number,
      mlRisk: Number,
      safeLoan: Number,
      confidence: Number,
      stressLevel: String,
      totalAssets: Number
    }
  },
  { _id: false }
);

const userAnalysisSchema = new mongoose.Schema({
  age: { type: Number, required: true },
  gender: { type: String, required: true },
  monthlyIncome: { type: Number, required: true },
  monthlyExpenses: { type: Number, required: true },
  jobStatus: { type: String, enum: ["stable", "unstable", "unemployed"], required: true },
  jobType: { type: String, enum: ["low", "medium", "high"], required: true },
  maritalStatus: { type: String, enum: ["single", "married"], required: true },
  livingType: { type: String, enum: ["withParents", "independent"], required: true },
  assets: { type: assetsSchema, required: true },
  requestedLoan: { type: Number, required: true },
  loanMonths: { type: Number, default: 12 },
  result: { type: resultSchema, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("UserAnalysis", userAnalysisSchema);
