// OWNER: Jana - employees page: onboarding, profile, manager assignment, team moves, status workflow
let employees = [];
let departments = [];
let roles = [];

const STATUS_LABEL = { Active: 'Active', OnLeave: 'On leave', Left: 'Left' };
const nameOf = (list, id, field = 'name') => list.find((x) => x.id === id)?.[field] || '-';
const current = () => employees.filter((e) => e.status !== 'Left');

function parseSkills(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(STATUS_LABEL[status] || status)}</span>`;
}

async function loadAll() {
  try {
    [employees, departments, roles] = await Promise.all([
      apiRequest('/api/employees'),
      apiRequest('/api/departments'),
      apiRequest('/api/roles')
    ]);
    renderList();
    fillForms();
  } catch (error) {
    if (error.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    showMessage(error.message, 'error');
  }
}

function renderList() {
  const box = document.getElementById('employee-list');
  if (employees.length === 0) {
    box.innerHTML = '<p class="muted">No employees yet. Register the first one below.</p>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Manager</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${employees.map((e) => `
          <tr class="${e.status === 'Left' ? 'left' : ''}">
            <td>${escapeHtml(e.name)}</td>
            <td>${escapeHtml(e.email)}</td>
            <td>${escapeHtml(nameOf(departments, e.departmentId))}</td>
            <td>${escapeHtml(nameOf(roles, e.roleId, 'title'))}</td>
            <td>${escapeHtml(nameOf(employees, e.managerId))}</td>
            <td>${statusBadge(e.status)}</td>
            <td class="actions">
              ${e.status === 'Left'
                ? `<button type="button" class="danger" data-delete="${escapeHtml(e.id)}">Delete record</button>`
                : `<button type="button" class="secondary" data-edit="${escapeHtml(e.id)}">Manage</button>`}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function fillForms() {
  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  fillSelect(document.getElementById('reg-department'), deptOptions, 'No department');
  fillSelect(document.getElementById('reg-role'),
    roles.map((r) => ({ value: r.id, label: `${r.title} (level ${r.level})` })), 'No role');
  fillSelect(document.getElementById('reg-manager'),
    current().map((e) => ({ value: e.id, label: e.name })), 'Department head (automatic)');
  fillSelect(document.getElementById('edit-department'), deptOptions, 'No department');
}

/* ---------- Function 1: Onboarding ---------- */

async function registerEmployee(event) {
  event.preventDefault();
  const body = {
    name: document.getElementById('reg-name').value,
    email: document.getElementById('reg-email').value,
    phone: document.getElementById('reg-phone').value,
    skills: parseSkills(document.getElementById('reg-skills').value),
    departmentId: document.getElementById('reg-department').value || null,
    roleId: document.getElementById('reg-role').value || null,
    managerId: document.getElementById('reg-manager').value || null
  };
  try {
    const created = await apiRequest('/api/employees', { method: 'POST', body });
    let text = `${created.name} was registered (id ${created.id}).`;
    if (created.managerAssignedAutomatically) {
      text += ` Reports to the department head, ${nameOf(employees, created.managerId)}.`;
    } else if (!created.managerId) {
      text += ' No manager assigned yet.';
    }
    showMessage(text);
    event.target.reset();
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function openEdit(id) {
  try {
    const [employee, team] = await Promise.all([
      apiRequest(`/api/employees/${encodeURIComponent(id)}`),
      apiRequest(`/api/employees/${encodeURIComponent(id)}/team`)
    ]);
    document.getElementById('edit-id').value = employee.id;
    document.getElementById('edit-title').textContent = employee.name;
    document.getElementById('edit-name').value = employee.name;
    document.getElementById('edit-email').value = employee.email;
    document.getElementById('edit-phone').value = employee.phone || '';
    document.getElementById('edit-skills').value = (employee.skills || []).join(', ');
    document.getElementById('edit-department').value = employee.departmentId || '';
    document.getElementById('edit-status').innerHTML = statusBadge(employee.status);

    const others = current().filter((e) => e.id !== employee.id).map((e) => ({ value: e.id, label: e.name }));
    const managerSelect = document.getElementById('edit-manager');
    fillSelect(managerSelect, others, 'No manager');
    managerSelect.value = employee.managerId || '';
    fillSelect(document.getElementById('reassign-to'), others, 'Move the team to...');
    fillSelect(document.getElementById('status-reassign'), others, 'Team goes to... (when leaving)');

    document.getElementById('edit-team').innerHTML = team.length
      ? `<ul>${team.map((t) => `<li>${escapeHtml(t.name)}</li>`).join('')}</ul>`
      : '<p class="muted">Nobody reports to this employee.</p>';
    document.getElementById('reassign-form').hidden = team.length === 0;

    await loadPromotions(id);

    const card = document.getElementById('edit-card');
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  const before = employees.find((e) => e.id === id);
  const body = {
    name: document.getElementById('edit-name').value,
    email: document.getElementById('edit-email').value,
    phone: document.getElementById('edit-phone').value,
    skills: parseSkills(document.getElementById('edit-skills').value),
    departmentId: document.getElementById('edit-department').value || null
  };
  try {
    const updated = await apiRequest(`/api/employees/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    let text = `${updated.name}'s profile was saved.`;
    if (before && before.departmentId !== updated.departmentId) {
      text += updated.managerId
        ? ` New department: now reports to ${nameOf(employees, updated.managerId)}.`
        : ' New department: no manager assigned yet.';
    }
    showMessage(text);
    await loadAll();
    await openEdit(id);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Function 3: Manager assignment and team moves ---------- */

async function saveManager(event) {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  const managerId = document.getElementById('edit-manager').value || null;
  try {
    const updated = await apiRequest(`/api/employees/${encodeURIComponent(id)}/manager`, {
      method: 'PUT', body: { managerId }
    });
    showMessage(managerId
      ? `${updated.name} now reports to ${nameOf(employees, managerId)}.`
      : `${updated.name} no longer has a manager.`);
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function moveTeam(event) {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  const newManagerId = document.getElementById('reassign-to').value;
  if (!newManagerId) return showMessage('Choose who takes over the team.', 'error');
  try {
    const result = await apiRequest(`/api/employees/${encodeURIComponent(id)}/reassign-team`, {
      method: 'POST', body: { newManagerId }
    });
    showMessage(`${result.message} They now report to ${nameOf(employees, newManagerId)}.`);
    await loadAll();
    await openEdit(id);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Function 4: Promotions ---------- */

async function loadPromotions(id) {
  const box = document.getElementById('edit-promotions');
  try {
    const history = await apiRequest(`/api/employees/${encodeURIComponent(id)}/promotions`);
    box.innerHTML = history.length
      ? `<ul>${history.map((p) => `<li>${escapeHtml(nameOf(roles, p.fromRoleId, 'title'))} -> ${escapeHtml(nameOf(roles, p.toRoleId, 'title'))} on ${escapeHtml(new Date(p.promotedAt).toLocaleDateString())}: ${escapeHtml(p.reason)}</li>`).join('')}</ul>`
      : '<p class="muted">No promotions yet.</p>';
  } catch {
    box.innerHTML = '<p class="muted">Promotion history is only visible to the employee and HR.</p>';
  }
  const currentRole = roles.find((r) => r.id === (employees.find((e) => e.id === id) || {}).roleId);
  const higher = roles.filter((r) => !currentRole || r.level > currentRole.level);
  fillSelect(document.getElementById('promote-role'),
    higher.map((r) => ({ value: r.id, label: `${r.title} (level ${r.level})` })), 'New role...');
}

async function promote(event) {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  const roleId = document.getElementById('promote-role').value;
  const reason = document.getElementById('promote-reason').value;
  if (!roleId) return showMessage('Choose the new role.', 'error');
  try {
    const updated = await apiRequest(`/api/employees/${encodeURIComponent(id)}/promote`, {
      method: 'POST', body: { roleId, reason }
    });
    showMessage(`${updated.name} was promoted to ${nameOf(roles, updated.roleId, 'title')}.`);
    document.getElementById('promote-reason').value = '';
    await loadAll();
    await openEdit(id);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Function 2: Status workflow ---------- */

async function changeStatus(event) {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  const status = document.getElementById('status-new').value;
  const reassignTo = document.getElementById('status-reassign').value || null;
  if (status === 'Left' && !window.confirm('Offboard this employee? This cannot be undone.')) return;
  try {
    const updated = await apiRequest(`/api/employees/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', body: { status, reassignTo }
    });
    showMessage(`${updated.name} is now ${STATUS_LABEL[updated.status]}.`);
    await loadAll();
    if (updated.status === 'Left') document.getElementById('edit-card').hidden = true;
    else await openEdit(id);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function deleteRecord(id) {
  const name = nameOf(employees, id);
  if (!window.confirm(`Permanently delete ${name}'s record?`)) return;
  try {
    const result = await apiRequest(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showMessage(result.message);
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  document.getElementById('register-form').addEventListener('submit', registerEmployee);
  document.getElementById('edit-form').addEventListener('submit', saveProfile);
  document.getElementById('manager-form').addEventListener('submit', saveManager);
  document.getElementById('reassign-form').addEventListener('submit', moveTeam);
  document.getElementById('status-form').addEventListener('submit', changeStatus);
  document.getElementById('promote-form').addEventListener('submit', promote);
  document.getElementById('edit-close').addEventListener('click', () => {
    document.getElementById('edit-card').hidden = true;
  });
  document.getElementById('employee-list').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.edit) openEdit(button.dataset.edit);
    if (button.dataset.delete) deleteRecord(button.dataset.delete);
  });
});
