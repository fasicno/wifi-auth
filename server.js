import express from "express";
import nodemailer from "nodemailer";
import sqlite3 from "sqlite3";
import cors from "cors";
import dotenv from "dotenv";
import { open } from "sqlite";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ------------------ DATABASE INIT ------------------
let db;
async function initDB() {
  db = await open({
    filename: "wifi.db",
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deviceName TEXT,
      password TEXT,
      status TEXT,
      createdAt TEXT
    );
  `);
}
initDB();

// ------------------ EMAIL TRANSPORT ------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.OWNER_EMAIL,
    pass: process.env.OWNER_APP_PASSWORD
  }
});

// ------------------ API 1: FRIEND REQUESTS WIFI ------------------
app.post("/api/request", async (req, res) => {
  const { deviceName, password } = req.body;

  const result = await db.run(
    "INSERT INTO requests (deviceName, password, status, createdAt) VALUES (?, ?, ?, datetime('now'))",
    [deviceName, password, "pending"]
  );

  const requestId = result.lastID;

  // Send email to OWNER
  await transporter.sendMail({
    from: process.env.OWNER_EMAIL,
    to: process.env.OWNER_EMAIL,
    subject: "Wi-Fi Access Request",
    html: `
      <h2>New Wi-Fi Request</h2>
      <p>Device Name: <b>${deviceName}</b></p>
      <p>Password Requested: <b>${password}</b></p>
      <p>
        <a href="http://localhost:4000/api/approve/${requestId}">Approve</a> |
        <a href="http://localhost:4000/api/deny/${requestId}">Deny</a>
      </p>
    `
  });

  res.json({ message: "Wi-Fi request sent to owner. Please wait for approval." });
});

// ------------------ API 2: APPROVE DEVICE ------------------
app.get("/api/approve/:id", async (req, res) => {
  const id = req.params.id;
  await db.run("UPDATE requests SET status = 'approved' WHERE id = ?", [id]);
  res.send("<h1>Wi-Fi Access Granted ✔</h1>");
});

// ------------------ API 3: DENY DEVICE ------------------
app.get("/api/deny/:id", async (req, res) => {
  const id = req.params.id;
  await db.run("UPDATE requests SET status = 'denied' WHERE id = ?", [id]);
  res.send("<h1>Wi-Fi Access Denied ✖</h1>");
});

// ------------------ API 4: ADMIN PANEL DATA ------------------
app.get("/api/requests", async (req, res) => {
  const rows = await db.all("SELECT * FROM requests ORDER BY createdAt DESC");
  res.json(rows);
});

// ------------------ START SERVER ------------------
app.listen(4000, () => console.log("Server running at http://localhost:4000"));
