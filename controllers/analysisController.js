const UserAnalysis = require("../models/UserAnalysis");
const { analyzeRisk } = require("../services/riskEngine");
const { validateAnalyzePayload } = require("../services/validator");

async function analyze(req, res, next) {
  try {
    const errors = validateAnalyzePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const result = analyzeRisk(req.body);

    const record = await UserAnalysis.create({
      ...req.body,
      assets: {
        houseValue: Number(req.body.assets?.houseValue || 0),
        carValue: Number(req.body.assets?.carValue || 0),
        otherAssets: Number(req.body.assets?.otherAssets || 0)
      },
      result
    });

    return res.status(201).json({
      id: record._id,
      ...result
    });
  } catch (error) {
    return next(error);
  }
}

async function getHistory(req, res, next) {
  try {
    const list = await UserAnalysis.find().sort({ createdAt: -1 }).limit(100);
    return res.json(list);
  } catch (error) {
    return next(error);
  }
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

async function exportHistory(req, res, next) {
  try {
    const list = await UserAnalysis.find().sort({ createdAt: -1 }).limit(5000);

    const headers = [
      "Sana",
      "Yosh",
      "Jinsi",
      "Daromad",
      "Xarajat",
      "IshHolati",
      "IshTuri",
      "OilaviyHolat",
      "YashashTuri",
      "So'ralganKredit",
      "MuddatOy",
      "RiskScore",
      "RiskLevel",
      "MaxLoan",
      "Status",
      "Confidence",
      "StressLevel",
      "Tavsiyalar"
    ];

    const rows = list.map((item) => {
      const recs = Array.isArray(item.result?.recommendations)
        ? item.result.recommendations.join(" | ")
        : "";

      return [
        new Date(item.createdAt).toISOString(),
        item.age,
        item.gender,
        item.monthlyIncome,
        item.monthlyExpenses,
        item.jobStatus,
        item.jobType,
        item.maritalStatus,
        item.livingType,
        item.requestedLoan,
        item.loanMonths,
        item.result?.riskScore ?? "",
        item.result?.riskLevel ?? "",
        item.result?.maxLoan ?? "",
        item.result?.status ?? "",
        item.result?.confidence ?? "",
        item.result?.stressLevel ?? "",
        recs
      ];
    });

    const csvLines = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const csvContent = `\uFEFF${csvLines}`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"history_export.csv\"");
    return res.status(200).send(csvContent);
  } catch (error) {
    return next(error);
  }
}

async function deleteHistory(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await UserAnalysis.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Record not found" });
    }

    return res.json({ message: "Deleted successfully" });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  analyze,
  getHistory,
  exportHistory,
  deleteHistory
};
