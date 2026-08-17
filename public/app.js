// talks to the Express API and renders the two views. no framework, just DOM.

let currentStudent = null;
let allStudents = [];
let allCourses = [];

const subjectColors = {
  Mathematics: '#3F5C46',
  Science: '#2E6B7C',
  English: '#8C5E3C',
  History: '#7C4A3F',
  'Computer Science': '#5A4A8C',
};

const avatarColors = ['#E8A33D', '#C2666B', '#6B9C7A', '#7C9CC2', '#C29C6B'];

function initials(name) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

async function api(path) {
  const res = await fetch(`/api${path}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'request failed');
  return json.data;
}

function showBanner(msg) {
  const el = document.getElementById('connection-banner');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideBanner() {
  document.getElementById('connection-banner').classList.add('hidden');
}

// ---------- tabs ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
});

// ---------- stats strip ----------
async function loadStats() {
  try {
    const stats = await api('/stats');
    document.getElementById('stat-students').textContent = stats.Student;
    document.getElementById('stat-teachers').textContent = stats.Teacher;
    document.getElementById('stat-courses').textContent = stats.Course;
    document.getElementById('stat-subjects').textContent = stats.Subject;
  } catch (err) {
    // not critical if this fails quietly — the banner from loadRoster covers it
  }
}

// ---------- roster ----------
function renderRoster(students) {
  const listEl = document.getElementById('student-list');
  if (students.length === 0) {
    listEl.innerHTML = `<p style="opacity:.6;font-size:13px;padding:8px;">No students found. Run the seed script.</p>`;
    return;
  }
  listEl.innerHTML = students.map((s) => `
    <button class="roster-item" data-id="${s.id}" data-name="${s.name}">
      <span class="avatar" style="background:${colorFor(s.name)}">${initials(s.name)}</span>
      <span class="roster-name">${s.name}</span>
      <span class="roster-grade">G${s.grade}</span>
    </button>
  `).join('');
  listEl.querySelectorAll('.roster-item').forEach((btn) => {
    btn.addEventListener('click', () => selectStudent(btn.dataset.id, btn.dataset.name, btn));
  });
}

async function loadRoster() {
  try {
    allStudents = await api('/students');
    hideBanner();
    renderRoster(allStudents);
  } catch (err) {
    document.getElementById('student-list').innerHTML = '';
    showBanner('Could not reach the database. Check that CognoDB is running and your .env is correct.');
  }
}

document.getElementById('roster-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = q ? allStudents.filter((s) => s.name.toLowerCase().includes(q)) : allStudents;
  renderRoster(filtered);
});

// ---------- report card ----------
async function selectStudent(id, name, btnEl) {
  currentStudent = id;
  document.querySelectorAll('.roster-item').forEach((b) => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const card = document.getElementById('report-card');
  card.innerHTML = `<div class="empty-state"><span class="empty-glyph">⏳</span><p>Loading ${name}'s report card…</p></div>`;

  try {
    const [courses, buddies] = await Promise.all([
      api(`/students/${id}/courses`),
      api(`/students/${id}/study-buddies?min=2`),
    ]);
    if (!allCourses.length) allCourses = await api('/courses');

    card.innerHTML = `
      <div class="rc-header">
        <span class="avatar-lg" style="background:${colorFor(name)}">${initials(name)}</span>
        <div class="rc-header-text">
          <h2>${name}</h2>
        </div>
        <span class="rc-grade-tag">STUDENT #${id.toUpperCase()}</span>
      </div>

      <div class="rc-section">
        <h3>Enrolled Courses</h3>
        ${courses.length === 0
          ? `<p style="color:#8a8368;font-size:13.5px;">Not enrolled in any courses yet.</p>`
          : courses.map((c) => `
            <div class="course-row">
              <div><span class="code">${c.code}</span><span class="name">${c.name}</span></div>
              <span class="teacher">${c.teacher}</span>
            </div>
          `).join('')}
      </div>

      <div class="rc-section">
        <h3>Check Eligibility for a New Course</h3>
        <div class="eligibility-box">
          <select id="elig-select">
            ${allCourses.map((c) => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('')}
          </select>
          <button id="elig-check-btn">Check</button>
        </div>
        <div id="elig-result"></div>
      </div>

      <div class="rc-section">
        <h3>Study Buddies (2+ shared courses)</h3>
        ${buddies.length === 0
          ? `<p style="color:#8a8368;font-size:13.5px;">No classmates share 2 or more courses yet.</p>`
          : `<div class="buddy-list">${buddies.map((b) => `
              <span class="buddy-chip"><b>${b.name}</b><span class="shared">· ${b.sharedCount} shared</span></span>
            `).join('')}</div>`}
      </div>
    `;
    card.classList.add('fade-in');
    document.getElementById('elig-check-btn').addEventListener('click', checkEligibility);
  } catch (err) {
    card.innerHTML = `<div class="empty-state"><span class="empty-glyph">⚠</span><p>Couldn't load this student's data. The database may be unreachable.</p></div>`;
  }
}

async function checkEligibility() {
  const code = document.getElementById('elig-select').value;
  const resultEl = document.getElementById('elig-result');
  resultEl.innerHTML = `<p style="font-size:13px;color:#8a8368;">Checking…</p>`;
  try {
    const result = await api(`/students/${currentStudent}/eligibility/${code}`);
    const eligible = result.missing.length === 0;
    resultEl.innerHTML = `
      <div class="eligibility-result ${eligible ? 'pass' : 'fail'}">
        ${eligible
          ? `✅ Eligible for <b>${code}</b> — all prerequisites completed.`
          : `🚫 Not yet eligible for <b>${code}</b>. Missing: ${result.missing.join(', ')}`}
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<div class="eligibility-result fail">Could not check eligibility right now.</div>`;
  }
}

// ---------- course explorer ----------
async function loadExplorer() {
  const grid = document.getElementById('course-grid');
  try {
    const courses = await api('/courses');
    allCourses = courses;
    if (courses.length === 0) {
      grid.innerHTML = `<p style="opacity:.6;">No courses found. Run the seed script.</p>`;
      return;
    }
    grid.innerHTML = courses.map((c, i) => `
      <div class="index-card" tabindex="0" data-code="${c.code}" style="--i:${i}">
        <div class="ic-code">${c.code}</div>
        <div class="ic-name">${c.name}</div>
        <div class="ic-meta">
          <span class="ic-subject" style="background:${subjectColors[c.subject] || '#3F5C46'}">${c.subject}</span>
          <span>${c.credits} credits</span>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.index-card').forEach((card) => {
      card.addEventListener('click', () => openPrereqModal(card.dataset.code));
      card.addEventListener('keypress', (e) => { if (e.key === 'Enter') openPrereqModal(card.dataset.code); });
    });
  } catch (err) {
    grid.innerHTML = '';
    showBanner('Could not reach the database. Check that CognoDB is running and your .env is correct.');
  }
}

async function openPrereqModal(code) {
  const backdrop = document.getElementById('modal-backdrop');
  const content = document.getElementById('modal-content');
  backdrop.classList.remove('hidden');
  content.innerHTML = `<p>Tracing prerequisite chain…</p>`;
  try {
    const [detail, chain] = await Promise.all([
      api(`/courses/${code}`),
      api(`/courses/${code}/prerequisites`),
    ]);
    content.innerHTML = `
      <h3>${detail.name}</h3>
      <p class="modal-sub">${detail.code} · ${detail.subject} · taught by ${detail.teacher}</p>
      ${chain.length === 0
        ? `<p style="font-size:13.5px;color:#8a8368;">No prerequisites — this is an entry-level course.</p>`
        : chain.map((c) => `
          <div class="chain-step">
            <span class="chain-depth">${c.depth} hop${c.depth > 1 ? 's' : ''}</span>
            <span><b>${c.code}</b> — ${c.name}</span>
          </div>
        `).join('')}
      <button class="modal-close" id="modal-close-btn">Close</button>
    `;
    document.getElementById('modal-close-btn').addEventListener('click', () => backdrop.classList.add('hidden'));
  } catch (err) {
    content.innerHTML = `<p>Could not load this course's prerequisite chain.</p><button class="modal-close" id="modal-close-btn">Close</button>`;
    document.getElementById('modal-close-btn').addEventListener('click', () => backdrop.classList.add('hidden'));
  }
}

document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') e.target.classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('modal-backdrop').classList.add('hidden');
});

// ---------- go ----------
loadStats();
loadRoster();
loadExplorer();
