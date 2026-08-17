# Pathways — School Course & Study-Path Planner

A small full-stack app backed by **CognoDB** (a managed graph database, openCypher over Bolt)
that helps students figure out what courses they're eligible for, find study buddies, and
lets anyone browse the school's course catalog and prerequisite chains.

## The use case

Every course in the school has prerequisites — sometimes chained several courses deep
(e.g. *Algebra I → Algebra II → Calculus*). Students are enrolled in courses, have completed
some, and are friends with classmates. Teachers are experts in a subject and teach specific
courses.

The app answers three real questions:
1. **"Am I eligible for Advanced Physics?"** — walk the full prerequisite chain and compare it
   against what the student has completed.
2. **"Who should I study with?"** — find classmates who share two or more of my enrolled courses.
3. **"What does this course require, and who teaches it?"** — browse the catalog and trace any
   course's full prerequisite tree.

## Why a graph database?

The two hardest questions above are naturally **path** questions, not row lookups:

- **Prerequisite chains are variable-depth.** *Advanced Physics* might require *Chemistry*,
  which requires *General Science* — a chain of unknown length. In a relational schema this
  needs a recursive CTE (`WITH RECURSIVE`) with careful cycle-guarding. In Cypher it's one line:
  `(target)-[:REQUIRES*1..5]->(prereq)`. Add a new link to the chain and the same query still
  works with zero schema or query changes.
- **"Classmates who share 2+ courses" is a self-join relational databases handle awkwardly.**
  It requires joining the enrollment table to itself, grouping, and filtering on the count —
  and it gets worse the more relationship "hops" you add (e.g. "classmates of my study buddies
  who also know someone taking Calculus"). In the graph this is a single pattern match:
  `(me)-[:ENROLLED_IN]->(c)<-[:ENROLLED_IN]-(other)` with a `count()` and `WHERE`.
- **The data is relationships, not attributes.** Almost every interesting question here
  ("who", "what connects to what", "how deep") is about traversing edges, which is exactly
  what a graph database is optimized for, both in query expressiveness and in read performance
  (index-free adjacency avoids the join cost that grows with relational table size).

A relational schema *could* model this, but every query above would need more SQL, more joins,
and would degrade faster as the school's data grows. The graph model keeps every query close
to how a person would actually describe the question in words.

## Data model

```
        REQUIRES               REQUIRES
   ┌───────────────┐      ┌───────────────┐
   │               ▼      │               ▼
(:Course)──BELONGS_TO──►(:Subject)◄──EXPERT_IN──(:Teacher)
   │                                              ▲
   │                                              │
   └──────────────TAUGHT_BY──────────────────────►┘

(:Student)──ENROLLED_IN──►(:Course)
(:Student)──COMPLETED────►(:Course)
(:Student)──FRIENDS_WITH─►(:Student)
```

**Nodes**
| Label       | Properties                     |
|-------------|---------------------------------|
| `Student`   | `id`, `name`, `grade`           |
| `Teacher`   | `id`, `name`                    |
| `Course`    | `code`, `name`, `credits`       |
| `Subject`   | `name`                          |

**Relationships**
| Relationship        | From → To              | Meaning                              |
|----------------------|-------------------------|---------------------------------------|
| `ENROLLED_IN`        | Student → Course        | currently taking                     |
| `COMPLETED`          | Student → Course        | already finished                     |
| `REQUIRES`           | Course → Course         | prerequisite (chains, variable depth) |
| `TAUGHT_BY`           | Course → Teacher        | who teaches this course              |
| `BELONGS_TO`         | Course → Subject        | subject grouping                     |
| `EXPERT_IN`          | Teacher → Subject       | teacher's specialty                  |
| `FRIENDS_WITH`       | Student → Student       | social graph, used for study buddies |

## Tech stack

- **Database:** CognoDB Cloud (free `c0` tier), accessed via the official `neo4j-driver` for Node.js
- **Backend:** Node.js + Express, REST API, all queries parameterised
- **Frontend:** plain HTML/CSS/JS (no framework, kept intentionally simple and fast)

## Project structure

```
school-graph-app/
├── src/
│   ├── db.js          # CognoDB/Neo4j driver setup, connection check, query runner
│   ├── queries.js      # every Cypher query used by the app, documented
│   └── server.js       # Express app, REST routes, error handling
├── scripts/
│   └── seed.js         # loads sample students/teachers/courses/subjects + relationships
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js           # frontend logic, fetches the REST API
├── .env.example         # template — copy to .env and fill in real credentials
└── package.json
```

## Setup & run

### 1. Create a CognoDB Cloud instance
1. Go to https://console.cognodb.com/signup and sign up (no credit card needed).
2. From the console, create a free **c0** instance and pick a region (provisions in under a minute).
3. Copy the connection URI (`bolt+s://<instance-id>.databases.cognodb.cloud`) and the generated
   password for user `cognodb` — **the password is shown only once**.

### 2. Configure environment variables
```bash
cp .env.example .env
```
Edit `.env` and fill in your real values:
```
COGNODB_URI=bolt+s://<your-instance-id>.databases.cognodb.cloud
COGNODB_USER=cognodb
COGNODB_PASSWORD=<your-generated-password>
PORT=3000
```
`.env` is git-ignored — credentials are never committed.

### 3. Install dependencies
```bash
npm install
```

### 4. Seed the database
```bash
npm run seed
```
This clears any existing data and creates ~20 students, 5 teachers, 12 courses (with
prerequisite chains), 5 subjects, and enrollment/friendship relationships.

### 5. Run the app
```bash
npm start
```
Open http://localhost:3000

## Main queries, explained

All queries live in `src/queries.js` and are called with parameters (never string-concatenated).

- **`getStudentCourses(studentId)`** — 1-hop: a student's enrolled courses with their teacher.
- **`getPrerequisiteChain(courseCode)`** — **multi-hop (2-5 hops)**: variable-length traversal
  `(target)-[:REQUIRES*1..5]->(prereq)` that walks the *entire* prerequisite tree for a course,
  however deep it goes, in one query.
- **`checkEligibility(studentId, courseCode)`** — combines the prerequisite chain with the
  student's completed courses to return exactly which prerequisites are missing.
- **`getStudyBuddies(studentId, minSharedCourses)`** — the SQL-awkward query: finds classmates
  who share N or more courses via `(me)-[:ENROLLED_IN]->(c)<-[:ENROLLED_IN]-(other)`, grouped
  and filtered by shared-course count.
- **`getTeachersForSubject(subjectName)`** — finds teachers expert in a subject and how many
  courses they already teach there.
- **`listStudents()` / `listCourses()` / `getCourseDetail(code)`** — straightforward lookups used
  to populate the roster, the course catalog grid, and a single course's detail panel.
- **`getGraphStats()`** — node counts by label, shown in the stats strip at the top of the page.

## Error handling

If CognoDB is unreachable, the API returns a `503` with a friendly JSON error instead of
crashing, and the frontend shows a banner + inline empty/error states rather than a blank page.

## Screenshots

_Add screenshots of the Student Dashboard and Course Explorer here before submitting._

## Demo

- Hosted app: _add your deployed URL here_
- Screen recording: _add your Loom/recording link here_
