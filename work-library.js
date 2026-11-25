(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const items = [...document.querySelectorAll('.portfolio-item')];
  const search = document.getElementById('work-search');
  const count = document.getElementById('library-count');
  const clear = document.getElementById('clear-search');
  const allowed = ['all', 'analysis', 'tools', 'fieldwork', 'reading'];
  const params = new URLSearchParams(location.search);
  let active = allowed.includes(params.get('category')) ? params.get('category') : 'all';
  search.value = params.get('q') || '';
  function update(syncUrl = true) {
    const query = search.value.toLocaleLowerCase().trim();
    let visible = 0;
    for (const item of items) {
      const match = (active === 'all' || item.dataset.category === active) && item.textContent.toLocaleLowerCase().includes(query);
      item.hidden = !match;
      if (match) visible++;
    }
    document.getElementById('library-empty').hidden = visible > 0;
    document.getElementById('project-section').hidden = !items.some(item => !item.hidden && item.dataset.kind === 'project');
    document.getElementById('research-reading').hidden = !items.some(item => !item.hidden && item.dataset.kind === 'reading');
    document.querySelector('.collection-status a').hidden = document.getElementById('research-reading').hidden;
    count.textContent = `${visible} item${visible === 1 ? '' : 's'}${active !== 'all' || query ? ' of '+items.length : ''}`;
    clear.hidden = search.value.length === 0;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === active));
    if (syncUrl) {
      const next = new URLSearchParams();
      if (active !== 'all') next.set('category', active);
      if (search.value) next.set('q', search.value);
      history.replaceState(null, '', location.pathname + (next.size ? '?'+next.toString() : '') + location.hash);
    }
  }
  for (const button of buttons) button.addEventListener('click', () => {active = button.dataset.filter; update();});
  for (const jump of document.querySelectorAll('.library-jumps a')) jump.addEventListener('click', () => {
    active = jump.hash === '#research-reading' ? 'reading' : 'all';
    search.value = ''; update();
  });
  search.addEventListener('input', () => update());
  clear.addEventListener('click', () => {search.value = ''; update(); search.focus();});
  document.getElementById('reset-filters').addEventListener('click', () => {active = 'all'; search.value = ''; update(); buttons[0].focus();});
  window.addEventListener('popstate', () => {
    const state = new URLSearchParams(location.search);
    active = allowed.includes(state.get('category')) ? state.get('category') : 'all';
    search.value = state.get('q') || ''; update(false);
  });
  update(false);
})();
