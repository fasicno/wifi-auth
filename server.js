const express = require("express");
const nodemailer = require("nodemailer");
const sqlite3 = require("sqlite3");
const cors = require("cors");
const dotenv = require("dotenv");
const { open } = require("sqlite");
const path = require("path");
const session = require("express-session");

dotenv.config();

const app = express();

const whitelist = [
    'https://4001-firebase-wifi-auth-1763968397242.cluster-d5vecjrg5rhlkrz6nm4jty7avc.cloudworkstations.dev',
    'https://9000-firebase-wifi-auth-1763968397242.cluster-d5vecjrg5rhlkrz6nm4jty7avc.cloudworkstations.dev',
    'http://localhost:3000',
    'http://localhost:4001'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'build')));
app.use(express.static(__dirname));

// ------------------ SESSION ------------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

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
      email TEXT,
      otp TEXT,
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

// ------------------ AUTH MIDDLEWARE ------------------
const requireAuth = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.redirect('/admin-login');
    }
};

// ------------------ API 1: FRIEND REQUESTS WIFI ------------------
app.post("/api/request", async (req, res) => {
  const { deviceName, email } = req.body;

  try {
    const result = await db.run(
      "INSERT INTO requests (deviceName, email, status, createdAt) VALUES (?, ?, ?, datetime('now'))",
      [deviceName, email, "pending"]
    );

    const requestId = result.lastID;
    const baseURL = `http://localhost:4001`;

    await transporter.sendMail({
      from: process.env.OWNER_EMAIL,
      to: process.env.OWNER_EMAIL,
      subject: "Wi-Fi Access Request",
      html: `
        <h2>New Wi-Fi Request</h2>
        <p>Device Name: <b>${deviceName}</b></p>
        <p>Email: <b>${email}</b></p>
        <p>
          <a href="${baseURL}/api/approve/${requestId}" target="_blank">Approve</a> |
          <a href="${baseURL}/api/deny/${requestId}" target="_blank">Deny</a>
        </p>
      `
    });

    res.json({ message: "Wi-Fi request sent to owner. Please wait for approval.", requestId });
  } catch (error) {
    console.error("Error in /api/request:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

// ------------------ API 2: APPROVE DEVICE (OTP) ------------------
app.get("/api/approve/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const request = await db.get("SELECT * FROM requests WHERE id = ?", [id]);
    if (request && request.status === "pending") {
      const otp = Math.random().toString().slice(2, 8); // 6-digit OTP
      await db.run("UPDATE requests SET otp = ?, status = 'approved' WHERE id = ?", [otp, id]);

      // Send OTP to user
      await transporter.sendMail({
        from: process.env.OWNER_EMAIL,
        to: request.email,
        subject: "Your Wi-Fi Access OTP",
        html: `
          <h2>Your Wi-Fi Access OTP</h2>
          <p>Your OTP is: <strong>${otp}</strong></p>
          <p>Please use this to set your Wi-Fi password.</p>
        `
      });

      res.send(`
        <h1>Wi-Fi Access Approved ✔</h1>
        <p>An OTP has been sent to ${request.email}.</p>
        <script>
          setTimeout(() => {
            window.location.href = "/admin"; 
          }, 2000);
        </script>
      `);
    } else {
      res.send("Request already processed or not found.");
    }
  } catch (error) {
    console.error("Error in /api/approve:", error);
    res.status(500).send("An internal server error occurred.");
  }
});

// ------------------ API 3: SET USER PASSWORD (with OTP) ------------------
app.post("/api/set-password", async (req, res) => {
  const { email, otp, password } = req.body;

  try {
    const request = await db.get("SELECT * FROM requests WHERE email = ? AND status = 'approved'", [email]);

    if (request && request.otp === otp) {
      await db.run("UPDATE requests SET password = ? WHERE id = ?", [password, request.id]);
      res.json({ success: true, message: "Password set successfully!" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP or email." });
    }
  } catch (error) {
    console.error("Error in /api/set-password:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

// ------------------ API 4: DENY DEVICE ------------------
app.get("/api/deny/:id", async (req, res) => {
  const id = req.params.id;
  await db.run("UPDATE requests SET status = 'denied' WHERE id = ?", [id]);
  res.send(`
    <h1>Wi-Fi Access Denied ✖</h1>
    <script>
      setTimeout(() => {
        window.location.href = "/admin";
      }, 2000);
    </script>
  `);
});

// ------------------ API 5: ADMIN PANEL DATA ------------------
app.get("/api/requests", requireAuth, async (req, res) => {
  const rows = await db.all("SELECT * FROM requests ORDER BY createdAt DESC");
  res.json(rows);
});

// ------------------ API 6: REMOVE REQUEST ------------------
app.delete("/api/remove/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  await db.run("DELETE FROM requests WHERE id = ?", [id]);
  res.json({ message: "Request removed successfully." });
});

// ------------------ API 7: REQUEST STATUS (for friend) ------------------
app.get("/api/request/status/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const request = await db.get("SELECT id, status FROM requests WHERE id = ?", [id]);
        if (request) {
            res.json(request);
        } else {
            res.status(404).json({ message: "Request not found." });
        }
    } catch (error) {
        console.error(`Error fetching status for request ${id}:`, error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
});

// ------------------ ADMIN LOGIN ------------------
app.get('/admin-login', (req, res) => {
    res.sendFile(path.resolve("login.html"));
});

app.post('/api/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.redirect('/admin-login');
    }
});

// ------------------ ADMIN LOGOUT ------------------
app.get('/api/admin-logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/admin');
        }
        res.clearCookie('connect.sid');
        res.redirect('/admin-login');
    });
});

app.get("/admin", requireAuth, (req, res) => {
  res.sendFile(path.resolve("admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.resolve(path.join(__dirname, 'build', 'index.html')));
});

// ------------------ START SERVER & GRACEFUL SHUTDOWN ------------------
const server = app.listen(4001, () => console.log("Server running at http://localhost:4001"));

const shutdown = (signal) => {
    console.log(`${signal} received. Shutting down gracefully.`);
    server.close(async () => {
        console.log('HTTP server closed.');
        try {
            if (db) {
                await db.close();
                console.log('Database connection closed.');
            }
        } catch (err) {
            console.error('Error closing database:', err.message);
        }
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
