const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, "data", "tasks.json");
const sessions = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function readDb() {
  const file = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(file);
}

async function writeDb(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

async function currentUser(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const userId = token ? sessions.get(token) : null;
  if (!userId) return null;

  const db = await readDb();
  return db.users.find((user) => user.id === userId) || null;
}

async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user) {
    return res.status(401).json({ message: "Please login to continue." });
  }

  req.user = user;
  next();
}

function canManageTask(user, task) {
  return (
    user.role === "admin" ||
    task.assigneeId === user.id ||
    task.createdBy === user.id
  );
}

function enrichTask(task, users) {
  const assignee = users.find((user) => user.id === task.assigneeId);
  const creator = users.find((user) => user.id === task.createdBy);
  return {
    ...task,
    assigneeName: assignee?.name || "Unassigned",
    creatorName: creator?.name || "Unknown"
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", storage: "local-json" });
});

app.post("/api/auth/register", async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();

  if (!name || !email || password.length < 6) {
    return res.status(400).json({
      message: "Enter a name, valid email, and password with 6+ characters."
    });
  }

  if (db.users.some((user) => user.email === email)) {
    return res.status(409).json({ message: "This email is already registered." });
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    password,
    role: "member"
  };

  db.users.push(user);
  await writeDb(db);

  const token = crypto.randomUUID();
  sessions.set(token, user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const db = await readDb();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();
  const user = db.users.find(
    (item) => item.email === email && item.password === password
  );

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = crypto.randomUUID();
  sessions.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  sessions.delete(token);
  res.json({ message: "Logged out successfully." });
});

app.get("/api/users", requireAuth, async (req, res) => {
  const db = await readDb();
  res.json(db.users.map(publicUser));
});

app.get("/api/tasks", requireAuth, async (req, res) => {
  const db = await readDb();
  const visibleTasks =
    req.user.role === "admin"
      ? db.tasks
      : db.tasks.filter(
          (task) => task.assigneeId === req.user.id || task.createdBy === req.user.id
        );

  res.json(visibleTasks.map((task) => enrichTask(task, db.users)));
});

app.post("/api/tasks", requireAuth, async (req, res) => {
  const db = await readDb();
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const priority = req.body.priority || "Medium";
  const dueDate = req.body.dueDate || "";
  const assigneeId = req.body.assigneeId || req.user.id;

  if (!title || !description || !dueDate) {
    return res.status(400).json({ message: "Title, description, and due date are required." });
  }

  if (!db.users.some((user) => user.id === assigneeId)) {
    return res.status(400).json({ message: "Choose a valid assignee." });
  }

  const task = {
    id: crypto.randomUUID(),
    title,
    description,
    status: req.body.status || "To Do",
    priority,
    dueDate,
    assigneeId,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.tasks.unshift(task);
  await writeDb(db);
  res.status(201).json(enrichTask(task, db.users));
});

app.put("/api/tasks/:id", requireAuth, async (req, res) => {
  const db = await readDb();
  const task = db.tasks.find((item) => item.id === req.params.id);

  if (!task) {
    return res.status(404).json({ message: "Task not found." });
  }

  if (!canManageTask(req.user, task)) {
    return res.status(403).json({ message: "You are not allowed to edit this task." });
  }

  const editableFields = ["title", "description", "status", "priority", "dueDate", "assigneeId"];
  for (const field of editableFields) {
    if (req.body[field] !== undefined) {
      task[field] = req.body[field];
    }
  }
  task.updatedAt = new Date().toISOString();

  await writeDb(db);
  res.json(enrichTask(task, db.users));
});

app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
  const db = await readDb();
  const task = db.tasks.find((item) => item.id === req.params.id);

  if (!task) {
    return res.status(404).json({ message: "Task not found." });
  }

  if (!canManageTask(req.user, task)) {
    return res.status(403).json({ message: "You are not allowed to delete this task." });
  }

  db.tasks = db.tasks.filter((item) => item.id !== req.params.id);
  await writeDb(db);
  res.json({ message: "Task deleted successfully." });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Task Management Application running at http://localhost:${PORT}`);
});
