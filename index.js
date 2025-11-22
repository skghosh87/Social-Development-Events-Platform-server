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
    //3rd. Single Event Details দেখানোর API রুট (GET /api/events/:id)
    //------------------------------------------

    app.get("/api/events/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid Event ID format." });
      }
      const query = { _id: new ObjectId(id) };
      try {
        const event = await eventsCollection.findOne(query);
        if (!event) {
          return res
            .status(404)
            .send({ success: false, message: "Event not found." });
        }
        res.send(event);
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch event details." });
      }
    });

    // -------------------------------------------------------------------
    // 4th. Joined Events দেখানোর API রুট (GET /api/joined-events/:email)
    // -------------------------------------------------------------------

    app.get("/api/joined-events/:email", async (req, res) => {
      const userEmail = req.params.email;

      try {
        const joinedRecords = await joinedEventsCollection
          .find({ userEmail: userEmail })
          .toArray();

        if (joinedRecords.length === 0) {
          return res.send([]);
        }

        const eventIds = joinedRecords.map(
          (record) => new ObjectId(record.eventId)
        );

        const eventsQuery = { _id: { $in: eventIds } };

        const joinedEvents = await eventsCollection
          .find(eventsQuery)
          .sort({ eventDate: 1 })
          .toArray();

        res.send(joinedEvents);
      } catch (error) {
        console.error("Error fetching joined events:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch joined events." });
      }
    });

    // -------------------------------------------------------------------
    // E. Event Join করার API রুট (POST /api/join-event)
    // -------------------------------------------------------------------

    app.post("/api/join-event", async (req, res) => {
      const { eventId, userEmail } = req.body;

      if (!eventId || !userEmail) {
        return res
          .status(400)
          .send({ success: false, message: "Missing Event ID or User Email." });
      }

      try {
        const existingJoin = await joinedEventsCollection.findOne({
          eventId: eventId,
          userEmail: userEmail,
        });

        if (existingJoin) {
          return res.status(409).send({
            success: false,
            message: "You have already joined this event.",
          });
        }

        const joinRecord = {
          eventId: eventId,
          userEmail: userEmail,
          joinedDate: new Date().toISOString(),
        };

        const result = await joinedEventsCollection.insertOne(joinRecord);

        await eventsCollection.updateOne(
          { _id: new ObjectId(eventId) },
          { $inc: { participants: 1 } }
        );

        res.send({
          success: true,
          insertedId: result.insertedId,
          message: "Successfully joined the event!",
        });
      } catch (error) {
        console.error("Error joining event:", error);
        res.status(500).send({
          success: false,
          message: "Failed to join event due to server error.",
        });
      }
    });

    // -------------------------------------------------------------------
    // F. নিজের তৈরি করা ইভেন্ট লোড করার API রুট (GET /api/my-events/:email)
    // -------------------------------------------------------------------

    app.get("/api/my-events/:email", async (req, res) => {
      const organizerEmail = req.params.email;

      if (!organizerEmail) {
        return res
          .status(400)
          .send({ success: false, message: "Organizer Email is required." });
      }

      try {
        const query = { organizerEmail: organizerEmail };

        const myEvents = await eventsCollection.find(query).toArray();

        res.send(myEvents);
      } catch (error) {
        console.error("Error fetching my events:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch events created by user.",
        });
      }
    });
    // -------------------------------------------------------------------
    // G. ইভেন্ট আপডেট করার API রুট (PUT /api/events/:id)
    // -------------------------------------------------------------------

    app.put("/api/events/:id", async (req, res) => {
      const id = req.params.id;
      const updatedEventData = req.body;
      const { organizerEmail } = updatedEventData;

      if (!ObjectId.isValid(id) || !organizerEmail) {
        return res.status(400).send({
          success: false,
          message: "Invalid ID or missing organizer email.",
        });
      }

      try {
        const query = {
          _id: new ObjectId(id),
          organizerEmail: organizerEmail,
        };

        const updateDoc = {
          $set: {
            eventName: updatedEventData.eventName,
            category: updatedEventData.category,
            location: updatedEventData.location,
            description: updatedEventData.description,
            image: updatedEventData.image,
            eventDate: updatedEventData.eventDate,
          },
        };

        const result = await eventsCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(403).send({
            success: false,
            message: "Forbidden: You can only update events you created.",
          });
        }

        res.send({
          success: true,
          message: "Event updated successfully!",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating event:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update event." });
      }
    });

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
