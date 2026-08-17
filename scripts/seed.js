// Fills CognoDB with sample students, teachers, courses and subjects.
// Run with: npm run seed
//
// Model:
//   (Course)-[:BELONGS_TO]->(Subject)
//   (Course)-[:REQUIRES]->(Course)      prerequisite chain
//   (Course)-[:TAUGHT_BY]->(Teacher)
//   (Teacher)-[:EXPERT_IN]->(Subject)
//   (Student)-[:ENROLLED_IN]->(Course)
//   (Student)-[:COMPLETED]->(Course)
//   (Student)-[:FRIENDS_WITH]->(Student)

require('dotenv').config();
const { driver, verifyConnection } = require('../src/db');

const subjects = ['Mathematics', 'Science', 'English', 'History', 'Computer Science'];

const teachers = [
  { id: 't1', name: 'Mr. Sharma', expertIn: 'Mathematics' },
  { id: 't2', name: 'Mrs. Iyer', expertIn: 'Science' },
  { id: 't3', name: 'Ms. Fernandes', expertIn: 'English' },
  { id: 't4', name: 'Mr. Khan', expertIn: 'History' },
  { id: 't5', name: 'Mrs. Rao', expertIn: 'Computer Science' },
];

// requires[] points at course codes defined earlier in this list, so the
// chains build up naturally (Algebra I -> Algebra II -> Calculus, etc)
const courses = [
  { code: 'MATH101', name: 'Algebra I', credits: 3, subject: 'Mathematics', teacher: 't1', requires: [] },
  { code: 'MATH201', name: 'Algebra II', credits: 3, subject: 'Mathematics', teacher: 't1', requires: ['MATH101'] },
  { code: 'MATH301', name: 'Calculus', credits: 4, subject: 'Mathematics', teacher: 't1', requires: ['MATH201'] },

  { code: 'SCI101', name: 'General Science', credits: 3, subject: 'Science', teacher: 't2', requires: [] },
  { code: 'SCI201', name: 'Chemistry', credits: 4, subject: 'Science', teacher: 't2', requires: ['SCI101'] },
  { code: 'SCI301', name: 'Advanced Physics', credits: 4, subject: 'Science', teacher: 't2', requires: ['SCI201', 'MATH201'] },

  { code: 'ENG101', name: 'English Literature I', credits: 2, subject: 'English', teacher: 't3', requires: [] },
  { code: 'ENG201', name: 'English Literature II', credits: 2, subject: 'English', teacher: 't3', requires: ['ENG101'] },

  { code: 'HIST101', name: 'World History', credits: 2, subject: 'History', teacher: 't4', requires: [] },

  { code: 'CS101', name: 'Intro to Programming', credits: 3, subject: 'Computer Science', teacher: 't5', requires: [] },
  { code: 'CS201', name: 'Data Structures', credits: 4, subject: 'Computer Science', teacher: 't5', requires: ['CS101', 'MATH101'] },
  { code: 'CS301', name: 'Algorithms', credits: 4, subject: 'Computer Science', teacher: 't5', requires: ['CS201'] },
];

const firstNames = [
  'Aarav', 'Vivaan', 'Aditi', 'Diya', 'Kabir', 'Ishaan', 'Myra', 'Ananya',
  'Reyansh', 'Saanvi', 'Arjun', 'Kiara', 'Vihaan', 'Anaya', 'Rohan', 'Meera',
  'Sai', 'Riya', 'Dev', 'Tara',
];

const students = firstNames.map((name, i) => ({
  id: `s${i + 1}`,
  name,
  grade: 9 + (i % 4),
}));

function pickRandom(arr, count) {
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, count);
}

async function seed() {
  const connected = await verifyConnection();
  if (!connected) {
    console.error('Can\'t reach CognoDB — double check your .env values.');
    process.exit(1);
  }

  const session = driver.session();

  try {
    console.log('wiping existing data...');
    await session.run('MATCH (n) DETACH DELETE n');

    console.log('subjects...');
    for (const name of subjects) {
      await session.run('CREATE (:Subject {name: $name})', { name });
    }

    console.log('teachers...');
    for (const t of teachers) {
      await session.run(
        `CREATE (te:Teacher {id: $id, name: $name})
         WITH te
         MATCH (sub:Subject {name: $subject})
         CREATE (te)-[:EXPERT_IN]->(sub)`,
        { id: t.id, name: t.name, subject: t.expertIn }
      );
    }

    console.log('courses...');
    for (const c of courses) {
      await session.run(
        `CREATE (co:Course {code: $code, name: $name, credits: $credits})
         WITH co
         MATCH (sub:Subject {name: $subject})
         CREATE (co)-[:BELONGS_TO]->(sub)
         WITH co
         MATCH (te:Teacher {id: $teacher})
         CREATE (co)-[:TAUGHT_BY]->(te)`,
        { code: c.code, name: c.name, credits: c.credits, subject: c.subject, teacher: c.teacher }
      );
    }

    console.log('prerequisite links...');
    for (const c of courses) {
      for (const reqCode of c.requires) {
        await session.run(
          `MATCH (co:Course {code: $code}), (req:Course {code: $reqCode})
           CREATE (co)-[:REQUIRES]->(req)`,
          { code: c.code, reqCode }
        );
      }
    }

    console.log('students...');
    for (const s of students) {
      await session.run('CREATE (:Student {id: $id, name: $name, grade: $grade})', s);
    }

    console.log('enrollments + a couple completed courses each...');
    const codes = courses.map((c) => c.code);
    const entryLevelCodes = courses.filter((c) => c.requires.length === 0).map((c) => c.code);

    for (const s of students) {
      const enrolled = pickRandom(codes, 3 + Math.floor(Math.random() * 2));
      for (const code of enrolled) {
        await session.run(
          `MATCH (st:Student {id: $sid}), (co:Course {code: $code})
           CREATE (st)-[:ENROLLED_IN]->(co)`,
          { sid: s.id, code }
        );
      }

      // give everyone a couple of completed entry-level courses so eligibility
      // checks have something real to work with
      for (const code of pickRandom(entryLevelCodes, 2)) {
        await session.run(
          `MATCH (st:Student {id: $sid}), (co:Course {code: $code})
           MERGE (st)-[:COMPLETED]->(co)`,
          { sid: s.id, code }
        );
      }
    }

    console.log('friendships...');
    for (let i = 0; i < students.length; i++) {
      const friendCount = 1 + Math.floor(Math.random() * 3);
      for (const friend of pickRandom(students, friendCount)) {
        if (friend.id === students[i].id) continue;
        await session.run(
          `MATCH (a:Student {id: $a}), (b:Student {id: $b})
           MERGE (a)-[:FRIENDS_WITH]->(b)`,
          { a: students[i].id, b: friend.id }
        );
      }
    }

    const counts = await session.run('MATCH (n) RETURN labels(n)[0] AS label, count(*) AS total');
    console.log('\ndone. node counts:');
    counts.records.forEach((r) => console.log(`  ${r.get('label')}: ${r.get('total')}`));
  } catch (err) {
    console.error('seed failed:', err);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

seed();
