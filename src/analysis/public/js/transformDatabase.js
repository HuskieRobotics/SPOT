const mongoose = require("mongoose");

const config = require("../../../../config/config.json");

mongoose.connect(config.secrets.DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function updateTeamMatchPerformanceEventNumbers() {
  try {
    // Get the collection (make sure the collection name is correct)
    const collection = mongoose.connection.db.collection(
      "teamMatchPerformances"
    );

    // Update all documents where eventNumber is an integer
    const res = await collection.updateMany(
      { eventNumber: { $type: "int" } },
      [{ $set: { eventNumber: { $toString: "$eventNumber" } } }] // Aggregation pipeline update operator
    );
    console.log("Modified Count:", res.modifiedCount);
  } catch (err) {
    console.error("Error occurred:", err);
  } finally {
    mongoose.disconnect();
  }
}

async function mapTMPEventNumbersToCodes() {
  try {
    // Get the collection (make sure the collection name is correct)
    const collection = mongoose.connection.db.collection(
      "teamMatchPerformances"
    );

    // Update all documents where eventNumber is an integer
    const res = await collection.updateMany(
      { eventNumber: "98" },
      [{ $set: { eventNumber: "2025week0_training" } }] // Aggregation pipeline update operator
    );
    console.log("Modified Count:", res.modifiedCount);
  } catch (err) {
    console.error("Error occurred:", err);
  } finally {
    mongoose.disconnect();
  }
}

// Run the update once the connection is established
mongoose.connection.once("open", () => {
  // updateTeamMatchPerformanceEventNumbers();
  mapTMPEventNumbersToCodes();
});
