const express = require("express");
const {
  analyze,
  getHistory,
  exportHistory,
  deleteHistory
} = require("../controllers/analysisController");

const router = express.Router();

router.post("/analyze", analyze);
router.get("/history", getHistory);
router.get("/history/export", exportHistory);
router.delete("/history/:id", deleteHistory);

module.exports = router;
