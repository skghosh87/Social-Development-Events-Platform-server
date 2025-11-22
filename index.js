const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    // ডেটাবেজ ও কালেকশন রেফারেন্স
    const database = client.db("socialdevelopment");
    const eventsCollection = database.collection("events");
    const joinedEventsCollection = database.collection("joinedEvents");

    // -------------------------------------------------------------------
    // 1st. Event API রুট method: Post (POST/api/events)
    // -------------------------------------------------------------------

    app.post("/api/events", async (req, res) => {
      const newEvent = req.body;

      if (!newEvent.eventName || !newEvent.organizerEmail) {
        return res
          .status(400)
          .send({ success: false, message: "Missing required fields." });
      }

      try {
        const result = await eventsCollection.insertOne(newEvent);
        res.send({
          success: true,
          insertedId: result.insertedId,
          message: "Event created successfully!",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to insert event into database.",
        });
      }
    });

    //--------------------------------------------
    // 2nd. Upcoming Events API রুট (GET/api/events)
    //----------------------------------------------
    app.get("/api/events", async (req, res) => {
      const today = new Date();
      const query = {
        eventDate: {
          $gte: today.toISOString(),
        },
      };
      try {
        const events = await eventsCollection.find(query).toArray();
        res.send(events);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch upcoming events.",
        });
      }
    });

    //------------------------------------------
    //3rd.
    //------------------------------------------

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Social Development Events Server is Running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
