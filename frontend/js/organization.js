// OWNER: Nouran — organization page: org chart, departments, roles, role assignment
let departments = [];
let roles = [];
let employees = [];

async function loadAll() {
  try {
    [departments, roles, employees] = await Promise.all([
      apiRequest('/api/departments'),
      apiRequest('/api/roles'),
      apiRequest('/api/employees')
    ]);
    renderDepartments();
    renderRoles();
    fillSelect(document.getElementById('chart-department'),
      departments.map((d) => ({ value: d.id, label: d.name })), 'Whole company');
    fillSelect(document.getElementById('assign-employee'),
      employees.map((e) => ({ value: e.id, label: e.name })), 'Choose an employee');
    fillSelect(document.getElementById('assign-role'),
      roles.map((r) => ({ value: r.id, label: `${r.title} (level ${r.level})` })), 'Choose a role');
    await loadChart();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Org chart ---------- */

function renderNode(node) {
  return `
    <li>
      <div class="node">
        <strong>${escapeHtml(node.name)}</strong>
        <span>${escapeHtml(node.role || 'No role')}</span>
        <span class="muted">${escapeHtml(node.department || '')}</span>
      </div>
      ${node.reports.length ? `<ul>${node.reports.map(renderNode).join('')}</ul>` : ''}
    </li>`;
}

async function loadChart(event) {
  if (event) event.preventDefault();
  const departmentId = document.getElementById('chart-department').value;
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
  try {
    const chart = await apiRequest(`/api/org-chart${query}`);
    document.getElementById('chart-summary').textContent = `${chart.totalEmployees} employee(s) in this chart.`;
    document.getElementById('org-chart').innerHTML = chart.roots.length
      ? `<ul>${chart.roots.map(renderNode).join('')}</ul>`
      : '<p class="muted">No employees to show.</p>';
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Departments ---------- */

function renderDepartments() {
  const box = document.getElementById('department-list');
  if (departments.length === 0) {
    box.innerHTML = '<p class="muted">No departments yet.</p>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Employees</th><th>Head</th><th></th></tr></thead>
      <tbody>
        ${departments.map((d) => {
          const members = employees.filter((e) => e.departmentId === d.id);
          const options = members.map((e) =>
            `<option value="${escapeHtml(e.id)}" ${e.id === d.headId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
          return `
            <tr>
              <td>${escapeHtml(d.name)}<br><span class="muted">${escapeHtml(d.description)}</span></td>
              <td>${d.employeeCount}</td>
              <td><select data-head="${escapeHtml(d.id)}"><option value="">No head</option>${options}</select></td>
              <td><button type="button" class="danger" data-delete-dept="${escapeHtml(d.id)}">Delete</button></td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

async function createDepartment(event) {
  event.preventDefault();
  const body = {
    name: document.getElementById('dept-name').value,
    description: document.getElementById('dept-description').value
  };
  try {
    const created = await apiRequest('/api/departments', { method: 'POST', body });
    showMessage(`Department ${created.name} was created.`);
    event.target.reset();
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function setHead(departmentId, headId) {
  try {
    const updated = await apiRequest(`/api/departments/${encodeURIComponent(departmentId)}`, {
      method: 'PUT', body: { headId: headId || null }
    });
    showMessage(`Head of ${updated.name} was updated.`);
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
    await loadAll();
  }
}

async function deleteDepartment(id) {
  const department = departments.find((d) => d.id === id);
  if (!window.confirm(`Delete ${department?.name}?`)) return;
  try {
    const result = await apiRequest(`/api/departments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showMessage(result.message);
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

/* ---------- Roles ---------- */

function renderRoles() {
  const box = document.getElementById('role-list');
  if (roles.length === 0) {
    box.innerHTML = '<p class="muted">No roles yet.</p>';
    return;
  }
  box.innerHTML = `
    <table>
      <thead><tr><th>Title</th><th>Level</th><th>Employees</th><th></th></tr></thead>
      <tbody>
        ${roles.map((r) => `
          <tr>
            <td>${escapeHtml(r.title)}</td>
            <td>${r.level}</td>
            <td>${r.employeeCount}</td>
            <td><button type="button" class="danger" data-delete-role="${escapeHtml(r.id)}">Delete</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function createRole(event) {
  event.preventDefault();
  const body = {
    title: document.getElementById('role-title').value,
    level: Number(document.getElementById('role-level').value)
  };
  try {
    const created = await apiRequest('/api/roles', { method: 'POST', body });
    showMessage(`Role ${created.title} was created.`);
    event.target.reset();
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function deleteRole(id) {
  const role = roles.find((r) => r.id === id);
  if (!window.confirm(`Delete the role ${role?.title}?`)) return;
  try {
    const result = await apiRequest(`/api/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showMessage(result.message);
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function assignRole(event) {
  event.preventDefault();
  const employeeId = document.getElementById('assign-employee').value;
  const roleId = document.getElementById('assign-role').value;
  try {
    const updated = await apiRequest(`/api/employees/${encodeURIComponent(employeeId)}/role`, {
      method: 'PUT', body: { roleId }
    });
    const role = roles.find((r) => r.id === roleId);
    showMessage(`${updated.name} is now ${role?.title}.`);
    await loadAll();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  document.getElementById('chart-form').addEventListener('submit', loadChart);
  document.getElementById('department-form').addEventListener('submit', createDepartment);
  document.getElementById('role-form').addEventListener('submit', createRole);
  document.getElementById('assign-form').addEventListener('submit', assignRole);

  document.getElementById('department-list').addEventListener('change', (event) => {
    if (event.target.dataset.head) setHead(event.target.dataset.head, event.target.value);
  });
  document.getElementById('department-list').addEventListener('click', (event) => {
    const id = event.target.dataset.deleteDept;
    if (id) deleteDepartment(id);
  });
  document.getElementById('role-list').addEventListener('click', (event) => {
    const id = event.target.dataset.deleteRole;
    if (id) deleteRole(id);
  });
});
