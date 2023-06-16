const express = require("express");
const app = express();
const cors = require("cors");
let jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
require("dotenv").config();
app.use(cors());
app.use(express.json());
// -------------------------

const stripe = require("stripe")(process.env.PAYMENT_SK_TEST);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@cluster0.ean6llt.mongodb.net/?retryWrites=true&w=majority`;

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
    // await client.connect();

    const classesDatabase = client
      .db("ArtisticDB")
      .collection("classesCollection");
    const usersDatabase = client
      .db("ArtisticDB")
      .collection("usersCollections");
    const cartDatabase = client.db("ArtisticDB").collection("cartCollection");
    const paymentDatabase = client
      .db("ArtisticDB")
      .collection("paymentsCollection");

    // --------------------------------------------------

    const verifyJWT = (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorize access" });
      }
      const token = authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
          return res.status(403).send({ error: true, message: "Forbidden" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // payment manage
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      // console.log(price);
      if (price) {
        const amount = parseFloat(price) * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
        // res.send(paymentIntent);
      }
    });

    app.get("/user/payments/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { user_email: email };
      const result = await paymentDatabase
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/user/payments-details", verifyJWT, async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);
      const result = await paymentDatabase.insertOne(paymentInfo);
      res.send(result);
    });

    // add to cart---------------------------

    app.post("/add-to-cart/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { email } = req.body;

      if (req.decoded.email !== email) {
        return res.send({ isUser: false });
      }

      const query = { _id: new ObjectId(id) };
      const findClass = await classesDatabase.findOne(query);

      // Remove the _id property from the findClass object
      delete findClass._id;

      const cartDetails = { ...findClass, user_email: email };

      const cartAdded = await cartDatabase.insertOne(cartDetails);

      res.send(cartAdded);
    });

    app.get("/user/added-carts/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ isUser: false });
      }
      const query = { user_email: email };
      const addedCarts = await cartDatabase.find(query).toArray();
      res.send(addedCarts);
    });

    //Enrolled class manage

    app.get("/user/enrolled-classes/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ isUser: false });
      }
      const query = { user_email: email };
      const result = await paymentDatabase
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    app.delete("/user/delete-cart", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const name = req.query.name;
      console.log(email, name);

      const query = {
        user_email: email,
        class_name: name,
      };

      const result = await cartDatabase.deleteOne(query);
      res.send(result);

      // Handle the request and send a response
    });

    // manage classes----------------------------------
    app.get("/classes", async (req, res) => {
      const cursor = await classesDatabase.find().toArray();
      res.send(cursor);
    });

    app.delete("/class-delete/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesDatabase.deleteOne(query);
      res.send(result);
    });

    app.patch("/class-update", verifyJWT, async (req, res) => {
      const { name } = req.body;
      // console.log(name);
      const query = { class_name: name };
      const findClass = await classesDatabase.findOne(query);
      if (!findClass) {
        // Handle the case when the document is not found
        return res.status(404).send("Class not found");
      }
      const availableSeats = parseInt(findClass.available_seats);
      const enrolledStudents = parseInt(findClass.enrolled_students);
      const doc = {
        $set: {
          available_seats: availableSeats - 1,
          enrolled_students: enrolledStudents + 1,
        },
      };
      const result = await classesDatabase.updateOne(findClass, doc);
      res.send(result);
    });

    app.patch("/class-feedback/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { feedback } = req.body;
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };
      const query = { _id: new ObjectId(id) };
      const result = await classesDatabase.updateOne(query, updateDoc);
      res.send(result);
    });

    // JWT MANAGE
    app.post("/JWT-Token", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // manage users

    app.get("/manage-user/newUser/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: { $regex: new RegExp(email, "i") } };

      if (req.decoded.email.toLowerCase() !== email.toLowerCase()) {
        return res.send({ isUser: false });
      }

      const findUser = await usersDatabase.findOne(query);

      if (!findUser) {
        console.log("false");
      }

      const userResult = { IsUser: findUser?.roll === "users" };
      res.send(userResult);
    });

    app.get("/manage-user/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      if (req.decoded.email !== email) {
        return res.send({ instructor: false });
      }
      const findInstructor = await usersDatabase.findOne(query);
      const instructorResult = {
        instructor: findInstructor?.roll === "instructor",
      };
      res.send(instructorResult);
    });

    app.get("/manage-user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }
      const findAdmin = await usersDatabase.findOne(query);
      const result = { admin: findAdmin?.roll === "admin" };
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const info = req.body;
      const query = { email: info.email };
      const isUserAlreadyHave = await usersDatabase.findOne(query);
      if (isUserAlreadyHave) {
        return "user already exist";
      }
      const result = await usersDatabase.insertOne(info);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await usersDatabase.find().toArray();
      res.send(result);
    });
    // app.get("/users", verifyJWT, async (req, res) => {
    //   const result = await usersDatabase.find().toArray();
    //   res.send(result);
    // });

    // manage user roll
    app.patch("/user-roll/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const doc = {
        $set: {
          roll: "instructor",
        },
      };
      const updateUser = await usersDatabase.updateOne(query, doc);
      res.send(updateUser);
    });

    app.patch("/user-admin/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const doc = {
        $set: {
          roll: "admin",
        },
      };
      const updateUser = await usersDatabase.updateOne(query, doc);
      res.send(updateUser);
    });

    // manage class status

    app.post("/class-add/:email", verifyJWT, async (req, res) => {
      const data = req.body;
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.status(403).send({ error: true, message: "Forbidden access" });
      }
      const result = await classesDatabase.insertOne(data);
      res.send(result);
    });

    app.get("/classes/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.status(403).send({ error: true, message: "Forbidden access" });
      }
      const query = { instructor_email: email };
      const result = await classesDatabase.find(query).toArray();
      res.send(result);
    });

    app.patch("/class-denied/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const doc = {
        $set: {
          status: "denied",
        },
      };
      const StatusUpdate = await classesDatabase.updateOne(query, doc);
      res.send(StatusUpdate);
    });

    app.patch("/class-approved/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const doc = {
        $set: {
          status: "approved",
        },
      };
      const StatusUpdate = await classesDatabase.updateOne(query, doc);
      res.send(StatusUpdate);
    });

    // -------------------------------------------------
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

// -----------------------------
app.get("/", (req, res) => {
  res.send("hello from server");
});

app.listen(port, () => {
  console.log(`this port in running on port: ${port}`);
});
