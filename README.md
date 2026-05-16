# Task Management Application

A full-stack internship project for creating, updating, assigning, and tracking tasks. It includes authentication, role-based access, CRUD APIs, dashboard filters, and a responsive frontend.

## Features

- User registration and login
- Role-based authorization for admin and member users
- Create, read, update, and delete tasks
- Status, priority, assignee, and due date tracking
- Dashboard statistics and filters
- Responsive web interface for desktop and mobile screens
- Local JSON persistence so the app runs without database setup

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@example.com | admin123 |
| Member | member@example.com | member123 |

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:4000` in your browser.

If dependencies are already available in the parent workspace, you can run `npm start` directly.

## API Summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

## Project Structure

```text
new project2/
  server.js
  package.json
  README.md
  public/
    index.html
    styles.css
    script.js
  data/
    tasks.json
```
