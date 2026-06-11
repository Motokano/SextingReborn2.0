/**
 * 生成农业系统完整设计说明（单文件 HTML：玩法 + 数值 + 内嵌数据表）
 * 用法：node tools/build-agriculture-design-full-html.mjs
 * 输出：agriculture-design-full.html（项目根）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOP_JSON = path.join(ROOT, 'data', 'agriculture-seed-shop.json');
const CROP_JSON = path.join(ROOT, 'data', 'agriculture-crop-defs.json');
const SOILS_JSON = path.join(ROOT, 'data', 'agriculture-soils.json');
const OUT = path.join(ROOT, 'agriculture-design-full.html');

const shop = JSON.parse(fs.readFileSync(SHOP_JSON, 'utf8'));
const cropsDoc = JSON.parse(fs.readFileSync(CROP_JSON, 'utf8'));
const soilsDoc = JSON.parse(fs.readFileSync(SOILS_JSON, 'utf8'));
const crops = cropsDoc.crops || {};
const structLabels = cropsDoc.crop_structure_labels || {};
const structReq = cropsDoc.crop_structure_requirements || {};
const traceCat = cropsDoc.trace_sensitivity_catalog || {};
const tierLabels = shop.tiers || {};
const waterProfileLabels = cropsDoc.water_profile_labels || {};
const growthRules = cropsDoc.growth_score_rules || {};
const tierScoring = cropsDoc.tier_scoring_summary || {};

const SOIL_DISPLAY_ORDER = [
  'soil_saline_alkali',
  'soil_yellow_cotton',
  'soil_cinnamon',
  'soil_purple',
  'soil_red',
  'soil_paddy',
  'soil_black',
  'soil_alpine_meadow'
];

function pct(v) {
  if (!(v >= 0)) return '—';
  return Math.round(v * 100) + '%';
}

function cropIdFromSeedItemId(itemId) {
  if (itemId === 'seed_peanut') return 'peanut';
  return itemId.replace(/^seed_/, '');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const soilRows = SOIL_DISPLAY_ORDER.map((id) => {
  const s = (soilsDoc.soils || {})[id];
  if (!s) return null;
  const fx = s.fusion_gated && s.fusion_gated.special_effect;
  const mods = (s.fusion_gated && s.fusion_gated.absorption_modifiers) || {};
  const modParts = [];
  if (mods.fertilizer_multiplier != null && mods.fertilizer_multiplier !== 1) {
    modParts.push('瓮肥×' + mods.fertilizer_multiplier);
  }
  if (mods.trace_multiplier != null && mods.trace_multiplier !== 1) {
    modParts.push('微量×' + mods.trace_multiplier);
  }
  return {
    id: s.soil_id,
    name: s.display_name,
    region: s.region || '',
    water: pct(s.water_retention),
    fert: pct(s.fertilizer_retention),
    trace: pct(s.trace_retention),
    fusionLabel: fx ? fx.label : '—',
    fusionSummary: fx ? fx.summary : '—',
    modNote: modParts.length ? modParts.join('；') : '—',
    effectId: fx ? fx.effect_id : ''
  };
}).filter(Boolean);

const cropRows = shop.seeds
  .map((s) => {
    const cid = cropIdFromSeedItemId(s.item_id);
    const d = crops[cid] || {};
    const wp = d.water_profile || 'mesic';
    const sc = d.soil_scoring || {};
    return {
      seedId: s.item_id,
      seedName: s.name,
      cropId: d.cropId || cid,
      tier: d.tier || s.tier,
      price: s.price,
      group: s.group,
      growthTicks: d.growthTicks,
      harvestMin: d.harvestMin,
      harvestMax: d.harvestMax,
      waterProfile: wp,
      waterProfileLabel: waterProfileLabels[wp] || wp,
      waterloggedAbove: d.waterlogged_above != null ? String(d.waterlogged_above) : '',
      soilPreferred: (sc.preferred || []).join('、') || '—',
      soilUnsuitable: (sc.unsuitable || []).join('、') || '—',
      requestsSeaweed: d.requests_seaweed_extract ? '是' : '',
      requestsFert: d.requests_liquid_fertilizer ? '是' : '',
      water: d.minWater != null ? `${d.minWater}～${d.maxWater}` : '—',
      perfectWater:
        d.perfectMinWater != null ? `${d.perfectMinWater}～${d.perfectMaxWater}` : '—',
      traceSens: d.trace_sensitivity || '—',
      traceSafe: d.trace_safe_max != null ? String(d.trace_safe_max) : '—',
      traceScore:
        d.perfectMinTrace != null
          ? d.perfectMaxTrace != null
            ? `${d.perfectMinTrace}～${d.perfectMaxTrace}`
            : `${d.perfectMinTrace}+`
          : d.trace_sensitivity
            ? `≤${d.trace_safe_max}`
            : '—',
      fertScore:
        d.perfectMinFertilizer != null
          ? d.perfectMaxFertilizer != null
              ? `${d.perfectMinFertilizer}～${d.perfectMaxFertilizer}`
              : `${d.perfectMinFertilizer}+`
          : '—',
      scoreDims: d.score_dimensions
        ? ['水', '微', '肥', '土', '轮']
            .filter((_, i) => {
              const keys = ['water', 'trace', 'fertilizer', 'soil', 'rotation'];
              return d.score_dimensions[keys[i]];
            })
            .join('+')
        : '—',
      structId: d.required_crop_structure_id || '—',
      structName: d.required_crop_structure_id
        ? structLabels[d.required_crop_structure_id] || d.required_crop_structure_id
        : '—',
      growNote: d.growNote || s.grow_note || ''
    };
  })
  .sort((a, b) => (a.tier || 0) - (b.tier || 0) || a.seedName.localeCompare(b.seedName, 'zh'));

const peanut = crops.peanut || {};
const tierUnlockRows = Object.entries(shop.tier_trade_unlock || {})
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([t, v]) => `<tr><td>${esc(tierLabels[t] || t + '档')}</td><td>${v}</td><td>${t === '1' ? '无门槛' : '累计交易额 ≥ ' + v}</td></tr>`)
  .join('\n');

const tierSummaryRows = Object.entries(tierScoring)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([t, info]) => {
    const label = info.label || tierScoring[t] || '';
    const maxPos = info.typical_max_positive_score != null ? info.typical_max_positive_score : '—';
    return `<tr><td>${esc(tierLabels[t] || t + '档')}</td><td>${esc(label)}</td><td>${maxPos}</td></tr>`;
  })
  .join('\n');

const COL_COUNT = 18;

const html = `<!DOCTYPE html>
<!-- AUTO-GENERATED by tools/build-agriculture-design-full-html.mjs — 勿手改；改 data 或 docs/design/28-agriculture-irrigation.md 后重新运行 -->
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>农业系统完整设计说明（数值与玩法）</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #1c1815;
      color: #e8e6e3;
      font-family: "Noto Serif SC", "Microsoft YaHei", serif;
      line-height: 1.55;
      font-size: 14px;
    }
    .wrap { max-width: 1240px; margin: 0 auto; padding: 20px 16px 56px; }
    h1 {
      font-size: 24px;
      color: #d3a060;
      margin: 0 0 6px;
      border-bottom: 2px solid #4d4d45;
      padding-bottom: 10px;
    }
    .sub { color: #8e8e8e; font-size: 12px; margin-bottom: 14px; }
    nav.toc {
      font-size: 12px;
      margin-bottom: 18px;
      padding: 12px 14px;
      border: 1px solid #4d4d45;
      border-radius: 8px;
      background: #221c16;
      line-height: 1.8;
    }
    nav.toc a { color: #7ab89a; text-decoration: none; margin-right: 10px; white-space: nowrap; }
    nav.toc a:hover { color: #d3a060; }
    section {
      border: 1px solid #4d4d45;
      border-radius: 10px;
      background: #1a1512;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    h2 { font-size: 17px; color: #7ab89a; margin: 0 0 10px; }
    h3 { font-size: 14px; color: #d3a060; margin: 14px 0 8px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin: 8px 0;
    }
    th, td {
      border: 1px solid #4d4d45;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #251d17; color: #d3a060; }
    tr.tier-head td {
      background: #2a2218;
      color: #d3a060;
      font-weight: bold;
    }
    .note {
      border-left: 3px solid #d3a060;
      padding: 8px 12px;
      margin: 10px 0;
      background: #221c16;
      font-size: 13px;
      color: #d8cfbf;
    }
    .note-fusion { border-left-color: #8a6a9a; }
    .note-warn { border-left-color: #8a5050; }
    ul.compact { margin: 8px 0; padding-left: 20px; font-size: 13px; color: #d8cfbf; }
    ol.compact { margin: 8px 0; padding-left: 22px; font-size: 13px; color: #d8cfbf; }
    .flow {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin: 12px 0;
      font-size: 12px;
    }
    .flow .box {
      border: 1px solid #5a8f7a;
      background: #243028;
      color: #b8e0d0;
      padding: 5px 9px;
      border-radius: 6px;
    }
    .flow .arrow { color: #8e8e8e; }
    .tag {
      display: inline-block;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      margin-right: 4px;
      border: 1px solid #4d4d45;
    }
    .tag-lethal { border-color: #8a5050; color: #e8a0a0; }
    .tag-severe { border-color: #8a7050; color: #e8c080; }
    .tag-struct { border-color: #5a8f7a; color: #9ad4c4; }
    .tag-water-xeric { border-color: #8a7a50; color: #e8d080; }
    .tag-water-hydro { border-color: #507a8a; color: #9ad0e8; }
    .tag-water-aqua { border-color: #506a8a; color: #a0c8e8; }
    .tag-soil-ok { border-color: #5a8f6a; color: #a8d4b0; }
    .tag-soil-bad { border-color: #8f5a5a; color: #e8b0b0; }
    .tag-fusion { border-color: #8a6a9a; color: #d4b8e8; }
    .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
    .filters label { font-size: 13px; color: #d8cfbf; }
    .filters select, .filters input {
      background: #251d17;
      color: #e8e6e3;
      border: 1px solid #4d4d45;
      border-radius: 4px;
      padding: 4px 8px;
    }
    code {
      background: #251d17;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 12px;
      color: #d3a060;
    }
    a { color: #7ab89a; }
    a:hover { color: #d3a060; }
    .muted { color: #8e8e8e; font-size: 11px; }
    .const-num { color: #9ad4c4; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>农业系统完整设计说明</h1>
    <p class="sub">
      权威设计稿：<code>docs/design/28-agriculture-irrigation.md</code> ·
      数据：<code>data/agriculture-*.json</code> ·
      生成时间：${new Date().toISOString().slice(0, 10)} ·
      可玩 Demo：<a href="agriculture-standalone.html">agriculture-standalone.html</a>
      （<code>npm run build:agriculture-standalone</code>）
    </p>

    <nav class="toc">
      <a href="#overview">总览</a>
      <a href="#constants">全局常量</a>
      <a href="#map">地图与工程</a>
      <a href="#irrigation">灌溉水网</a>
      <a href="#tick-order">每 tick 顺序</a>
      <a href="#soils">八种土壤</a>
      <a href="#fusion">超融合</a>
      <a href="#venturi">文丘里·海藻精</a>
      <a href="#buried-jar">埋地陶瓮</a>
      <a href="#structures">耕地建造物</a>
      <a href="#growth">生长与产量</a>
      <a href="#algae">水藻爆发</a>
      <a href="#trace">微量排斥</a>
      <a href="#shop">种子商店</a>
      <a href="#crops">50 种作物</a>
      <a href="#peanut">花生示范</a>
      <a href="#refs">附录</a>
    </nav>

    <section id="overview">
      <h2>1. 系统总览</h2>
      <ul class="compact">
        <li><strong>入口</strong>：藏身处农业互动点 → NPC 对话打开 <strong>11×11</strong> 种植地图（坐标 <code>x,y = 0..10</code>，无负数）。</li>
        <li><strong>地块类型</strong>：水池 <code>(0,0)</code>、普通土地、开垦耕地、水渠、文丘里施肥器、埋地陶瓮、超融合、耕地建造物（支架等）。</li>
        <li><strong>核心循环</strong>：挖渠引水 → 按土壤锁值让作物吸收水分/微量/施肥 → 管理浓度避免水藻爆发 → 成熟后按生长分结算产量。</li>
        <li><strong>两条肥轨</strong>：<code>traceAbsorbed</code> 仅来自渠内海藻精；<code>fertilizerAbsorbed</code> 仅来自埋地陶瓮液态肥，禁止混写。</li>
        <li><strong>超融合开关</strong>：场上 ≥1 座时，全场文丘里切 <strong>A 面</strong>（按作物请求送海藻精）+ 八种土 <strong>土性融合</strong>；无超融合时文丘里默认 <strong>B 面</strong>（常注）。</li>
      </ul>
      <p class="note">本页数值与 Demo（<code>tools/agriculture-irrigation-demo.html</code>）及上述 JSON 对齐；正式服以设计稿为准，Demo 为试玩快照。</p>
    </section>

    <section id="constants">
      <h2>2. 全局数值常量（Demo / 首版）</h2>
      <table>
        <thead><tr><th>类别</th><th>常量</th><th>数值</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td>地图</td><td>尺寸</td><td class="const-num">11 × 11</td><td>水池固定左上角 (0,0)</td></tr>
          <tr><td>水池</td><td>基础滋养度</td><td class="const-num">200</td><td>每 tick 向四邻作物供水；不扣减到负</td></tr>
          <tr><td>水渠</td><td>默认容量</td><td class="const-num">2</td><td>升/降级 ±2，费用 5 金，工程 10 tick</td></tr>
          <tr><td>工程</td><td>耗时 / 体力</td><td class="const-num">10 tick × 5 体力/tick</td><td>开垦、拆耕地、建/拆渠、设施、建造物等</td></tr>
          <tr><td>设施建造</td><td>文丘里 / 陶瓮 / 建造物</td><td class="const-num">预付 20 金</td><td>超融合预付 <span class="const-num">200</span> 金；取消工程退预付</td></tr>
          <tr><td>文丘里</td><td>海藻精效果</td><td class="const-num">5000 tick</td><td>注入消耗 1 个 <code>liquid_seaweed_extract</code>，可重置倒计时</td></tr>
          <tr><td>文丘里</td><td>升级费用</td><td class="const-num">5 金/级</td><td>最高 3 级；浓度范围见 §文丘里</td></tr>
          <tr><td>陶瓮</td><td>液态肥施加</td><td class="const-num">0.5 / tick</td><td>示范 <code>liquid_fertilizer_n</code>；八邻仅生长中作物</td></tr>
          <tr><td>水藻爆发</td><td>比例阈值</td><td class="const-num">C : W &gt; 2.5 : 1</td><td>仅有水水渠；每 tick 健康 −2（可经 Buff 修正）</td></tr>
          <tr><td>作物健康</td><td>默认</td><td class="const-num">100 / 100</td><td>≤0 枯萎，不进入水分成熟结算</td></tr>
          <tr><td>精度</td><td>水量 / 浓度 / 累计条</td><td class="const-num">1 位小数</td><td>计算过程可保留更多位</td></tr>
          <tr><td>产量</td><td>生长分乘区</td><td class="const-num">+25% / 正分</td><td>负分 −25%/分，惩罚封顶 −50%</td></tr>
          <tr><td>Demo 商店</td><td>初始金钱</td><td class="const-num">50</td><td>花生种子锚价 <span class="const-num">10</span> 金（二档基准）</td></tr>
        </tbody>
      </table>
    </section>

    <section id="map">
      <h2>3. 地图、高度与耕地</h2>
      <h3>3.1 高度</h3>
      <ul class="compact">
        <li>同行高度一致；<code>y=0</code> 最高（水池行），<code>y=10</code> 最低；玩家不可改高度。</li>
        <li>有效供水：目标格高度 ≤ 来源格高度（同高可流；低处不能向高处供水）。</li>
        <li>四邻扫描顺序（同等条件）：<strong>下 → 右 → 左 → 上</strong>（不含斜角）。</li>
      </ul>
      <h3>3.2 耕地</h3>
      <ul class="compact">
        <li>种子仅可种在<strong>已开垦</strong>耕地；未种植时可拆除还原普通土地（10 tick 工程）。</li>
        <li>每格维护 <code>soil_id</code>（默认 <strong>盐碱土</strong>）；客土物品 <code>grants_soil_id</code> 可更换。</li>
        <li><code>上一轮作物</code>：收获或健康枯萎时写入，供轮作生长分读取。</li>
        <li>同 tick 普攻肢与招架肢互斥（战斗规则不展开；种植地图无战斗）。</li>
      </ul>
    </section>

    <section id="irrigation">
      <h2>4. 灌溉与水网</h2>
      <h3>4.1 滋养对象</h3>
      <p class="note">水池 / 有水水渠只滋养<strong>四邻耕地上的作物</strong>，不湿润土地本身，不滋养本格。</p>
      <h3>4.2 作物唯一受水来源（§12）</h3>
      <p>多邻有水渠时只选一源：路径回水池<strong>最短</strong> → 同长更靠 <code>x=0</code> → 再比<strong>高度更高</strong>的邻渠。微量元素吸收与水分<strong>同源同格</strong>。</p>
      <h3>4.3 主干与支流</h3>
      <ul class="compact">
        <li><strong>主干</strong>：水池 → 可达最低高度水渠（同高取 x 最小）的最短有效供水路径；路径上各格归主干。</li>
        <li><strong>支流</strong>：非主干可达水渠；终点按高度从高到低、同高 x 小优先轮询；流经格可共享，终点唯一。</li>
        <li><strong>供水顺序</strong>：水池 → 主干 → 支流 #1 → #2 …（先到先得，不按比例）。</li>
        <li><strong>不足均分</strong>：主干不足时水池+主干格均分；支流不足时仅该支流参与格均分（不含已被更高优先级供水的共享格）。</li>
        <li><strong>容量传递</strong>：每格实际水量 = min(自身容量, 上游瓶颈, 剩余可分配)。</li>
      </ul>
      <h3>4.4 网络重算触发</h3>
      <p>新建/拆除/改容量水渠、改水池滋养度或位置 → 重算网络后<strong>立即清空全场渠内海藻精浓度</strong>，再同步作物海藻精请求。</p>
    </section>

    <section id="tick-order">
      <h2>5. 农业地图每 tick 结算顺序</h2>
      <div class="flow">
        <span class="box">① 清水分配</span><span class="arrow">→</span>
        <span class="box">② 海藻精维持/注入</span><span class="arrow">→</span>
        <span class="box">③ 水藻爆发判定</span><span class="arrow">→</span>
        <span class="box">④ 作物吸水</span><span class="arrow">→</span>
        <span class="box">⑤ 吸收微量元素</span><span class="arrow">→</span>
        <span class="box">⑤a 微量排斥扣血</span><span class="arrow">→</span>
        <span class="box">⑤b 陶瓮施肥</span><span class="arrow">→</span>
        <span class="box">⑥ 爆发扣健康</span><span class="arrow">→</span>
        <span class="box">⑦ 生长倒计时等</span>
      </div>
      <p class="muted">⑤ 与 ⑥ 顺序固定：先按爆发渠浓度吸收微量，再扣爆发伤害。</p>
    </section>

    <section id="soils">
      <h2>6. 八种土壤：锁值与土性融合</h2>
      <p class="note">
        <strong>始终生效</strong>：锁水 / 锁肥 / 锁微量（外部供给 × 锁值 → 作物累计）；
        土种偏好（成熟生长分 ±1）与水分习性 <code>water_profile</code>。
      </p>
      <p class="note note-fusion">
        <strong>需超融合</strong>：下列「土性融合」；与文丘里 A 面同一全局条件。
      </p>
      <table>
        <thead>
          <tr>
            <th>土种</th><th>分布</th><th>锁水</th><th>锁肥</th><th>锁微量</th>
            <th>融合</th><th>激活后效果</th><th>吸收乘区</th>
          </tr>
        </thead>
        <tbody>
${soilRows
  .map(
    (s) =>
      `          <tr><td><strong>${esc(s.name)}</strong><br><code>${esc(s.id)}</code></td><td>${esc(s.region)}</td><td>${s.water}</td><td>${s.fert}</td><td>${s.trace}</td><td><span class="tag tag-fusion">${esc(s.fusionLabel)}</span><br><code class="muted">${esc(s.effectId)}</code></td><td>${esc(s.fusionSummary)}</td><td>${esc(s.modNote)}</td></tr>`
  )
  .join('\n')}
        </tbody>
      </table>
      <h3>6.1 锁值公式</h3>
      <ul class="compact">
        <li>Δ水分 = 来源格水量 W × <code>water_retention</code></li>
        <li>Δ微量 = 来源格浓度 C × <code>trace_retention</code> ×（模板 <code>trace_absorption_multiplier</code>）</li>
        <li>Δ施肥 = 瓮施加量 × <code>fertilizer_retention</code> ×（融合时 <code>fertilizer_multiplier</code>）</li>
      </ul>
      <h3>6.2 水分习性</h3>
      <table>
        <thead><tr><th>值</th><th>含义</th><th>土壤关系（摘要）</th></tr></thead>
        <tbody>
          <tr><td><code>xeric</code></td><td>耐旱忌涝；超涝害线生长分 0</td><td>偏好盐碱/黄绵/褐土；不适水稻土</td></tr>
          <tr><td><code>mesic</code></td><td>常规</td><td>按作物组与档位</td></tr>
          <tr><td><code>hydrophilic</code></td><td>喜湿；完美窗偏高</td><td>偏好水稻土/黑土/紫土；不适盐碱/黄绵</td></tr>
          <tr><td><code>aquatic</code></td><td>水生/池栽</td><td>更依赖高锁水土；常需深水池等建造物</td></tr>
        </tbody>
      </table>
    </section>

    <section id="fusion">
      <h2>7. 超融合（200 金 · 全局开关）</h2>
      <ul class="compact">
        <li>≥1 座：文丘里 → <strong>A 面</strong>；全场 <code>fusion_gated</code> 土性激活。</li>
        <li>0 座：文丘里 → <strong>B 面</strong>（有水+海藻精效果即向归属水流常注）；土性融合关闭。</li>
        <li>多座不叠加；拆除最后一座<strong>立即</strong>回退。</li>
      </ul>
    </section>

    <section id="venturi">
      <h2>8. 文丘里施肥器与海藻精</h2>
      <table>
        <thead><tr><th>等级</th><th>设定浓度范围（含端点）</th><th>升级</th></tr></thead>
        <tbody>
          <tr><td>1</td><td class="const-num">5 ～ 10</td><td rowspan="3">5 金/级，最高 3 级</td></tr>
          <tr><td>2</td><td class="const-num">3 ～ 15</td></tr>
          <tr><td>3</td><td class="const-num">1 ～ 20</td></tr>
        </tbody>
      </table>
      <h3>8.1 A 面 / B 面</h3>
      <table>
        <thead><tr><th>面</th><th>条件</th><th>输送条件</th></tr></thead>
        <tbody>
          <tr><td><strong>B 面（默认）</strong></td><td>无超融合</td><td>罐内海藻精效果存续 + 四邻有水渠 + 能沿归属水流抵达终点 → 按设定浓度均分维持（<strong>不</strong>读作物请求）</td></tr>
          <tr><td><strong>A 面</strong></td><td>有超融合</td><td>同上 + 检测范围内有<strong>已登记且可达</strong>的 <code>requests_seaweed_extract</code> 作物；无请求则不输送</td></tr>
        </tbody>
      </table>
      <h3>8.2 浓度均分（§15.4）</h3>
      <ul class="compact">
        <li>每施肥器每 tick <strong>只向一个方向</strong>注入（下→右→左→上择首合法）。</li>
        <li>单格浓度 = 设定浓度 ÷（入口后至水流终点之间的有水渠格数）；<strong>入口格不计</strong>。</li>
        <li>不同施肥器 / 不同水流视为不同来源，格上浓度<strong>相加</strong>；同来源不叠加。</li>
        <li>作物请求：模板 <code>true</code> 且四邻有水渠 → 向主流登记；若受水归属支流 #N，再向 #N 登记。</li>
      </ul>
      <p class="note">海藻精专文：<a href="seaweed-extract-design-standalone.html">seaweed-extract-design-standalone.html</a>（<code>npm run build:seaweed-extract-standalone</code>）</p>
    </section>

    <section id="buried-jar">
      <h2>9. 埋地陶瓮（液态肥）</h2>
      <ul class="compact">
        <li>仅接受 <code>agriculture_buried_jar_injectable</code> 液态肥（如 <code>liquid_fertilizer_n</code>）；<strong>不可</strong>装海藻精。</li>
        <li><strong>八邻</strong>（含斜角）向生长中作物累加施肥值；已成熟不再累加。</li>
        <li><code>requests_liquid_fertilizer === true</code> 才接收瓮肥（与海藻精「不登记仍可吸渠内浓度」不同）。</li>
        <li>存量型：本 tick 至少命中一株则 <code>units -= 1</code>；多瓮邻接同一作物可叠加。</li>
      </ul>
    </section>

    <section id="structures">
      <h2>10. 耕地建造物（种植门禁）</h2>
      <p class="note">须开垦 → 建造（20 金 + 10 tick 工程）→ 播种。有作物时不可拆建造物/耕地。</p>
      <table>
        <thead><tr><th>建造物</th><th>id</th><th>作物 id</th></tr></thead>
        <tbody>
${Object.entries(structReq)
  .map(
    ([id, ids]) =>
      `          <tr><td>${esc(structLabels[id] || id)}</td><td><code>${esc(id)}</code></td><td>${ids.map((x) => '<code>' + esc(x) + '</code>').join('、')}</td></tr>`
  )
  .join('\n')}
        </tbody>
      </table>
      <p class="muted">其余 ${cropRows.filter((r) => r.structId === '—').length} 种作物仅需开垦，无建造物要求。Gameplay 数值修正待种植篇落地。</p>
    </section>

    <section id="growth">
      <h2>11. 生长、成熟与产量</h2>
      <h3>11.1 可收获硬门槛</h3>
      <ul class="compact">
        <li>生长 tick 用尽后结算：累计水分须在 <code>[minWater, maxWater]</code> 内，否则枯/淹无收。</li>
        <li><code>trace_sensitivity=severe</code> 且微量 ≥ <code>trace_fail_harvest_at</code> → 绝收。</li>
        <li>健康 ≤0 → 枯萎，不进成熟水分结算。</li>
      </ul>
      <h3>11.2 生长分与产量（通过后）</h3>
      <table>
        <thead><tr><th>维度</th><th>2 分</th><th>1 分</th><th>0 / 绝收</th></tr></thead>
        <tbody>
          <tr><td>水分</td><td>[perfectMin, perfectMax]</td><td>可收获但未进窗</td><td>枯/淹（不进评分）</td></tr>
          <tr><td>微量</td><td>配置窗或排斥 ≤ safe</td><td>可收获未进窗</td><td>排斥超 safe</td></tr>
          <tr><td>施肥</td><td>配置窗</td><td>可收获未进窗</td><td>未配维不参与</td></tr>
          <tr><td>土壤</td><td colspan="3">偏好 +1 / 不适 −1 / 其余 0</td></tr>
          <tr><td>轮作</td><td colspan="3">换 group 或豆科后非豆科 +1；连作 0（黑土融合等另规）</td></tr>
        </tbody>
      </table>
      <p class="note">
        产量：<code>yieldMultiplier = 1 + ${growthRules.yield_per_positive_point ?? 0.25} × 正分 − min(${(growthRules.yield_per_negative_point ?? 0.25)} × 负分, ${growthRules.negative_penalty_cap ?? 0.5})</code>；
        <code>harvestCount = max(1, floor(random(harvestMin..harvestMax) × yieldMultiplier))</code>。
        不向玩家展示生长分档位名。
      </p>
      <h3>11.3 五档口径摘要</h3>
      <table>
        <thead><tr><th>档位</th><th>生长分参与</th><th>理论正分上限（约）</th></tr></thead>
        <tbody>${tierSummaryRows}</tbody>
      </table>
    </section>

    <section id="algae">
      <h2>12. 水藻爆发</h2>
      <ul class="compact">
        <li>有水渠且 <code>C &gt; 2.5 × W</code>（<code>C≤0</code> 不爆发）。</li>
        <li>生长中作物若唯一滋养来源为该爆发渠 → 每 tick 健康 −2（先完成微量吸收再扣血）。</li>
        <li>不区分是否请求海藻精；不阻止施肥器维持浓度。</li>
      </ul>
      <p class="note-warn note">高等级文丘里可调更高浓度，策略上更易触发爆发，属预期风险。</p>
    </section>

    <section id="trace">
      <h2>13. 微量排斥（海藻精累计 traceAbsorbed）</h2>
      <table>
        <thead><tr><th>类型</th><th>作物</th><th>规则摘要</th></tr></thead>
        <tbody>
          <tr><td><span class="tag tag-lethal">绝对致死</span></td><td>${(traceCat.lethal?.crop_ids || []).map((x) => '<code>' + esc(x) + '</code>').join(' ')}</td><td>${esc(traceCat.lethal?.label || '')}；不登记海藻精请求</td></tr>
          <tr><td><span class="tag tag-severe">严重排斥</span></td><td>${(traceCat.severe?.crop_ids || []).map((x) => '<code>' + esc(x) + '</code>').join(' ')}</td><td>${esc(traceCat.severe?.label || '')}；微量生长分 ≤safe 得 2 分</td></tr>
        </tbody>
      </table>
    </section>

    <section id="shop">
      <h2>14. 种子商店（Demo）</h2>
      <table>
        <thead><tr><th>档位</th><th>累计交易额门槛</th><th>说明</th></tr></thead>
        <tbody>${tierUnlockRows}</tbody>
      </table>
      <p class="note">
        售出：种子 <code>max(${shop.demo_sell_price?.min ?? 3}, round(商店价 × ${shop.demo_sell_price?.seed_ratio ?? 0.5}))</code>；
        作物 <code>× ${shop.demo_sell_price?.crop_ratio ?? 0.8}</code>。
        五档各 10 种，售价约 6～24 金（锚点花生种子 10 金）。
      </p>
    </section>

    <section id="crops">
      <h2>15. 全部作物参数表（${cropRows.length} 种）</h2>
      <div class="filters">
        <label>档位 <select id="filter-tier"><option value="">全部</option>${[1, 2, 3, 4, 5].map((t) => `<option value="${t}">${esc(tierLabels[t] || t + '档')}</option>`).join('')}</select></label>
        <label>习性 <select id="filter-wp"><option value="">全部</option><option value="xeric">耐旱</option><option value="mesic">常规</option><option value="hydrophilic">喜湿</option><option value="aquatic">水生</option></select></label>
        <label>建造物 <select id="filter-struct"><option value="">全部</option>${Object.entries(structLabels).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label>微量 <select id="filter-trace"><option value="">全部</option><option value="lethal">致死</option><option value="severe">排斥</option><option value="none">无</option></select></label>
        <label>搜索 <input type="search" id="filter-q" placeholder="名称 / id / 土种" /></label>
      </div>
      <div style="overflow-x:auto; max-height: 75vh;">
        <table id="crop-table">
          <thead>
            <tr>
              <th>档</th><th>种子</th><th>作物</th><th>价</th><th>周期</th><th>收获量</th>
              <th>习性</th><th>成熟水分</th><th>高分水分</th><th>涝害&gt;</th>
              <th>偏好土</th><th>不适土</th><th>生长分</th>
              <th>微量</th><th>施肥</th><th>要海藻</th><th>要液肥</th>
              <th>建造物</th><th>备注</th>
            </tr>
          </thead>
          <tbody id="crop-tbody"></tbody>
        </table>
      </div>
    </section>

    <section id="peanut">
      <h2>16. 花生（二档全维示范）</h2>
      <table>
        <tbody>
          <tr><th>生长周期</th><td class="const-num">${peanut.growthTicks ?? '—'} tick</td></tr>
          <tr><th>成熟水分</th><td class="const-num">${peanut.minWater ?? '—'} ～ ${peanut.maxWater ?? '—'}</td></tr>
          <tr><th>高分水分</th><td class="const-num">${peanut.perfectMinWater ?? '—'} ～ ${peanut.perfectMaxWater ?? '—'}</td></tr>
          <tr><th>微量 2 分</th><td class="const-num">≥ ${peanut.perfectMinTrace ?? '—'}</td></tr>
          <tr><th>施肥 2 分</th><td class="const-num">≥ ${peanut.perfectMinFertilizer ?? '—'}</td></tr>
          <tr><th>收获基数</th><td class="const-num">${peanut.harvestMin ?? '—'} ～ ${peanut.harvestMax ?? '—'}</td></tr>
          <tr><th>请求</th><td>海藻精 + 液态肥</td></tr>
          <tr><th>豆科</th><td>${peanut.nitrogen_fixing ? '是（轮作友好）' : '否'}</td></tr>
        </tbody>
      </table>
    </section>

    <section id="refs">
      <h2>17. 附录与维护</h2>
      <ul class="compact">
        <li>设计稿全文：<code>docs/design/28-agriculture-irrigation.md</code></li>
        <li>作物简表（旧）：<a href="agriculture-crop-design-overview.html">agriculture-crop-design-overview.html</a>（<code>npm run build:agriculture-crop-overview</code>）</li>
        <li>生成命令：<code>npm run build:agriculture-design-full</code>（会先跑 <code>gen-agriculture-crop-defs</code>）</li>
        <li>改 CSV 种子 / 土壤 JSON 后务必重新生成并刷新本页</li>
      </ul>
    </section>
  </div>
  <script>
    window.CROP_OVERVIEW_ROWS = ${JSON.stringify(cropRows)};
    window.CROP_OVERVIEW_TIER_LABELS = ${JSON.stringify(tierLabels)};
    window.CROP_OVERVIEW_COL_COUNT = ${COL_COUNT};
    (function () {
      var tbody = document.getElementById("crop-tbody");
      var ft = document.getElementById("filter-tier");
      var fwp = document.getElementById("filter-wp");
      var fs = document.getElementById("filter-struct");
      var ftr = document.getElementById("filter-trace");
      var fq = document.getElementById("filter-q");
      var colCount = window.CROP_OVERVIEW_COL_COUNT || 18;
      function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
      function traceTag(sens) {
        if (sens === "lethal") return '<span class="tag tag-lethal">致死</span>';
        if (sens === "severe") return '<span class="tag tag-severe">排斥</span>';
        return "—";
      }
      function wpTag(wp, label) {
        if (wp === "xeric") return '<span class="tag tag-water-xeric">' + esc(label) + '</span>';
        if (wp === "hydrophilic") return '<span class="tag tag-water-hydro">' + esc(label) + '</span>';
        if (wp === "aquatic") return '<span class="tag tag-water-aqua">' + esc(label) + '</span>';
        return esc(label || "常规");
      }
      function render() {
        var tier = ft.value;
        var wp = fwp.value;
        var struct = fs.value;
        var trace = ftr.value;
        var q = (fq.value || "").trim().toLowerCase();
        var html = "";
        var lastTier = null;
        window.CROP_OVERVIEW_ROWS.forEach(function (r) {
          if (tier && String(r.tier) !== tier) return;
          if (wp && r.waterProfile !== wp) return;
          if (struct && r.structId !== struct) return;
          if (trace === "lethal" && r.traceSens !== "lethal") return;
          if (trace === "severe" && r.traceSens !== "severe") return;
          if (trace === "none" && r.traceSens !== "—") return;
          if (q) {
            var blob = (r.seedName + r.seedId + r.cropId + r.growNote + r.soilPreferred + r.soilUnsuitable).toLowerCase();
            if (blob.indexOf(q) < 0) return;
          }
          if (lastTier !== r.tier) {
            lastTier = r.tier;
            var tl = window.CROP_OVERVIEW_TIER_LABELS[r.tier] || (r.tier + " 档");
            html += '<tr class="tier-head"><td colspan="' + colCount + '">' + esc(tl) + '</td></tr>';
          }
          var harvest = (r.harvestMin != null && r.harvestMax != null) ? (r.harvestMin + "～" + r.harvestMax) : "—";
          var structCell = r.structId === "—" ? "—" : '<span class="tag tag-struct">' + esc(r.structName) + '</span>';
          var traceCell = traceTag(r.traceSens);
          if (r.traceScore !== "—") traceCell += " " + esc(r.traceScore);
          var prefCell = r.soilPreferred === "—" ? "—" : '<span class="tag tag-soil-ok">' + esc(r.soilPreferred) + '</span>';
          var badCell = r.soilUnsuitable === "—" ? "—" : '<span class="tag tag-soil-bad">' + esc(r.soilUnsuitable) + '</span>';
          html += "<tr><td>" + r.tier + "</td><td>" + esc(r.seedName) + "<br><code>" + esc(r.seedId) + "</code></td><td><code>" +
            esc(r.cropId) + "</code></td><td>" + r.price + "</td><td>" + (r.growthTicks || "—") + "</td><td>" + harvest +
            "</td><td>" + wpTag(r.waterProfile, r.waterProfileLabel) + "</td><td>" + esc(r.water) + "</td><td>" + esc(r.perfectWater) +
            "</td><td>" + (r.waterloggedAbove ? esc(r.waterloggedAbove) : "—") + "</td><td>" + prefCell + "</td><td>" + badCell +
            "</td><td>" + esc(r.scoreDims) + "</td><td>" + traceCell + "</td><td>" + esc(r.fertScore) + "</td><td>" +
            (r.requestsSeaweed || "—") + "</td><td>" + (r.requestsFert || "—") + "</td><td>" + structCell +
            "</td><td>" + esc(r.growNote) + "</td></tr>";
        });
        tbody.innerHTML = html || '<tr><td colspan="' + colCount + '">无匹配</td></tr>';
      }
      [ft, fwp, fs, ftr, fq].forEach(function (el) { el.addEventListener("input", render); el.addEventListener("change", render); });
      render();
    })();
  </script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(
  'Wrote',
  OUT,
  '(' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB; crops:',
  cropRows.length + ', soils:',
  soilRows.length + ')'
);
