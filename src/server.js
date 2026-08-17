require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { verifyConnection } = require('./db');
const queries = require('./queries');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// wraps a route handler so a DB hiccup returns a clean 503 instead of crashing the server
function route(handler) {
  return async (req, res) => {
    try {
      const data = await handler(req);
      res.json({ ok: true, data });
    } catch (err) {
      console.error('API error:', err.message);
      res.status(503).json({ ok: false, error: 'Database is unreachable right now. Try again in a moment.' });
    }
  };
}

app.get('/api/health', route(async () => {
  const connected = await verifyConnection();
  if (!connected) throw new Error('db down');
  return { status: 'ok' };
}));

app.get('/api/stats', route(() => queries.getGraphStats()));

app.get('/api/students', route(() => queries.listStudents()));

app.get('/api/courses', route(() => queries.listCourses()));

app.get('/api/courses/:code', route((req) => queries.getCourseDetail(req.params.code)));

app.get('/api/courses/:code/prerequisites', route((req) => queries.getPrerequisiteChain(req.params.code)));

app.get('/api/students/:id/courses', route((req) => queries.getStudentCourses(req.params.id)));

app.get('/api/students/:id/eligibility/:code', route((req) =>
  queries.checkEligibility(req.params.id, req.params.code)
));

app.get('/api/students/:id/study-buddies', route((req) => {
  const min = req.query.min ? parseInt(req.query.min, 10) : 2;
  return queries.getStudyBuddies(req.params.id, min);
}));

app.get('/api/subjects/:name/teachers', route((req) => queries.getTeachersForSubject(req.params.name)));

app.listen(PORT, async () => {
  console.log(`Listening on http://localhost:${PORT}`);
  await verifyConnection();
});
