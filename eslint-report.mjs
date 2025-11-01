#!/usr/bin/env node
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

console.log('Running ESLint...');
let output;
try {
  output = execSync('yarn lint --format json', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024
  });
} catch (error) {
  // ESLint exits with code 1 when there are errors, but still outputs JSON
  output = error.stdout;
}

const results = JSON.parse(output);

// Group by rule
const ruleMap = {};
results.forEach(file => {
  file.messages.forEach(msg => {
    const rule = msg.ruleId || 'unknown';
    if (!ruleMap[rule]) {
      ruleMap[rule] = {
        count: 0,
        errors: 0,
        warnings: 0,
        files: {}
      };
    }
    ruleMap[rule].count++;
    if (msg.severity === 2) {
      ruleMap[rule].errors++;
    } else {
      ruleMap[rule].warnings++;
    }

    const relativePath = file.filePath.replace(process.cwd() + '/', '');
    if (!ruleMap[rule].files[relativePath]) {
      ruleMap[rule].files[relativePath] = [];
    }
    ruleMap[rule].files[relativePath].push({
      line: msg.line,
      column: msg.column,
      message: msg.message,
      severity: msg.severity
    });
  });
});

// Sort by count
const sorted = Object.entries(ruleMap)
  .map(([rule, data]) => ({ rule, ...data }))
  .sort((a, b) => b.count - a.count);

// Generate HTML
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESLint Report - QuestDB UI</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      margin: 0;
      padding: 20px;
      background: #1e1e1e;
      color: #d4d4d4;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      color: #fff;
      margin-bottom: 10px;
    }
    .summary {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
      padding: 20px;
      background: #252526;
      border-radius: 8px;
      border: 1px solid #3e3e42;
    }
    .summary-item {
      flex: 1;
    }
    .summary-label {
      font-size: 12px;
      color: #858585;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .summary-value {
      font-size: 32px;
      font-weight: 600;
    }
    .summary-value.errors {
      color: #f48771;
    }
    .summary-value.warnings {
      color: #dcdcaa;
    }
    .summary-value.total {
      color: #4fc3f7;
    }
    .filter-box {
      margin-bottom: 20px;
      padding: 15px;
      background: #252526;
      border-radius: 8px;
      border: 1px solid #3e3e42;
    }
    .filter-input {
      width: 100%;
      padding: 10px;
      background: #1e1e1e;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      color: #d4d4d4;
      font-size: 14px;
    }
    .filter-input:focus {
      outline: none;
      border-color: #007acc;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #252526;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #3e3e42;
    }
    thead {
      background: #2d2d30;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #fff;
      border-bottom: 2px solid #3e3e42;
      cursor: pointer;
      user-select: none;
    }
    th:hover {
      background: #37373d;
    }
    th.sortable::after {
      content: ' ⇅';
      opacity: 0.5;
    }
    th.sorted-asc::after {
      content: ' ↑';
      opacity: 1;
    }
    th.sorted-desc::after {
      content: ' ↓';
      opacity: 1;
    }
    .rule-row {
      cursor: pointer;
      border-bottom: 1px solid #3e3e42;
    }
    .rule-row:hover {
      background: #2d2d30;
    }
    .rule-row td {
      padding: 12px;
    }
    .rule-name {
      font-family: 'Consolas', 'Monaco', monospace;
      color: #4fc3f7;
      font-size: 13px;
    }
    .count {
      font-weight: 600;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-error {
      background: #f48771;
      color: #1e1e1e;
    }
    .badge-warning {
      background: #dcdcaa;
      color: #1e1e1e;
    }
    .expand-icon {
      display: inline-block;
      transition: transform 0.2s;
      margin-right: 8px;
    }
    .expanded .expand-icon {
      transform: rotate(90deg);
    }
    .file-details {
      display: none;
      background: #1e1e1e;
    }
    .file-details.show {
      display: table-row;
    }
    .file-details td {
      padding: 0;
    }
    .file-list {
      padding: 15px;
      max-height: 400px;
      overflow-y: auto;
    }
    .file-item {
      margin-bottom: 15px;
      padding: 10px;
      background: #252526;
      border-radius: 4px;
      border-left: 3px solid #007acc;
    }
    .file-path {
      font-family: 'Consolas', 'Monaco', monospace;
      color: #4ec9b0;
      font-size: 12px;
      margin-bottom: 8px;
      word-break: break-all;
    }
    .issue {
      padding: 6px 10px;
      margin: 4px 0;
      background: #2d2d30;
      border-radius: 3px;
      font-size: 12px;
    }
    .issue-location {
      color: #858585;
      font-family: 'Consolas', 'Monaco', monospace;
    }
    .issue-message {
      color: #d4d4d4;
      margin-left: 10px;
    }
    .no-results {
      text-align: center;
      padding: 40px;
      color: #858585;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>ESLint Report</h1>
    <div class="summary">
      <div class="summary-item">
        <div class="summary-label">Total Issues</div>
        <div class="summary-value total">${sorted.reduce((sum, s) => sum + s.count, 0)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Errors</div>
        <div class="summary-value errors">${sorted.reduce((sum, s) => sum + s.errors, 0)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Warnings</div>
        <div class="summary-value warnings">${sorted.reduce((sum, s) => sum + s.warnings, 0)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Rules Violated</div>
        <div class="summary-value">${sorted.length}</div>
      </div>
    </div>

    <div class="filter-box">
      <input
        type="text"
        class="filter-input"
        id="filterInput"
        placeholder="Filter by rule name... (e.g., 'typescript', 'react', 'prettier')"
      />
    </div>

    <table id="rulesTable">
      <thead>
        <tr>
          <th class="sortable" data-sort="rule">Rule</th>
          <th class="sortable sorted-desc" data-sort="count">Count</th>
          <th class="sortable" data-sort="errors">Errors</th>
          <th class="sortable" data-sort="warnings">Warnings</th>
          <th>Files Affected</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((item, index) => `
          <tr class="rule-row" data-index="${index}" data-rule="${item.rule}">
            <td>
              <span class="expand-icon">▶</span>
              <span class="rule-name">${item.rule}</span>
            </td>
            <td class="count">${item.count}</td>
            <td class="count">
              ${item.errors > 0 ? `<span class="badge badge-error">${item.errors}</span>` : '-'}
            </td>
            <td class="count">
              ${item.warnings > 0 ? `<span class="badge badge-warning">${item.warnings}</span>` : '-'}
            </td>
            <td class="count">${Object.keys(item.files).length}</td>
          </tr>
          <tr class="file-details" data-index="${index}">
            <td colspan="5">
              <div class="file-list">
                ${Object.entries(item.files).map(([file, issues]) => `
                  <div class="file-item">
                    <div class="file-path">${file}</div>
                    ${issues.slice(0, 10).map(issue => `
                      <div class="issue">
                        <span class="issue-location">${issue.line}:${issue.column}</span>
                        <span class="issue-message">${issue.message}</span>
                      </div>
                    `).join('')}
                    ${issues.length > 10 ? `<div style="color: #858585; font-size: 12px; margin-top: 8px;">... and ${issues.length - 10} more issues in this file</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <script>
    const data = ${JSON.stringify(sorted)};
    let currentSort = { column: 'count', direction: 'desc' };

    // Toggle row expansion
    document.querySelectorAll('.rule-row').forEach(row => {
      row.addEventListener('click', () => {
        const index = row.dataset.index;
        const detailsRow = document.querySelector(\`.file-details[data-index="\${index}"]\`);
        row.classList.toggle('expanded');
        detailsRow.classList.toggle('show');
      });
    });

    // Filter functionality
    const filterInput = document.getElementById('filterInput');
    filterInput.addEventListener('input', (e) => {
      const filter = e.target.value.toLowerCase();
      document.querySelectorAll('.rule-row').forEach(row => {
        const rule = row.dataset.rule.toLowerCase();
        const match = rule.includes(filter);
        const index = row.dataset.index;
        const detailsRow = document.querySelector(\`.file-details[data-index="\${index}"]\`);

        if (match) {
          row.style.display = '';
          // Keep details visible if already expanded
          if (!row.classList.contains('expanded')) {
            detailsRow.style.display = 'none';
          }
        } else {
          row.style.display = 'none';
          detailsRow.style.display = 'none';
        }
      });
    });

    // Sorting functionality
    document.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const column = th.dataset.sort;
        const direction = currentSort.column === column && currentSort.direction === 'desc' ? 'asc' : 'desc';
        currentSort = { column, direction };

        // Update header classes
        document.querySelectorAll('th.sortable').forEach(h => {
          h.classList.remove('sorted-asc', 'sorted-desc');
        });
        th.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');

        // Sort data
        const sortedData = [...data].sort((a, b) => {
          let aVal = a[column];
          let bVal = b[column];

          if (column === 'rule') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          }

          if (direction === 'asc') {
            return aVal > bVal ? 1 : -1;
          } else {
            return aVal < bVal ? 1 : -1;
          }
        });

        // Re-render table body
        const tbody = document.querySelector('#rulesTable tbody');
        tbody.innerHTML = sortedData.map((item, index) => {
          const originalIndex = data.indexOf(item);
          return \`
            <tr class="rule-row" data-index="\${originalIndex}" data-rule="\${item.rule}">
              <td>
                <span class="expand-icon">▶</span>
                <span class="rule-name">\${item.rule}</span>
              </td>
              <td class="count">\${item.count}</td>
              <td class="count">
                \${item.errors > 0 ? \`<span class="badge badge-error">\${item.errors}</span>\` : '-'}
              </td>
              <td class="count">
                \${item.warnings > 0 ? \`<span class="badge badge-warning">\${item.warnings}</span>\` : '-'}
              </td>
              <td class="count">\${Object.keys(item.files).length}</td>
            </tr>
            <tr class="file-details" data-index="\${originalIndex}">
              <td colspan="5">
                <div class="file-list">
                  \${Object.entries(item.files).map(([file, issues]) => \`
                    <div class="file-item">
                      <div class="file-path">\${file}</div>
                      \${issues.slice(0, 10).map(issue => \`
                        <div class="issue">
                          <span class="issue-location">\${issue.line}:\${issue.column}</span>
                          <span class="issue-message">\${issue.message}</span>
                        </div>
                      \`).join('')}
                      \${issues.length > 10 ? \`<div style="color: #858585; font-size: 12px; margin-top: 8px;">... and \${issues.length - 10} more issues in this file</div>\` : ''}
                    </div>
                  \`).join('')}
                </div>
              </td>
            </tr>
          \`;
        }).join('');

        // Re-attach click handlers
        document.querySelectorAll('.rule-row').forEach(row => {
          row.addEventListener('click', () => {
            const index = row.dataset.index;
            const detailsRow = document.querySelector(\`.file-details[data-index="\${index}"]\`);
            row.classList.toggle('expanded');
            detailsRow.classList.toggle('show');
          });
        });
      });
    });
  </script>
</body>
</html>
`;

writeFileSync('eslint-report.html', html);
console.log('\n✅ Report generated: eslint-report.html');
console.log('Open it in your browser to view the interactive report.');
