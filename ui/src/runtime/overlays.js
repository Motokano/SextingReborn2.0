// One capture listener owns input while a public modal is active. Business
// controllers still decide whether an action is legal; this never advances time.
export function createOverlayHost(g) {
  const stack = [];
  const top = () => stack.at(-1);
  const focusable = el => [...el.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(n => {
    if (n.closest('[hidden],[inert]')) return false;
    for (let parent = n; parent && parent !== el; parent = parent.parentElement) {
      if (parent.style.display === 'none' || parent.style.visibility === 'hidden') return false;
    }
    return true;
  });
  const focus = entry => { if (entry) (focusable(entry.el)[0] || entry.el).focus(); };
  function keydown(e) {
    const entry = top(); if (!entry) return;
    e.stopImmediatePropagation();
    if (e.key === 'Tab') {
      const nodes = focusable(entry.el), at = nodes.indexOf(g.document.activeElement);
      e.preventDefault();
      (nodes[(at + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length] || entry.el).focus();
    } else if (e.key === 'Escape') { e.preventDefault(); entry.escape?.(); }
    else if ((e.key === 'Enter' || e.key === ' ') && entry.advance) {
      if (e.target?.closest('input,textarea,select')) return;
      e.preventDefault();
      // Explicit options retain keyboard activation; next is called only once.
      if (e.target?.closest('.dlg-option-btn')) e.target.click();
      else entry.advance();
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches('[role=button]')) { e.preventDefault(); e.target.click(); }
  }
  function pointer(e) {
    const entry = top();
    if (entry && !entry.el.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); entry.dismissOutside?.(); }
  }
  g.addEventListener('keydown', keydown, true);
  g.addEventListener('pointerdown', pointer, true);
  g.addEventListener('click', pointer, true);
  return {
    active: () => !!top(),
    enter(el, options = {}) {
      const entry = { el, previous: g.document.activeElement, ...options };
      g.SceneUi?.hideItemTooltip();
      stack.push(entry); focus(entry);
      return () => {
        const index = stack.indexOf(entry); if (index < 0) return;
        const wasTop = top() === entry; stack.splice(index, 1);
        if (!wasTop) return;
        if (top()) focus(top());
        else if (entry.previous?.isConnected && !entry.previous.closest('[inert],.hidden,[aria-hidden="true"]')) entry.previous.focus();
      };
    },
    dispose() { stack.length = 0; g.removeEventListener('keydown', keydown, true); g.removeEventListener('pointerdown', pointer, true); g.removeEventListener('click', pointer, true); },
  };
}
