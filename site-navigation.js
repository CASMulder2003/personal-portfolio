(() => {
  const switchers = [...document.querySelectorAll('.project-switcher')];
  document.addEventListener('click', event => {
    for (const menu of switchers) if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    for (const menu of switchers) if (menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
})();
