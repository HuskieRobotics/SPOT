const { Router } = require("express");
const { TeamMatchPerformance } = require("../../lib/db");

const router = Router();
const config = require("../../../config/config.json");

// Middleware to check authorization
router.use((req, res, next) => {
  if (config.secrets.ACCESS_CODE === req.headers.authorization) {
    next();
  } else {
    res.status(403).json({ error: "Not Authorized" });
  }
});

// Get all team match performances
router.get("/teamMatchPerformances", async (req, res) => {
  try {
    const performances = await TeamMatchPerformance.find();
    res.json(performances);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to fetch team match performances" });
  }
});

// Update a team match performance
router.put("/teamMatchPerformance/:id", async (req, res) => {
  try {
    const updatedPerformance = await TeamMatchPerformance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedPerformance);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to update team match performance" });
  }
});

// Delete a team match performance
router.delete("/teamMatchPerformance/:id", async (req, res) => {
  try {
    await TeamMatchPerformance.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to delete team match performance" });
  }
});

module.exports = router;
