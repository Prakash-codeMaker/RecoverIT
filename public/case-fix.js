(() => {
  const root = document.getElementById('root');
  if (!root) return;

  const params = new URLSearchParams(location.search);
  let caseId = params.get('id');
  let busy = false;
  let pollTimer = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const pretty = (value) => String(value || '').replaceAll('_', ' ');

  async function request(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        ...options,
        signal: controller.signal
      });
      let data = null;
      try { data = await response.json(); } catch (_) { data = {}; }
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  }

  function showError(title, message) {
    root.innerHTML = `
      <div class="loading">
        <div class="loadcard error">
          <div class="eyebrow">CASE ERROR</div>
          <h1>${esc(title)}</h1>
          <p class="muted">${esc(message)}</p>
          <div class="actions" style="margin-top:20px">
            <a class="btn primary" href="/app.html">Dashboard</a>
            <button class="btn" id="caseRetry">Retry</button>
          </div>
        </div>
      </div>`;
    const retry = document.getElementById('caseRetry');
    if (retry) retry.onclick = load;
  }

  function render(data) {
    const c = data.case || {};
    const steps = Array.isArray(data.steps) ? data.steps : [];
    const events = Array.isArray(data.events) ? data.events : [];
    const evidence = Array.isArray(data.evidence) ? data.evidence : [];
    const progress = data.progress || {};
    const waiting = c.status === 'WAITING_FOR_USER';
    const running = steps.some((s) => s.status === 'RUNNING');
    const current = steps.find((s) => s.status === 'RUNNING') || steps.find((s) => s.status === 'WAITING') || steps.find((s) => s.status === 'QUEUED');
    const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
    const names = ['Understand', 'Check proof', 'Verify payment', 'Recovery plan'];
    const activeIndex = Math.max(0, steps.findIndex((s) => s.status === 'RUNNING'));
    const guidance = waiting
      ? (data.guidance || 'We need one more thing from you.')
      : (current?.detail || data.guidance || 'RecoverIT is checking the evidence now.');

    const stepNodes = steps.map((step, index) => {
      const state = step.status === 'DONE' ? 'done' : step.status === 'RUNNING' ? 'active' : '';
      const left = steps.length > 1 ? (index / (steps.length - 1)) * 100 : 0;
      const mark = step.status === 'DONE' ? '✓' : '';
      return `<div class="map-node ${state}" style="left:${left}%"><div>${mark}</div><span>${esc(names[index] || step.title)}</span></div>`;
    }).join('');

    const eventNodes = events.slice().reverse().slice(0, 6).map((event, index) => {
      let time = '';
      try { time = new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) {}
      return `<div class="mini-event ${index === 0 ? 'current' : ''}"><i></i><div><b>${esc(event.title || 'Investigation update')}</b><small>${esc(time)}</small></div></div>`;
    }).join('');

    root.innerHTML = `
      <div class="case-head">
        <div>
          <div class="eyebrow">CASE ${esc(c.case_number || '—')}</div>
          <h1>${esc(pretty(c.issue_type) || 'Investigation')}</h1>
          <p class="muted">${esc(c.description || 'RecoverIT is investigating your report.')}</p>
        </div>
        <div class="livebadge"><span class="pulse"></span>${waiting ? 'Your turn' : 'Investigating'}</div>
      </div>

      <div class="recovery-map">
        <div class="map-head">
          <div><div class="eyebrow">RECOVERY JOURNEY</div><h2>${percent}% complete</h2></div>
          <div class="map-current">${esc(names[activeIndex] || current?.title || 'Monitoring')} <span>→</span></div>
        </div>
        <div class="map-track">
          <div class="map-progress" style="width:${percent}%"></div>
          ${stepNodes}
        </div>
        <div class="map-foot"><span>${Number(progress.done || 0)} of ${Number(progress.total || steps.length || 0)}</span><span>Live</span></div>
      </div>

      <div class="invest-visual">
        <div class="radar"><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><div class="radar-core"></div><div class="sweep"></div></div>
        <div>
          <div class="eyebrow">RIGHT NOW</div>
          <h2>${esc(current?.title || (waiting ? 'Waiting for you' : 'Following your case'))}</h2>
          <p>${esc(guidance)}</p>
        </div>
      </div>

      <div class="mini-journey">
        <div class="mini-head"><span>CASE JOURNEY</span><small>Updates automatically</small></div>
        <div class="mini-track">${eventNodes || '<span class="muted">Your investigation updates will appear here.</span>'}</div>
      </div>

      <div class="next-card">
        <div><div class="eyebrow">YOUR NEXT STEP</div><h3>${esc(waiting ? (data.guidance || 'We need one more thing from you.') : (data.guidance || 'Nothing needed right now.'))}</h3></div>
        <div class="next-arrow">→</div>
      </div>

      <div class="proof-line"><span>${evidence.length} proof file${evidence.length === 1 ? '' : 's'}</span><span>Evidence is checked as new information arrives</span></div>
    `;
  }

  async function getCase(id) {
    return request('/api/cases/live-status?case_id=' + encodeURIComponent(id), {}, 5000);
  }

  async function findLatest() {
    const result = await request('/api/cases/list', {}, 5000);
    if (result.response.status === 401) {
      location.href = '/login?next=' + encodeURIComponent('/case.html');
      return null;
    }
    if (!result.response.ok || !result.data.cases || !result.data.cases.length) return null;
    return result.data.cases[0].id;
  }

  async function startInvestigation() {
    if (busy || !caseId) return;
    busy = true;
    try {
      await request('/api/cases/investigate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ case_id: caseId })
      }, 5000);
    } catch (_) {
      // Polling will surface the real case state; a slow start must never freeze the UI.
    } finally {
      busy = false;
    }
  }

  async function load() {
    if (busy) return;
    if (!caseId) {
      showError('No case selected', 'Return to the Dashboard and open a case.');
      return;
    }

    try {
      let result = await getCase(caseId);

      if (result.response.status === 401) {
        location.href = '/login?next=' + encodeURIComponent('/case.html?id=' + caseId);
        return;
      }

      if (result.response.status === 404) {
        const latest = await findLatest();
        if (!latest) {
          showError('Case not found', 'This case link is no longer available. Open the Dashboard and start a new case.');
          return;
        }
        caseId = latest;
        history.replaceState({}, '', location.pathname + '?id=' + encodeURIComponent(caseId));
        result = await getCase(caseId);
      }

      if (!result.response.ok) {
        throw new Error(result.data?.error || 'The case service could not respond.');
      }

      render(result.data);

      if (result.data.case?.status === 'REPORTED') {
        await startInvestigation();
        // Refresh immediately after starting so the user sees RUNNING instead of waiting.
        const refreshed = await getCase(caseId);
        if (refreshed.response.ok) render(refreshed.data);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        showError('The case service is taking too long', 'RecoverIT could not reach the case service quickly. Your case has not been lost. Please retry.');
      } else {
        showError('We could not open this case', error.message || 'Please retry or return to the Dashboard.');
      }
    }
  }

  load();
  pollTimer = setInterval(() => {
    if (!document.hidden && !busy) load();
  }, 5000);
  window.addEventListener('beforeunload', () => clearInterval(pollTimer));
})();