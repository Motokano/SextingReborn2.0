/* Shared navigation artwork; original labels, titles and event handlers stay intact. */
(function () {
    'use strict';
    var paths = {
        'btn-ui-windows': 'M3 3h8v8H3z M15 3h6v8h-6z M3 15h8v6H3z M15 15h6v6h-6z',
        'btn-backpack': 'M7 8V6a5 5 0 0 1 10 0v2 M5 8h14l1 13H4L5 8Z M8 13h8v5H8z',
        'btn-survival': 'M5 21c0-8 5-14 14-18 1 10-2 16-10 15 M5 21 16 8',
        'btn-combat': 'm4 3 13 13 M3 4l3-1 13 12-4 4L3 6V4Z M14 20l6-6 M17 18l4 4',
        'btn-player-actions': 'M4 8h16 M4 16h16 M8 4v8 M16 12v8',
        'btn-save': 'M4 4h6l2 2h8v15H4V4Z M8 11h8 M8 15h8',
        'btn-reset-demo-save': 'M5 8a8 8 0 1 1-1 8 M5 3v5h5'
    };
    Object.keys(paths).forEach(function (id) {
        var button = document.getElementById(id);
        if (!button) return;
        var original = document.createElement('span');
        original.className = 'jianghu-nav-original';
        while (button.firstChild) original.appendChild(button.firstChild);
        var mark = document.createElement('span'); mark.className = 'jianghu-nav-content';
        mark.innerHTML = '<svg class="jianghu-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + paths[id] + '"/></svg>';
        button.append(original, mark);
    });

    // Keep interaction state owned by SceneApp; use its existing click handlers.
    [
        ['btn-ui-windows', 'ui-windows-menu'],
        ['btn-player-actions', 'player-actions-submenu']
    ].forEach(function (ids) {
        var trigger = document.getElementById(ids[0]);
        var menu = document.getElementById(ids[1]);
        if (!trigger || !menu) return;
        trigger.setAttribute('aria-controls', menu.id);
        trigger.setAttribute('aria-haspopup', 'true');
        function isOpen() { return menu.classList.contains('open'); }
        function syncExpanded() { trigger.setAttribute('aria-expanded', String(isOpen())); }
        new MutationObserver(syncExpanded).observe(menu, { attributes: true, attributeFilter: ['class'] });
        syncExpanded();
        function controls() {
            return Array.from(menu.querySelectorAll('button, input, select, a[href], [tabindex]')).filter(function (el) {
                return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0;
            });
        }
        trigger.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Escape') {
                if (isOpen()) trigger.click();
                return;
            }
            if (!isOpen()) trigger.click();
            var items = controls();
            var target = event.key === 'ArrowUp' ? items[items.length - 1] : items[0];
            if (target && isOpen()) target.focus();
        });
        menu.addEventListener('keydown', function (event) {
            if (!isOpen()) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                trigger.click();
                trigger.focus();
                return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            // Preserve native editing keys should a menu later include an editor.
            if (event.target.matches('select, textarea, input:not([type="checkbox"]):not([type="radio"])') || event.target.isContentEditable) return;
            var items = controls();
            if (!items.length) return;
            var index = items.indexOf(document.activeElement);
            if (event.key === 'Home') index = 0;
            else if (event.key === 'End') index = items.length - 1;
            else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            event.preventDefault();
            event.stopPropagation();
            items[index].focus();
        });
        menu.parentElement.addEventListener('focusout', function (event) {
            if (event.relatedTarget && !menu.parentElement.contains(event.relatedTarget) && isOpen()) trigger.click();
        });
    });
})();
