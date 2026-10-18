import { readBody, block, text } from '../bridge/hud';
const escape = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createActions(g, isReady) {
  const t = (key, args) => text(g, key, args);
  return {
    text: t,
    hideTooltip: () => g.SceneUi?.hideItemTooltip(),
    tooltip(kind, data, el) {
      if (!isReady()) return;
      const UI = g.SceneUi;
      if (!UI) return;
      if (kind === 'buff') {
        if (!block(g, 'buff_hud')) return;
        let attrs = t('scene.buff.stacks', { v: String(data.stacks) });
        if (data.remaining != null) attrs += '\n' + t('scene.buff.remaining', { v: String(data.remaining) });
        if (g.SvelteInteractions) UI.showTooltipView(UI.basicTooltipView(data.name, data.desc, attrs), el);
        else UI.showItemTooltip(UI.buildItemTooltipHtml(data.name, data.desc, attrs), el);
        return;
      }
      const view = readBody(g, true), row = view.rows.find(r => r.id === data.id);
      if (!row) return;
      const status = view.detail ? row.value + ' / ' + row.max : row.hurt ? '受伤' : '无碍';
      const lines = [];
      let html = '<div class="tooltip-name">' + escape(t('body.part.' + row.id)) + '</div><div class="tooltip-desc">' + escape(t('tooltip.status', { v: status })) + '</div>';
      if (['lhand', 'rhand', 'lfoot', 'rfoot'].includes(row.id)) {
        const tags = g.getLimbActionTagLabels?.(row.id) || [];
        const tagsLine = t('tooltip.action.tags', { v: tags.length ? tags.join(t('punct.join.dot')) : t('common.dash') });
        lines.push(tagsLine);
        html += '<div class="tooltip-attrs">' + escape(tagsLine) + '</div>';
      }
      if (view.detail && row.hurt) {
        const CA = g.CharacterAttributes, left = CA.getDestroyRecoverBlockTicks?.() || 0;
        let line = '';
        if (left > 0) line = t('body.part.destroy.recover.blocked', { v: String(left) });
        else if (CA.getPartRecoverCfg) {
          const cfg = CA.getPartRecoverCfg(); let mul = Number(cfg.part_multiplier[row.key]);
          if (!Number.isFinite(mul) || mul <= 0) mul = 1;
          line = t('body.part.destroy.recover.active', { rate: String(Math.max(1, Math.round(cfg.interval / mul))) });
        }
        if (line) lines.push(line);
        if (line) html += '<div class="tooltip-attrs">' + escape(line) + '</div>';
      }
      if (g.SvelteInteractions) {
        const nodes = UI.basicTooltipView(t('body.part.' + row.id), t('tooltip.status', { v: status }), '');
        lines.forEach(line => nodes.push({ tag:'div', className:'tooltip-attrs', text:line, children:[] }));
        UI.showTooltipView(nodes, el);
      } else UI.showItemTooltip(html, el);
    },
    debug(id, key) {
      if (!isReady()) return;
      if (id === 'destroy') {
        if (!block(g, 'limbs')) return;
        const CA = g.CharacterAttributes, remaining = Math.max(0, CA.getBodyPartDestroyMax(key) - CA.getPartDestroy(key));
        if (remaining > 0) CA.applyCombatDestroy(key, remaining);
        g.SceneUi?.hideItemTooltip(); g.SceneHud.refresh('status');
        g.PlayerPawnRig?.update(g.document.querySelector('.player-pawn-visual')); g.SceneRenderer?.render();
      } else {
        if (!block(g, id === 'experience' ? 'attrs' : 'combat_resources')) return;
        const ids = { diqi: 'status-diqi-debug-plus50', stun: 'status-stun-debug-plus50', pain: 'status-pain-debug-plus30', addiction: 'status-addiction-debug-plus10' };
        const action = id === 'experience' ? 'status-attr-exp-debug-plus-' + key : ids[id];
        g.SceneCtx.hudDebugActions?.[action]?.();
      }
    },
  };
}
