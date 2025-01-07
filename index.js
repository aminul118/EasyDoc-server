require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

/**
 * -----------------------------------
 * ! Middleware uses
 * -----------------------------------
 */
app.use(cors());
app.use(express.json());

/**
 * -----------------------------------
 * ! Customs Middleware
 * -----------------------------------
 */
const verifyToken = (req, res, next) => {
  // console.log("inside verify token", req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

/**
 * -----------------------------------
 * ! Database Connection
 * -----------------------------------
 */

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.px56e.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    /**
     * -----------------------------------
     * ! Database Collection
     * -----------------------------------
     */
    const db = client.db("easyDoc");
    const doctorCollections = db.collection("doctors");
    const appointmentCollections = db.collection("appointments ");
    const userCollections = db.collection("users");
    /**
     * -----------------------------------
     * ! JWT security related api
     * -----------------------------------
     */
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });
      res.send({ token });
    });

    /**
     * -----------------------------------
     * ! User related api
     * -----------------------------------
     */
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollections.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyToken, async (req, res) => {
      // console.log(req.decoded);
      const result = await userCollections.find().toArray();
      res.send(result);
    });
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollections.deleteOne(query);
      res.send(result);
    });

    /**
     * -----------------------------------
     * ! Admin related api
     * -----------------------------------
     */

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollections.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollections.updateOne(query, update);
      res.send(result);
    });

    /**
     * -----------------------------------
     * ! Doctor related api
     * -----------------------------------
     */

    app.post("/doctors", async (req, res) => {
      const data = req.body;
      const email = { email: data.email };

      const query = await doctorCollections.findOne(email);
      if (query.email === email) {
        return res.status(403).send({ message: "user already exits" });
      }

      const result = await doctorCollections.insertOne(data);
      res.send(result);
    });

    app.get("/doctors", async (req, res) => {
      const { sort, search } = req.query;
      console.log(search);
      const sortOrder = sort === "asc" ? 1 : -1;
      const aggregate = [];

      // Add sorting
      aggregate.push({
        $sort: {
          rating: sortOrder,
        },
      });

      if (search) {
        aggregate.push({
          $match: {
            $or: [
              { specialization: { $regex: search, $options: "i" } },
              { doctorName: { $regex: search, $options: "i" } },
            ],
          },
        });
      }

      const result = await doctorCollections.aggregate(aggregate).toArray();
      res.send(result);
    });

    app.get("/top-rated-doctors", async (req, res) => {
      const aggregate = [
        {
          $sort: { rating: -1 },
        },
        {
          $limit: 8,
        },
        {
          $project: {
            doctorName: 1,
            specialization: 1,
            experience: 1,
            rating: 1,
            image: 1,
          },
        },
      ];
      const result = await doctorCollections.aggregate(aggregate).toArray();
      res.send(result);
    });
    app.get("/doctors/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await doctorCollections.findOne(query);
      res.send(result);
    });

    /**
     * -----------------------------------
     * ! Appointment related api
     * -----------------------------------
     */

    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentCollections.insertOne(appointment);
      res.send(result);
    });

    app.get("/appointments/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const aggregate = [
        {
          $match: query,
        },
        {
          $addFields: {
            doctorIdObject: { $toObjectId: "$doctorId" },
          },
        },
        {
          $lookup: {
            from: "doctors",
            localField: "doctorIdObject",
            foreignField: "_id",
            as: "doctorDetails",
          },
        },
        {
          $unwind: "$doctorDetails",
        },
      ];
      const result = await appointmentCollections
        .aggregate(aggregate)
        .toArray();
      res.send(result);
    });

    app.delete("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await appointmentCollections.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server Running..........");
});

app.listen(port, () => {
  console.log("Server is running on port:", port);
});
