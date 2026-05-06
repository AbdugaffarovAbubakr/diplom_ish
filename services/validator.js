function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateAnalyzePayload(body) {
  const errors = [];

  const requiredStringFields = [
    "gender",
    "jobStatus",
    "jobType",
    "maritalStatus",
    "livingType"
  ];

  const requiredNumberFields = ["age", "monthlyIncome", "monthlyExpenses", "requestedLoan", "loanMonths"];

  requiredStringFields.forEach((field) => {
    if (!body[field] || typeof body[field] !== "string") {
      errors.push(`${field} is required and must be a string`);
    }
  });

  requiredNumberFields.forEach((field) => {
    if (!isNonNegativeNumber(body[field])) {
      errors.push(`${field} is required and must be a non-negative number`);
    }
  });

  if (body.loanMonths === 0) {
    errors.push("loanMonths must be greater than 0");
  }

  if (!body.assets || typeof body.assets !== "object") {
    errors.push("assets is required and must be an object");
  } else {
    ["houseValue", "carValue", "otherAssets"].forEach((field) => {
      if (!isNonNegativeNumber(Number(body.assets[field] ?? 0))) {
        errors.push(`assets.${field} must be a non-negative number`);
      }
    });
  }

  const jobStatuses = ["stable", "unstable", "unemployed"];
  const jobTypes = ["low", "medium", "high"];
  const maritalStatuses = ["single", "married"];
  const livingTypes = ["withParents", "independent"];

  if (body.jobStatus && !jobStatuses.includes(body.jobStatus)) {
    errors.push(`jobStatus must be one of: ${jobStatuses.join(", ")}`);
  }

  if (body.jobType && !jobTypes.includes(body.jobType)) {
    errors.push(`jobType must be one of: ${jobTypes.join(", ")}`);
  }

  if (body.maritalStatus && !maritalStatuses.includes(body.maritalStatus)) {
    errors.push(`maritalStatus must be one of: ${maritalStatuses.join(", ")}`);
  }

  if (body.livingType && !livingTypes.includes(body.livingType)) {
    errors.push(`livingType must be one of: ${livingTypes.join(", ")}`);
  }

  return errors;
}

module.exports = {
  validateAnalyzePayload
};
