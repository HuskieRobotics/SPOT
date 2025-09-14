const mongoose = require("mongoose");

const config = require("../../config/config.json");

mongoose.connect(config.secrets.DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function changeTypeOfEventCodes() {
  // // '1' -> 2025mndu2_official, '14' -> 2024ksla_training, '15' -> 2024ilch_training,
  // '16' -> 2024joh_training, '19' -> 2024witw_training, '2' -> 2025ilch_official,
  // '21' -> 2025ilch_testing, '8' -> 2023rr_testing, '98' -> 2025week0_training,
  // '99' -> 2025week0_training, '3' -> 2025cur_official, '4' -> 2023ilch_training
  // '7' -> 2023arc_training, '18' -> 2024rr_testing, '85' -> 2025mndu2_testing,

  // FIXME: update the eventNumbers array with the event numbers in your database
  const eventNumbers = [
    1, 2, 3, 4, 5, 7, 8, 14, 15, 16, 18, 19, 21, 85, 98, 99,
  ];

  // FIXME: update the eventCodes array with the corresponding event codes
  const eventCodes = [
    "2025mndu2_official",
    "2025ilch_official",
    "2025cur_official",
    "2023ilch_training",
    "2023mose_training",
    "2023arc_training",
    "2023rr_testing",
    "2024ksla_training",
    "2024ilch_training",
    "2024joh_training",
    "2024rr_testing",
    "2024witw_training",
    "2025ilch_testing",
    "2025mndu2_testing",
    "2025week0_training",
    "2025week0_training",
  ];

  try {
    const events = await mongoose.connection.db
      .collection("events")
      .find()
      .toArray();
    console.log("Events:", events);

    const collection = mongoose.connection.db.collection(
      "teamMatchPerformances"
    );

    for (let i = 0; i < eventCodes.length; i++) {
      const eventCode = eventCodes[i];
      const eventNumber = eventNumbers[i];
      const event = events.find((e) => e.code === eventCode);
      if (!event) {
        console.log("Event not found:", eventCode);
      } else {
        console.log(
          "Updating event number:",
          eventNumber,
          "to ObjectId:",
          event._id
        );
        const res = await collection.updateMany(
          { eventNumber: eventNumber },
          [{ $set: { eventNumber: { $toObjectId: event._id } } }] // Aggregation pipeline update operator
        );
        console.log("Modified Count:", res.modifiedCount);
      }
    }
  } catch (err) {
    console.error("Error occurred:", err);
  } finally {
    mongoose.disconnect();
  }
}

async function displayAllEventNumbers() {
  try {
    const distinctEventNumbers = await mongoose.connection.db
      .collection("teamMatchPerformances")
      .distinct("eventNumber");
    console.log("Event Numbers:", distinctEventNumbers);
  } catch (err) {
    console.error("Error occurred:", err);
  } finally {
    mongoose.disconnect();
  }
}

// Run the update once the connection is established
mongoose.connection.once("open", () => {
  // displayAllEventNumbers();

  // comment the previous line and uncomment the next line after updating the changeTypeOfEventCodes
  // to populate the mapping from event numbers to event codes

  changeTypeOfEventCodes();
});
