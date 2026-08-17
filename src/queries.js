const { runQuery } = require('./db');

// courses a student is currently taking, plus who teaches each one (1 hop)
function getStudentCourses(studentId) {
  return runQuery(
    `MATCH (s:Student {id: $studentId})-[:ENROLLED_IN]->(c:Course)-[:TAUGHT_BY]->(t:Teacher)
     RETURN c.code AS code, c.name AS name, c.credits AS credits, t.name AS teacher
     ORDER BY c.code`,
    { studentId }
  );
}

// full prerequisite chain for a course, however deep it goes (2-5 hops).
// this is the query that would be a painful recursive CTE in SQL.
function getPrerequisiteChain(courseCode) {
  return runQuery(
    `MATCH path = (target:Course {code: $courseCode})-[:REQUIRES*1..5]->(prereq:Course)
     RETURN DISTINCT prereq.code AS code, prereq.name AS name, length(path) AS depth
     ORDER BY depth`,
    { courseCode }
  );
}

// is this student allowed to take courseCode? compare the full prereq chain
// against what they've already completed, return whatever's missing
async function checkEligibility(studentId, courseCode) {
  const rows = await runQuery(
    `MATCH (target:Course {code: $courseCode})
     OPTIONAL MATCH (target)-[:REQUIRES*1..5]->(prereq:Course)
     WITH target, collect(DISTINCT prereq.code) AS allPrereqs
     MATCH (s:Student {id: $studentId})
     OPTIONAL MATCH (s)-[:COMPLETED]->(done:Course)
     WITH target, allPrereqs, collect(DISTINCT done.code) AS completed
     RETURN target.code AS courseCode, allPrereqs AS required,
            [x IN allPrereqs WHERE NOT x IN completed] AS missing`,
    { studentId, courseCode }
  );
  return rows[0];
}

// classmates who share 2+ enrolled courses with you. in SQL this needs a
// self-join on the enrollment table + GROUP BY/HAVING — here it's one pattern.
function getStudyBuddies(studentId, minShared) {
  const min = minShared || 2;
  return runQuery(
    `MATCH (me:Student {id: $studentId})-[:ENROLLED_IN]->(c:Course)<-[:ENROLLED_IN]-(other:Student)
     WHERE other.id <> $studentId
     WITH other, collect(DISTINCT c.name) AS sharedCourses, count(DISTINCT c) AS sharedCount
     WHERE sharedCount >= $min
     RETURN other.id AS id, other.name AS name, other.grade AS grade, sharedCourses, sharedCount
     ORDER BY sharedCount DESC`,
    { studentId, min }
  );
}

// who's qualified to teach a given subject, and how loaded up they already are
function getTeachersForSubject(subjectName) {
  return runQuery(
    `MATCH (t:Teacher)-[:EXPERT_IN]->(sub:Subject {name: $subjectName})
     OPTIONAL MATCH (t)<-[:TAUGHT_BY]-(c:Course)
     RETURN t.id AS id, t.name AS name, count(DISTINCT c) AS coursesTaught
     ORDER BY coursesTaught DESC`,
    { subjectName }
  );
}

function listStudents() {
  return runQuery('MATCH (s:Student) RETURN s.id AS id, s.name AS name, s.grade AS grade ORDER BY s.name');
}

function listCourses() {
  return runQuery(
    `MATCH (c:Course)-[:BELONGS_TO]->(sub:Subject)
     RETURN c.code AS code, c.name AS name, c.credits AS credits, sub.name AS subject
     ORDER BY c.code`
  );
}

async function getCourseDetail(courseCode) {
  const rows = await runQuery(
    `MATCH (c:Course {code: $courseCode})-[:BELONGS_TO]->(sub:Subject)
     MATCH (c)-[:TAUGHT_BY]->(t:Teacher)
     OPTIONAL MATCH (c)-[:REQUIRES]->(direct:Course)
     RETURN c.code AS code, c.name AS name, c.credits AS credits,
            sub.name AS subject, t.name AS teacher,
            collect(DISTINCT {code: direct.code, name: direct.name}) AS directPrereqs`,
    { courseCode }
  );
  return rows[0];
}

// quick counts for the dashboard header — how big is this graph, basically
async function getGraphStats() {
  const rows = await runQuery(
    `MATCH (n)
     RETURN labels(n)[0] AS label, count(*) AS total`
  );
  const stats = { Student: 0, Teacher: 0, Course: 0, Subject: 0 };
  rows.forEach((r) => {
    if (r.label in stats) stats[r.label] = r.total;
  });
  return stats;
}

module.exports = {
  getStudentCourses,
  getPrerequisiteChain,
  checkEligibility,
  getStudyBuddies,
  getTeachersForSubject,
  listStudents,
  listCourses,
  getCourseDetail,
  getGraphStats,
};
