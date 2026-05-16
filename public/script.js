const state = {
  token: localStorage.getItem("taskflow-token"),
  user: null,
  users: [],
  tasks: [],
  filters: {
    status: "All",
    priority: "All"
  }
};

const authView = document.querySelector("#authView");
const dashboardView = document.querySelector("#dashboardView");
const loginTab = document.querySelector("#loginTab");
const registerTab = document.querySelector("#registerTab");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const authMessage = document.querySelector("#authMessage");
const taskForm = document.querySelector("#taskForm");
const taskMessage = document.querySelector("#taskMessage");
const taskList = document.querySelector("#taskList");
const statsGrid = document.querySelector("#statsGrid");
const assigneeSelect = document.querySelector("#assigneeSelect");
const statusFilter = document.querySelector("#statusFilter");
const priorityFilter = document.querySelector("#priorityFilter");

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.token}`
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }
  return data;
}

function showMessage(element, text, type = "error") {
  element.textContent = text;
  element.className = `message ${type}`;
  if (text) {
    setTimeout(() => {
      element.textContent = "";
    }, 3200);
  }
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", !isLogin);
  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);
  authMessage.textContent = "";
}

function setView(view) {
  authView.classList.toggle("hidden", view !== "auth");
  dashboardView.classList.toggle("hidden", view !== "dashboard");
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("taskflow-token", state.token);
    await loadDashboard();
  } catch (error) {
    showMessage(authMessage, error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const formData = new FormData(registerForm);
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("taskflow-token", state.token);
    await loadDashboard();
  } catch (error) {
    showMessage(authMessage, error.message);
  }
}

async function loadDashboard() {
  if (!state.user) {
    const profile = await api("/api/auth/me");
    state.user = profile.user;
  }

  const [users, tasks] = await Promise.all([api("/api/users"), api("/api/tasks")]);
  state.users = users;
  state.tasks = tasks;

  document.querySelector("#userName").textContent = state.user.name;
  document.querySelector("#userRole").textContent = state.user.role;
  renderAssignees();
  renderStats();
  renderTasks();
  setView("dashboard");
}

function renderAssignees() {
  assigneeSelect.innerHTML = state.users
    .map((user) => `<option value="${user.id}">${user.name}</option>`)
    .join("");
  assigneeSelect.value = state.user.id;
}

function renderStats() {
  const total = state.tasks.length;
  const done = state.tasks.filter((task) => task.status === "Done").length;
  const inProgress = state.tasks.filter((task) => task.status === "In Progress").length;
  const overdue = state.tasks.filter(
    (task) => task.status !== "Done" && new Date(task.dueDate) < startOfToday()
  ).length;

  const stats = [
    ["Total Tasks", total],
    ["In Progress", inProgress],
    ["Completed", done],
    ["Overdue", overdue]
  ];

  statsGrid.innerHTML = stats
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function filteredTasks() {
  return state.tasks.filter((task) => {
    const statusMatch = state.filters.status === "All" || task.status === state.filters.status;
    const priorityMatch = state.filters.priority === "All" || task.priority === state.filters.priority;
    return statusMatch && priorityMatch;
  });
}

function renderTasks() {
  const tasks = filteredTasks();
  document.querySelector("#taskCount").textContent = `${tasks.length} visible records`;

  if (!tasks.length) {
    taskList.innerHTML = `<div class="empty-state">No tasks match the selected filters.</div>`;
    return;
  }

  taskList.innerHTML = tasks
    .map(
      (task) => `
      <article class="task-card">
        <div class="task-head">
          <div>
            <span class="status-pill ${slug(task.status)}">${task.status}</span>
            <h3>${escapeHtml(task.title)}</h3>
          </div>
          <span class="priority ${slug(task.priority)}">${task.priority}</span>
        </div>
        <p>${escapeHtml(task.description)}</p>
        <div class="task-meta">
          <span>Due ${formatDate(task.dueDate)}</span>
          <span>${escapeHtml(task.assigneeName)}</span>
        </div>
        <div class="task-actions">
          <button type="button" onclick="editTask('${task.id}')">Edit</button>
          <button type="button" onclick="deleteTask('${task.id}')">Delete</button>
        </div>
      </article>
    `
    )
    .join("");
}

function slug(value) {
  return String(value).toLowerCase().replace(/\s+/g, "-");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function saveTask(event) {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const payload = Object.fromEntries(formData);
  const isEditing = Boolean(payload.id);
  const url = isEditing ? `/api/tasks/${payload.id}` : "/api/tasks";
  const method = isEditing ? "PUT" : "POST";
  delete payload.id;

  try {
    await api(url, {
      method,
      body: JSON.stringify(payload)
    });
    resetForm();
    await loadDashboard();
    showMessage(taskMessage, isEditing ? "Task updated successfully." : "Task added successfully.", "success");
  } catch (error) {
    showMessage(taskMessage, error.message);
  }
}

window.editTask = function editTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  taskForm.id.value = task.id;
  taskForm.title.value = task.title;
  taskForm.description.value = task.description;
  taskForm.status.value = task.status;
  taskForm.priority.value = task.priority;
  taskForm.dueDate.value = task.dueDate;
  taskForm.assigneeId.value = task.assigneeId;
  document.querySelector("#formTitle").textContent = "Edit Task";
  document.querySelector("#saveTaskButton").textContent = "Save Changes";
  document.querySelector("#cancelEditButton").classList.remove("hidden");
  taskForm.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.deleteTask = async function deleteTask(id) {
  if (!confirm("Delete this task?")) return;

  try {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    await loadDashboard();
    showMessage(taskMessage, "Task deleted successfully.", "success");
  } catch (error) {
    showMessage(taskMessage, error.message);
  }
};

function resetForm() {
  taskForm.reset();
  taskForm.id.value = "";
  taskForm.status.value = "To Do";
  taskForm.priority.value = "Medium";
  taskForm.assigneeId.value = state.user?.id || "";
  document.querySelector("#formTitle").textContent = "Create Task";
  document.querySelector("#saveTaskButton").textContent = "Add Task";
  document.querySelector("#cancelEditButton").classList.add("hidden");
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn(error.message);
  }
  localStorage.removeItem("taskflow-token");
  state.token = null;
  state.user = null;
  setView("auth");
}

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));
loginForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);
taskForm.addEventListener("submit", saveTask);
document.querySelector("#cancelEditButton").addEventListener("click", resetForm);
document.querySelector("#logoutButton").addEventListener("click", logout);
statusFilter.addEventListener("change", (event) => {
  state.filters.status = event.target.value;
  renderTasks();
});
priorityFilter.addEventListener("change", (event) => {
  state.filters.priority = event.target.value;
  renderTasks();
});

if (state.token) {
  loadDashboard().catch(() => {
    localStorage.removeItem("taskflow-token");
    setView("auth");
  });
}
