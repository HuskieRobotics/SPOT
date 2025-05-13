const mongoose = require("mongoose");

const MONGO_URI =
  "mongodb+srv://admin:bpTkvY6bw7aH4K@cluster0.fqykfv1.mongodb.net/2025ReefscapeDev?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, {
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

// Run the update once the connection is established
mongoose.connection.once("open", () => {
  updateTeamMatchPerformanceEventNumbers();
});
