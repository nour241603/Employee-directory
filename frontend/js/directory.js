// OWNER: Nour — directory page: search, expert finder, reporting path, profile view
let currentPage = 1;

const STATUS_LABEL = { Active: 'Active', OnLeave: 'On leave', Left: 'Left' };

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>`;
}

async function loadFilters() {
  try {
    const filters = await apiRequest('/api/directory/filters');
    const departments = filters.departments.map((d) => ({ value: d.id, label: d.name }));
    fillSelect(document.getElementById('search-department'), departments, 'All departments');
    fillSelect(document.getElementById('experts-department'), departments, 'Any department');
    fillSelect(document.getElementById('search-role'),
      filters.roles.map((r) => ({ value: r.id, label: r.title })), 'All roles');
    fillSelect(document.getElementById('search-skill'),
      filters.skills.map((s) => ({ value: s, label: s })), 'Any skill');
    const people = filters.people.map((p) => ({ value: p.id, label: p.name }));
    fillSelect(document.getElementById('path-from'), people, 'From…');
    fillSelect(document.getElementById('path-to'), people, 'To…');
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Function 1: Directory search ---------- */

function personCard(person) {
  return `
    <button type="button" class="person" data-id="${escapeHtml(person.id)}">
      <img src="${escapeHtml(person.avatarUrl)}" alt="" width="56" height="56">
      <span>
        <strong>${escapeHtml(person.name)}</strong> ${person.status !== 'Active' ? statusBadge(person.status) : ''}<br>
        <span class="muted">${escapeHtml(person.role || 'No role')} · ${escapeHtml(person.department || 'No department')}</span>
      </span>
    </button>`;
}

async function runSearch(page = 1) {
  const params = new URLSearchParams({ page, limit: 9 });
  const fields = { q: 'search-q', department: 'search-department', role: 'search-role',
    skill: 'search-skill', status: 'search-status', sort: 'search-sort' };
  for (const [param, id] of Object.entries(fields)) {
    const value = document.getElementById(id).value.trim();
    if (value) params.set(param, value);
  }

  try {
    const data = await apiRequest(`/api/directory?${params}`);
    currentPage = data.page;
    document.getElementById('search-summary').textContent = `${data.total} employee(s) found.`;
    document.getElementById('results').innerHTML = data.results.length
      ? data.results.map(personCard).join('')
      : '<p class="muted">No employees match your search.</p>';
    document.getElementById('page-info').textContent = `Page ${data.page} of ${data.totalPages}`;
    document.getElementById('prev-page').disabled = data.page <= 1;
    document.getElementById('next-page').disabled = data.page >= data.totalPages;
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Function 2: Expert finder ---------- */

async function findExperts(event) {
  event.preventDefault();
  const params = new URLSearchParams({ skills: document.getElementById('experts-skills').value });
  const department = document.getElementById('experts-department').value;
  if (department) params.set('department', department);
  if (document.getElementById('experts-available').checked) params.set('available', 'true');

  const box = document.getElementById('experts');
  const summary = document.getElementById('experts-summary');
  try {
    const data = await apiRequest(`/api/directory/experts?${params}`);
    summary.textContent = `${data.count} match(es), ${data.fullMatches} with every skill.` +
      (data.skillsNobodyHas.length ? ` Nobody has: ${data.skillsNobodyHas.join(', ')}.` : '');
    if (data.count === 0) {
      box.innerHTML = '<p class="muted">Nobody has these skills.</p>';
      return;
    }
    box.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Role · Department</th><th>Has</th><th>Missing</th><th>Match</th><th>Available</th></tr></thead>
        <tbody>
          ${data.results.map((e) => `
            <tr>
              <td><a href="#" class="details-link" data-id="${escapeHtml(e.id)}">${escapeHtml(e.name)}</a></td>
              <td>${escapeHtml(e.role || '—')} · ${escapeHtml(e.department || '—')}</td>
              <td>${e.matchedSkills.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join(' ')}</td>
              <td>${e.missingSkills.map((s) => `<span class="tag missing">${escapeHtml(s)}</span>`).join(' ') || '—'}</td>
              <td><div class="score"><span style="width:${e.score}%"></span></div>${e.score}%</td>
              <td>${e.available ? 'Yes' : statusBadge('OnLeave')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (error) {
    summary.textContent = '';
    showMessage(error.message, 'error');
  }
}

/* ---------- Function 3: Reporting path finder ---------- */

const ARROW = { up: '↑ reports to', down: '↓ manages', 'shared-manager': '★ shared manager', start: '', end: '' };

async function findPath(event) {
  event.preventDefault();
  const from = document.getElementById('path-from').value;
  const to = document.getElementById('path-to').value;
  const box = document.getElementById('path');
  try {
    const data = await apiRequest(`/api/directory/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!data.connected) {
      box.innerHTML = `<p class="muted">${escapeHtml(data.message)}</p>`;
      return;
    }
    box.innerHTML = `
      <p><strong>${escapeHtml(data.relationship)}</strong> · ${data.steps} step(s)</p>
      <ol class="path">
        ${data.path.map((p) => `
          <li class="${escapeHtml(p.direction)}">
            <a href="#" class="details-link" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</a>
            <span class="muted">${escapeHtml(p.role || 'No role')} · ${escapeHtml(p.department || 'Company-level')}</span>
            ${ARROW[p.direction] ? `<span class="tag">${ARROW[p.direction]}</span>` : ''}
          </li>`).join('')}
      </ol>`;
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Profile view ---------- */

async function showDetails(id) {
  try {
    const p = await apiRequest(`/api/directory/${encodeURIComponent(id)}`);
    document.getElementById('details').innerHTML = `
      <div class="profile">
        <img src="${escapeHtml(p.avatarUrl)}" alt="" width="96" height="96">
        <div>
          <h3>${escapeHtml(p.name)} ${statusBadge(p.status)}</h3>
          <p>${escapeHtml(p.role || 'No role')} · ${escapeHtml(p.department || 'No department')}</p>
          <p>Email: <a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a><br>
             Phone: ${escapeHtml(p.phone || '—')}</p>
          <p>${p.skills.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join(' ') || '<span class="muted">No skills listed</span>'}</p>
          <h4>Reporting line</h4>
          ${p.managerChain.length
            ? `<p>${p.managerChain.map((m) => `<a href="#" class="details-link" data-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</a>`).join(' → ')}</p>`
            : '<p class="muted">Reports to nobody (top of the organization).</p>'}
          <h4>Team (${p.team.length})</h4>
          ${p.team.length
            ? `<ul>${p.team.map((t) => `<li><a href="#" class="details-link" data-id="${escapeHtml(t.id)}">${escapeHtml(t.name)}</a> — ${escapeHtml(t.role || 'No role')}</li>`).join('')}</ul>`
            : '<p class="muted">Nobody reports to this employee.</p>'}
        </div>
      </div>`;
    const card = document.getElementById('details-card');
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadFilters();
  await runSearch(1);

  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(1);
  });
  document.getElementById('search-clear').addEventListener('click', () => {
    document.getElementById('search-form').reset();
    runSearch(1);
  });
  document.getElementById('prev-page').addEventListener('click', () => runSearch(currentPage - 1));
  document.getElementById('next-page').addEventListener('click', () => runSearch(currentPage + 1));
  document.getElementById('experts-form').addEventListener('submit', findExperts);
  document.getElementById('path-form').addEventListener('submit', findPath);

  // One click handler for every card and link that opens a profile.
  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('.person, .details-link');
    if (!target) return;
    event.preventDefault();
    showDetails(target.dataset.id);
  });
});
