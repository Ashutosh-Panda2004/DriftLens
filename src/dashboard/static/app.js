// DriftLens Dashboard - app.js
// Vanilla JS, no framework, no bundler.

const API = '';

async function api(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

function el(id) { return document.getElementById(id); }

function animateCounter(element, target) {
  if (!element) return;
  const duration = 800;
  const start = performance.now();
  const from = 0;
  const to = typeof target === 'number' ? target : parseFloat(target) || 0;

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (to - from) * eased);
    element.textContent = typeof target === 'string' && target.includes('%')
      ? current + '%'
      : current;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ── Overview Page ─────────────────────────────────────────────────────────────

async function initOverview() {
  try {
    const [overview, patterns, timeline, agents] = await Promise.all([
      api('/api/overview'),
      api('/api/patterns'),
      api('/api/timeline'),
      api('/api/agents'),
    ]);

    // Stat cards
    animateCounter(el('drift-score'), overview.drift_score + '%');
    animateCounter(el('total-corrections'), overview.total_corrections);
    animateCounter(el('pattern-count'), overview.pattern_count);
    animateCounter(el('struggle-chains'), overview.total_struggle_chains);

    const bd = overview.correction_breakdown;
    if (el('correction-breakdown')) {
      el('correction-breakdown').textContent =
        `${bd.git_delta} git · ${bd.reprompt} reprompt · ${bd.struggle_chain} chains`;
    }
    if (el('avg-friction')) {
      el('avg-friction').textContent = `avg friction: ${overview.avg_friction} turns`;
    }

    // Corrections over time chart
    renderTimelineChart(timeline);

    // Agents donut
    renderAgentsChart(agents);

    // Top patterns list
    renderTopPatterns(patterns.slice(0, 5));

    // Type bars
    renderTypeBars(bd, overview.total_corrections);

  } catch (err) {
    console.error('Overview load error:', err);
    showError('Failed to load overview data. Is DriftLens initialised?');
  }
}

function renderTimelineChart(timeline) {
  const ctx = el('corrections-chart');
  if (!ctx || !timeline.length) return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: timeline.map(t => t.week),
      datasets: [{
        label: 'Corrections',
        data: timeline.map(t => t.corrections),
        backgroundColor: 'rgba(88, 166, 255, 0.4)',
        borderColor: 'rgba(88, 166, 255, 0.8)',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b949e' },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8b949e' },
          beginAtZero: true,
        }
      }
    }
  });
}

function renderAgentsChart(agents) {
  const ctx = el('agents-chart');
  if (!ctx || !agents.length) return;

  const colors = ['#58a6ff', '#3fb950', '#e3b341', '#bc8cff', '#f85149', '#8b949e'];

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: agents.map(a => a.agent),
      datasets: [{
        data: agents.map(a => a.correction_count),
        backgroundColor: colors.slice(0, agents.length),
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8b949e', padding: 12, font: { size: 12 } }
        }
      },
      cutout: '65%',
    }
  });
}

function renderTopPatterns(patterns) {
  const list = el('top-patterns');
  if (!list) return;

  if (!patterns.length) {
    list.innerHTML = '<li class="empty-state"><p>No patterns yet. Run <code>driftlens analyse</code></p></li>';
    return;
  }

  list.innerHTML = patterns.map(p => `
    <li>
      <span class="pattern-name">${p.name}</span>
      <span class="pattern-meta">
        <span>${p.occurrences} corrections</span>
        <span class="badge badge-${p.status}">${p.status}</span>
      </span>
    </li>
  `).join('');
}

function renderTypeBars(breakdown, total) {
  const container = el('type-breakdown');
  if (!container || !total) return;

  const types = [
    { key: 'git_delta', label: 'Git Delta', color: '#58a6ff' },
    { key: 'reprompt', label: 'Re-prompt', color: '#3fb950' },
    { key: 'struggle_chain', label: 'Struggle Chain', color: '#e3b341' },
    { key: 'churn', label: 'Churn', color: '#8b949e' },
  ];

  container.innerHTML = types.map(t => {
    const count = breakdown[t.key] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="type-bar-item">
        <div class="type-bar-label">
          <span>${t.label}</span>
          <span>${count} (${pct}%)</span>
        </div>
        <div class="type-bar-track">
          <div class="type-bar-fill" style="width:${pct}%;background:${t.color}"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Patterns Page ─────────────────────────────────────────────────────────────

async function initPatterns() {
  try {
    const patterns = await api('/api/patterns');
    const container = document.querySelector('.pattern-grid');
    if (!container) return;

    if (!patterns.length) {
      container.innerHTML = `
        <div class="empty-state glass">
          <div class="icon">🔍</div>
          <p>No patterns yet. Run <code>driftlens analyse</code> to discover patterns.</p>
        </div>`;
      return;
    }

    container.innerHTML = patterns.map(p => `
      <div class="pattern-card glass" onclick="toggleCard(this)">
        <div class="pattern-card-header">
          <div>
            <div class="pattern-card-title">${p.name}</div>
            <div class="pattern-card-desc">${p.description}</div>
          </div>
          <div class="pattern-meta">
            <span>${p.occurrences} corrections</span>
            <span>${(p.confidence * 100).toFixed(0)}% confidence</span>
            <span class="badge badge-${p.status}">${p.status}</span>
          </div>
        </div>
        <div class="pattern-card-body">
          <table class="evidence-table">
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>First seen</td><td>${p.first_seen.split('T')[0]}</td></tr>
              <tr><td>Last seen</td><td>${p.last_seen.split('T')[0]}</td></tr>
              ${p.avg_friction_score ? `<tr><td>Avg friction</td><td>${p.avg_friction_score.toFixed(1)} turns</td></tr>` : ''}
              ${p.pr_url ? `<tr><td>PR</td><td><a href="${p.pr_url}" target="_blank">${p.pr_url}</a></td></tr>` : ''}
            </tbody>
          </table>
          ${p.example_before ? `<p style="margin-top:12px;color:#8b949e;font-size:12px">❌ Before:</p><div class="code-block">${escHtml(p.example_before)}</div>` : ''}
          ${p.example_after  ? `<p style="color:#8b949e;font-size:12px">✅ After:</p><div class="code-block">${escHtml(p.example_after)}</div>` : ''}
          ${p.constraint_block ? `<p style="color:#8b949e;font-size:12px;margin-top:12px">Constraint Block:</p><div class="code-block">${escHtml(p.constraint_block)}</div>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Patterns load error:', err);
  }
}

function toggleCard(el) {
  el.classList.toggle('expanded');
}

// ── Score Page ────────────────────────────────────────────────────────────────

async function initScore() {
  try {
    const [driftScores, patterns] = await Promise.all([
      api('/api/drift-score'),
      api('/api/patterns'),
    ]);

    const scoreEl = document.querySelector('.gauge-number');
    if (scoreEl && driftScores.length) {
      const avg = Math.round(driftScores.reduce((s, d) => s + d.score, 0) / driftScores.length);
      animateCounter(scoreEl, avg + '%');
      scoreEl.style.color = avg >= 80 ? '#3fb950' : avg >= 50 ? '#e3b341' : '#f85149';
    }

    const patternList = document.querySelector('.score-pattern-list');
    if (patternList) {
      patternList.innerHTML = patterns.map(p => {
        const icon = p.status === 'merged' ? '✅' : p.status === 'proposed' ? '⚠️' : p.status === 'regressed' ? '🔴' : '⏳';
        return `
          <li style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
            <span>${icon} ${p.name}</span>
            <span style="color:var(--text-muted)">${p.occurrences} corrections · ${(p.confidence*100).toFixed(0)}%</span>
          </li>`;
      }).join('');
    }
  } catch (err) {
    console.error('Score load error:', err);
  }
}

// ── Struggles Page ────────────────────────────────────────────────────────────

async function initStruggles() {
  try {
    const struggles = await api('/api/struggles');
    const container = document.querySelector('.struggles-list');
    if (!container) return;

    if (!struggles.length) {
      container.innerHTML = `
        <div class="empty-state glass">
          <div class="icon">⛓️</div>
          <p>No struggle chains captured yet. Start a <code>driftlens watch</code> session.</p>
        </div>`;
      return;
    }

    container.innerHTML = struggles.map(s => {
      const chain = s.struggle_chain;
      if (!chain) return '';
      const duration = chain.duration_seconds > 60
        ? `${Math.round(chain.duration_seconds / 60)}m`
        : `${chain.duration_seconds}s`;

      return `
        <div class="chain-card glass" onclick="toggleCard(this)">
          <div class="chain-header">
            <div>
              <div style="font-weight:600">${s.file}</div>
              <div class="chain-meta">${duration} · ${chain.turn_count} correction turns</div>
            </div>
            <div class="chain-turns">${chain.turn_count}</div>
          </div>
          <div class="chain-body">
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Initial request: ${escHtml(chain.initial_request.slice(0, 100))}</p>
            ${chain.chain.map(turn => `
              <div class="turn-item">
                <span class="turn-role ${turn.role === 'developer' ? 'dev' : 'ai'}">${turn.role}</span>
                <span class="turn-content">${escHtml(turn.content.slice(0, 200))}</span>
              </div>
            `).join('')}
            ${chain.rules_extracted.length ? `
              <p style="font-size:12px;color:var(--text-muted);margin-top:12px;font-weight:600">Extracted rules:</p>
              <ul style="padding-left:16px;font-size:13px">
                ${chain.rules_extracted.map(r => `<li>${escHtml(r)}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('Struggles load error:', err);
  }
}

// ── Feedback Page ─────────────────────────────────────────────────────────────

async function initFeedback() {
  try {
    const feedback = await api('/api/feedback');
    const container = document.querySelector('.feedback-list');
    if (!container) return;

    if (!feedback.length) {
      container.innerHTML = `
        <div class="empty-state glass">
          <div class="icon">📊</div>
          <p>No feedback data yet. Merge a DriftLens PR to start tracking improvement.</p>
        </div>`;
      return;
    }

    container.innerHTML = feedback.map(f => `
      <div class="glass" style="padding:16px 20px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${f.pattern_id.slice(0,8)}</strong>
            <span class="badge badge-${f.pr_status}" style="margin-left:8px">${f.pr_status}</span>
          </div>
          <div style="color:var(--green);font-weight:700">${f.reduction_pct > 0 ? '-' + f.reduction_pct.toFixed(0) + '%' : 'Pending'}</div>
        </div>
        <div style="color:var(--text-muted);font-size:13px;margin-top:4px">
          ${f.corrections_before_merge} → ${f.corrections_after_merge} corrections
          ${f.pr_url ? `· <a href="${f.pr_url}" target="_blank">View PR</a>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Feedback load error:', err);
  }
}

// ── Heatmap Page ──────────────────────────────────────────────────────────────

async function initHeatmap() {
  try {
    const data = await api('/api/heatmap');
    const container = document.querySelector('.heatmap-container');
    if (!container || !data.length) return;

    const weeks = [...new Set(data.map(d => d.week))].sort();
    const files = [...new Set(data.map(d => d.file))].sort();

    const lookup = {};
    for (const entry of data) {
      lookup[`${entry.file}::${entry.week}`] = entry.count;
    }

    const maxCount = Math.max(...data.map(d => d.count), 1);

    let html = '<table style="font-size:11px;border-collapse:collapse">';
    html += '<tr><th style="padding:4px 8px;text-align:left;color:var(--text-muted)">File</th>';
    for (const week of weeks) {
      html += `<th style="padding:2px 3px;color:var(--text-muted);writing-mode:vertical-rl;height:60px">${week}</th>`;
    }
    html += '</tr>';

    for (const file of files.slice(0, 30)) {
      html += `<tr><td style="padding:4px 8px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file}</td>`;
      for (const week of weeks) {
        const count = lookup[`${file}::${week}`] || 0;
        const level = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);
        html += `<td style="padding:2px 3px"><div class="heatmap-cell" data-level="${level}" title="${file} · ${week}: ${count}"></div></td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Heatmap load error:', err);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  const main = document.querySelector('.content');
  if (main) {
    main.innerHTML += `
      <div class="glass empty-state" style="margin-top:24px">
        <div class="icon">⚠️</div>
        <p>${msg}</p>
      </div>`;
  }
}
