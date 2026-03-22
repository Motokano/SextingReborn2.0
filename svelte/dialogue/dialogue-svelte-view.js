/**
 * Svelte view adapter for DialogueUI.
 * API-compatible with old DialogueReactView: mount/render/unmount.
 *
 * Usage (bundled):
 *   import './dialogue-svelte-view.js';
 *   window.DialogueReactView = window.DialogueSvelteView; // temporary alias
 */

import DialogueAvatar from './DialogueAvatar.svelte';
import DialogueActions from './DialogueActions.svelte';
import DialogueOptions from './DialogueOptions.svelte';

let avatarInstance = null;
let actionsInstance = null;
let optionsInstance = null;

let avatarMountNode = null;
let actionsMountNode = null;
let optionsMountNode = null;

function mount(payload = {}) {
  const { avatarEl = null, actionsEl = null, optionsEl = null } = payload;

  if (avatarEl && avatarMountNode !== avatarEl) {
    if (avatarInstance) avatarInstance.$destroy();
    avatarInstance = new DialogueAvatar({
      target: avatarEl,
      props: { avatarUrl: '', fallbackGlyph: '❖' }
    });
    avatarMountNode = avatarEl;
  }

  if (actionsEl && actionsMountNode !== actionsEl) {
    if (actionsInstance) actionsInstance.$destroy();
    actionsInstance = new DialogueActions({
      target: actionsEl,
      props: {
        nextLabel: '...',
        nextDisabled: false,
        closeLabel: 'close',
        onNext: null,
        onClose: null
      }
    });
    actionsMountNode = actionsEl;
  }

  if (optionsEl && optionsMountNode !== optionsEl) {
    if (optionsInstance) optionsInstance.$destroy();
    optionsInstance = new DialogueOptions({
      target: optionsEl,
      props: { options: [], onChoose: null }
    });
    optionsMountNode = optionsEl;
  }
}

function render(state = {}) {
  if (avatarInstance) {
    avatarInstance.$set({
      avatarUrl: state.avatarUrl || '',
      fallbackGlyph: state.fallbackGlyph || '❖'
    });
  }

  if (actionsInstance) {
    actionsInstance.$set({
      nextLabel: state.nextLabel || '',
      nextDisabled: !!state.nextDisabled,
      closeLabel: state.closeLabel || 'close',
      onNext: state.onNext || null,
      onClose: state.onClose || null
    });
  }

  if (optionsInstance) {
    optionsInstance.$set({
      options: state.options || [],
      onChoose: state.onChoose || null
    });
  }
}

function unmount() {
  if (avatarInstance) avatarInstance.$destroy();
  if (actionsInstance) actionsInstance.$destroy();
  if (optionsInstance) optionsInstance.$destroy();

  avatarInstance = null;
  actionsInstance = null;
  optionsInstance = null;

  avatarMountNode = null;
  actionsMountNode = null;
  optionsMountNode = null;
}

const api = { mount, render, unmount };

if (typeof window !== 'undefined') {
  window.DialogueSvelteView = api;
}

export default api;
