/**
 * 生成农业作物/种子/建造物/土壤设计总览（单文件 HTML，内嵌 JSON，可离线打开）
 * 用法：node tools/build-agriculture-crop-overview-html.mjs
 * 输出：agriculture-crop-design-overview.html（项目根）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOP_JSON = path.join(ROOT, 'data', 'agriculture-seed-shop.json');
const CROP_JSON = path.join(ROOT, 'data', 'agriculture-crop-defs.json');
const SOILS_JSON = path.join(ROOT, 'data', 'agriculture-soils.json');
const POOL_UPGRADES_JSON = path.join(ROOT, 'data', 'agriculture-pool-upgrades.json');
const OUT = path.join(ROOT, 'agriculture-crop-design-overview.html');

const shop = JSON.parse(fs.readFileSync(SHOP_JSON, 'utf8'));
let poolUpgradesDoc = { levels: {}, baseline_pool_water: 200 };
try {
  poolUpgradesDoc = JSON.parse(fs.readFileSync(POOL_UPGRADES_JSON, 'utf8'));
} catch (_) {
  /* optional */
}
const cropsDoc = JSON.parse(fs.readFileSync(CROP_JSON, 'utf8'));
const soilsDoc = JSON.parse(fs.readFileSync(SOILS_JSON, 'utf8'));
const crops = cropsDoc.crops || {};
const structLabels = cropsDoc.crop_structure_labels || {};
const structReq = cropsDoc.crop_structure_requirements || {};
const traceCat = cropsDoc.trace_sensitivity_catalog || {};
const tierLabels = shop.tiers || {};
const waterProfileLabels = cropsDoc.water_profile_labels || {};

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
    designNote: s.design_note || ''
  };
}).filter(Boolean);

const rows = shop.seeds.map((s) => {
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
    waterProfile: wp,
    waterProfileLabel: waterProfileLabels[wp] || wp,
    waterloggedAbove: d.waterlogged_above != null ? String(d.waterlogged_above) : '',
    soilPreferred: (sc.preferred || []).join('、') || '—',
    soilUnsuitable: (sc.unsuitable || []).join('、') || '—',
    soilTags: (d.soil_tags || []).join('、') || '—',
    water: d.minWater != null ? `${d.minWater}～${d.maxWater}` : '—',
    perfectWater:
      d.perfectMinWater != null ? `${d.perfectMinWater}～${d.perfectMaxWater}` : '—',
    traceSens: d.trace_sensitivity || '—',
    traceSafe: d.trace_safe_max != null ? String(d.trace_safe_max) : '—',
    traceScore:
      d.perfectMinTrace != null
        ? (d.perfectMaxTrace != null
          ? `${d.perfectMinTrace}～${d.perfectMaxTrace}`
          : `${d.perfectMinTrace}+`)
        : d.trace_sensitivity
          ? `≤${d.trace_safe_max}`
          : '—',
    fertScore:
      d.perfectMinFertilizer != null
        ? (d.perfectMaxFertilizer != null
          ? `${d.perfectMinFertilizer}～${d.perfectMaxFertilizer}`
          : `${d.perfectMinFertilizer}+`)
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
}).sort((a, b) => (a.tier || 0) - (b.tier || 0) || a.seedName.localeCompare(b.seedName, 'zh'));

const COL_COUNT = 16;

function poolLevelRowsFromJson() {
  const levels = poolUpgradesDoc.levels || {};
  const order = ['1', '2', '3', '4'].filter((k) => levels[k]);
  const feat = {
    1: '常态灌溉预算 200；无窃流、无蓄水池',
    2: '解锁支流窃流（扣近救远）；transfer_cap=2',
    3: '蓄水池（配合天气）；窃流 cap 仍为 2',
    4: '窃流 transfer_cap=4；受益接不满→溢流回蓄水池'
  };
  const demoCost = { 2: 100, 3: 200, 4: 350 };
  const mainCost = {
    2: '黏土×3 + 青竹×2 · 12 tick×5 体力',
    3: '黏土×6 + 青竹×3 + 软木板×1 · 20 tick×5 体力',
    4: '黏土×4 + 青竹×2 + 生铁×1 · 15 tick×5 体力'
  };
  return order
    .map((k) => {
      const L = levels[k];
      const lv = L.level != null ? L.level : Number(k);
      const theft = L.branch_theft || {};
      const res = L.reservoir || {};
      const cap = theft.transfer_cap != null ? theft.transfer_cap : '—';
      const resTxt = res.enabled
        ? `上限 ${res.capacity_max || 50000}`
        : '—';
      const overflow = L.theft_overflow_to_reservoir ? '是' : '—';
      return {
        lv,
        feat: feat[lv] || L.label_key || '',
        cap,
        resTxt,
        overflow,
        demoCost: demoCost[lv] != null ? demoCost[lv] + ' 金' : '—',
        mainCost: mainCost[lv] != null ? mainCost[lv] : '—'
      };
    });
}

const poolLevelRows = poolLevelRowsFromJson();

const html = `<!DOCTYPE html>
<!-- AUTO-GENERATED by tools/build-agriculture-crop-overview-html.mjs — 勿手改；改 data 后重新运行脚本 -->
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>农业作物与种植条件总览</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #1c1815;
      color: #e8e6e3;
      font-family: "Noto Serif SC", "Microsoft YaHei", serif;
      line-height: 1.5;
      font-size: 14px;
    }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 20px 16px 48px; }
    h1 {
      font-size: 22px;
      color: #d3a060;
      margin: 0 0 6px;
      border-bottom: 2px solid #4d4d45;
      padding-bottom: 10px;
    }
    .sub { color: #8e8e8e; font-size: 12px; margin-bottom: 16px; }
    nav.toc {
      font-size: 13px;
      margin-bottom: 16px;
      padding: 10px 14px;
      border: 1px solid #4d4d45;
      border-radius: 8px;
      background: #221c16;
    }
    nav.toc a { color: #7ab89a; text-decoration: none; margin-right: 12px; }
    nav.toc a:hover { color: #d3a060; }
    section {
      border: 1px solid #4d4d45;
      border-radius: 10px;
      background: #1a1512;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    h2 { font-size: 16px; color: #7ab89a; margin: 0 0 10px; }
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
    th { background: #251d17; color: #d3a060; position: sticky; top: 0; z-index: 1; }
    tr.tier-head td {
      background: #2a2218;
      color: #d3a060;
      font-weight: bold;
    }
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
    .note {
      border-left: 3px solid #d3a060;
      padding: 8px 12px;
      margin: 10px 0;
      background: #221c16;
      font-size: 13px;
      color: #d8cfbf;
    }
    .note-fusion { border-left-color: #8a6a9a; }
    ul.compact { margin: 8px 0; padding-left: 20px; font-size: 13px; color: #d8cfbf; }
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
    a.play { color: #7ab89a; }
    .muted { color: #8e8e8e; font-size: 11px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>农业作物与种植条件总览</h1>
    <p class="sub">
      内嵌 <code>agriculture-seed-shop.json</code>、<code>agriculture-crop-defs.json</code>、<code>agriculture-soils.json</code>（生成时快照）。
      完整玩法+数值说明：<a class="play" href="agriculture-design-full.html">agriculture-design-full.html</a>（<code>npm run build:agriculture-design-full</code>）。
      灌溉试玩：<a class="play" href="tools/agriculture-irrigation-demo.html">agriculture-irrigation-demo.html</a>（水池升级 / 天气 / 窃流）。
      可玩整合：<a class="play" href="agriculture-standalone.html">agriculture-standalone.html</a>（<code>npm run build:agriculture-standalone</code>）。
      权威规则：<code>docs/design/28-agriculture-irrigation.md</code> · 池表 <code>data/agriculture-pool-upgrades.json</code>
    </p>
    <nav class="toc">
      <a href="#pool">水池升级</a>
      <a href="#tick-order">Tick 顺序</a>
      <a href="#soils">八种土壤</a>
      <a href="#fusion">超融合</a>
      <a href="#water-profile">水分习性</a>
      <a href="#struct">建造物</a>
      <a href="#trace">微量排斥</a>
      <a href="#table">50 种作物</a>
      <a href="#tiers">五档说明</a>
    </nav>

    <section id="pool">
      <h2>左上角水池升级（不抬常态 200）</h2>
      <p class="note">
        常态灌溉预算 <strong>${poolUpgradesDoc.baseline_pool_water || 200}</strong>（各等级首版不提高该常数）。
        升级偏<strong>特效</strong>：支路调度与旱涝缓冲，而非单纯加水。
        主游戏：材料 + 面板工程 tick（规划见 <code>agriculture-build-costs.json</code> → <code>upgrades.pool_level</code>，待落盘）。
        Demo：金币一键升级（侧栏「水池」卡片）。
      </p>
      <table>
        <thead>
          <tr>
            <th>等级</th><th>特效</th><th>窃流 cap</th><th>蓄水池</th><th>溢流回蓄</th>
            <th>Demo 升级金</th><th>主游戏消耗（规划）</th>
          </tr>
        </thead>
        <tbody>
${poolLevelRows
  .map(
    (r) =>
      `          <tr><td><strong>L${r.lv}</strong></td><td>${r.feat}</td><td>${r.cap}</td><td>${r.resTxt}</td><td>${r.overflow}</td><td>${r.demoCost}</td><td>${r.mainCost}</td></tr>`
  )
  .join('\n')}
        </tbody>
      </table>
      <h3>支流窃流（L2+，§8.4）</h3>
      <ul class="compact">
        <li>时机：每 tick <strong>清水分配之后</strong>（步骤 1b）。</li>
        <li>玩家设 <strong>牺牲支流</strong> 与 <strong>受益支流</strong>；硬约束 <code>牺牲编号 &lt; 受益编号</code>（扣近救远：只从分配顺序更靠前的支路总水量比例抽，灌给更靠后的支路）。</li>
        <li>只动支路专属渠格清水；不扣池面、主干、其它支流；不搬海藻精浓度。</li>
        <li>牺牲支路各格按同一比例缩小总水量；受益支路按各格 headroom 比例灌入，每格 ≤ capacity。</li>
      </ul>
      <h3>蓄水池（L3+，§8.5 · 配合主游戏天气）</h3>
      <ul class="compact">
        <li>游戏内<strong>一日一个数</strong> <code>pool_budget_effective_day</code>（当日每个农业 tick 相同）。</li>
        <li><strong>涝</strong>（E &gt; 200）：超出部分入蓄水池（上限 50000），本 tick 仍只灌 200；蓄满后超出<strong>浪费</strong>。</li>
        <li><strong>旱</strong>（E &lt; 200）：从蓄水池扣减补差，本 tick 灌溉预算最多回到 200。</li>
        <li>Demo 下拉模拟：旱 150 / 晴 200 / 雨 230 / 暴雨 280。</li>
      </ul>
      <h3>窃流溢流回蓄（L4，§8.6）</h3>
      <ul class="compact">
        <li>窃流计划挪动量为 <code>transfer</code>，受益支路实际灌入 <code>delivered</code>；<code>overflow = transfer − delivered</code> 记入同一蓄水池（仍受 50000 上限，超出浪费）。</li>
        <li>不增加本 tick 渠内水量；旱日步骤 0 可再放出。</li>
      </ul>
    </section>

    <section id="tick-order">
      <h2>农业地图每 tick 结算顺序（§15.0）</h2>
      <ol class="compact">
        <li><strong>0</strong> 蓄水池 + 当日池预算（L3+）→ <code>pool_budget_for_allocation</code></li>
        <li><strong>1</strong> 清水分配（主干 → 支流 #1 → #2 …）</li>
        <li><strong>1b</strong> 支流窃流（L2+；L4 溢流回蓄）</li>
        <li><strong>2</strong> 海藻精维持 / 注入</li>
        <li><strong>3</strong> 水藻爆发判定</li>
        <li><strong>4～5b</strong> 作物吸收水 / 微量 / 排斥 / 埋瓮施肥</li>
        <li><strong>6～7</strong> 爆发扣健康、生长倒计时等</li>
      </ol>
      <p class="note">L1～2 无蓄水池时，Demo 可将当日 E 直接作为本 tick 灌溉预算（便于升三级前试天气）。</p>
    </section>

    <section id="soils">
      <h2>八种土壤：默认锁值 + 土性融合</h2>
      <p class="note">
        <strong>始终生效</strong>：每格耕地的三项锁值（锁水 / 锁肥 / 锁微量），决定灌溉、瓮肥、海藻精<strong>入账比例</strong>；
        以及各作物的<strong>土种偏好</strong>（偏好 +1 / 不适 −1）与<strong>水分习性</strong>（见下节）。
        新地图默认 <strong>盐碱土</strong>；可用客土改良更换土种。
      </p>
      <p class="note note-fusion">
        <strong>需超融合才激活</strong>：下表「土性融合」列；与文丘里切 <strong>A 面</strong> 同一条件（场上 ≥1 座超融合，全局生效，拆除后立即关闭）。
      </p>
      <table>
        <thead>
          <tr>
            <th>土种</th><th>分布</th><th>锁水</th><th>锁肥</th><th>锁微量</th>
            <th>融合标签</th><th>土性融合（超融合后）</th><th>吸收乘区</th>
          </tr>
        </thead>
        <tbody>
${soilRows
  .map(
    (s) =>
      `          <tr><td><strong>${s.name}</strong><br><code>${s.id}</code></td><td>${s.region}</td><td>${s.water}</td><td>${s.fert}</td><td>${s.trace}</td><td><span class="tag tag-fusion">${s.fusionLabel}</span></td><td>${s.fusionSummary}</td><td>${s.modNote}</td></tr>`
  )
  .join('\n')}
        </tbody>
      </table>
    </section>

    <section id="fusion">
      <h2>超融合（200 金 · 全局开关）</h2>
      <ul class="compact">
        <li>场上存在<strong>至少一座</strong>超融合时：全场文丘里海藻精 → <strong>A 面</strong>（按作物请求输送）；全场耕地开启上表<strong>土性融合</strong>。</li>
        <li>无超融合时：文丘里默认 <strong>B 面</strong>（有水+效果即常注）；土性融合关闭，仅保留锁值与土种/习性规则。</li>
        <li>多座超融合<strong>不叠加</strong>；拆除最后一座后两项效果<strong>立即</strong>回退。</li>
      </ul>
      <p class="note">Demo 中选中超融合格或耕地，侧栏可见「土性已融合 / 未融合」与锁值摘要。</p>
    </section>

    <section id="water-profile">
      <h2>作物水分习性（始终生效）</h2>
      <table>
        <thead><tr><th>习性</th><th>含义</th><th>与土壤的关系（摘要）</th></tr></thead>
        <tbody>
          <tr><td><span class="tag tag-water-xeric">耐旱忌涝</span></td><td>完美水分窗偏低；超过涝害线生长分 0</td><td>偏好盐碱 / 黄绵 / 褐土；不适水稻土；低锁水土易控水</td></tr>
          <tr><td>常规</td><td>标准窗</td><td>按作物组与档位分土</td></tr>
          <tr><td><span class="tag tag-water-hydro">喜湿</span></td><td>完美窗偏高</td><td>偏好水稻土 / 黑土 / 紫土；不适盐碱 / 黄绵</td></tr>
          <tr><td><span class="tag tag-water-aqua">水生</span></td><td>池栽 / 深水池</td><td>同喜湿，更依赖高锁水土</td></tr>
        </tbody>
      </table>
      <p class="note">作物表中「涝害&gt;」仅 <strong>耐旱忌涝</strong> 作物显示；融合后盐碱 / 水稻土等会再调整涝害线或周期（见土壤表）。</p>
    </section>

    <section id="struct">
      <h2>耕地建造物 → 种植门禁</h2>
      <p class="note">须先<strong>开垦</strong>，再建造对应设施，然后才能播种表中作物。其余作物仅需开垦。</p>
      <table>
        <thead><tr><th>建造物</th><th>id</th><th>作物</th></tr></thead>
        <tbody>
${Object.entries(structReq)
  .map(
    ([id, ids]) =>
      `          <tr><td>${structLabels[id] || id}</td><td><code>${id}</code></td><td>${ids.map((x) => `<code>${x}</code>`).join('、')}</td></tr>`
  )
  .join('\n')}
        </tbody>
      </table>
    </section>

    <section id="trace">
      <h2>微量排斥（海藻精累计，非液态肥）</h2>
      <table>
        <thead><tr><th>类型</th><th>作物 id</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><span class="tag tag-lethal">绝对致死</span></td><td>${(traceCat.lethal?.crop_ids || []).map((x) => `<code>${x}</code>`).join(' ')}</td><td>安全微量极低；超限快速枯死</td></tr>
          <tr><td><span class="tag tag-severe">严重排斥</span></td><td>${(traceCat.severe?.crop_ids || []).map((x) => `<code>${x}</code>`).join(' ')}</td><td>超安全线扣血；过高成熟无收</td></tr>
        </tbody>
      </table>
      <p class="note">紫色土融合后：要海藻精作物微量窗 ±10%；排斥微量作物 safe 线 ×0.9。</p>
    </section>

    <section id="table">
      <h2>50 种种子 / 作物参数</h2>
      <div class="filters">
        <label>档位 <select id="filter-tier"><option value="">全部</option>${[1, 2, 3, 4, 5].map((t) => `<option value="${t}">${tierLabels[t] || t + '档'}</option>`).join('')}</select></label>
        <label>习性 <select id="filter-wp"><option value="">全部</option><option value="xeric">耐旱忌涝</option><option value="mesic">常规</option><option value="hydrophilic">喜湿</option><option value="aquatic">水生</option></select></label>
        <label>建造物 <select id="filter-struct"><option value="">全部</option>${Object.entries(structLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>微量 <select id="filter-trace"><option value="">全部</option><option value="lethal">绝对致死</option><option value="severe">严重排斥</option><option value="none">无排斥</option></select></label>
        <label>搜索 <input type="search" id="filter-q" placeholder="名称 / id / 土种" /></label>
      </div>
      <div style="overflow-x:auto; max-height: 70vh;">
        <table id="crop-table">
          <thead>
            <tr>
              <th>档</th><th>种子</th><th>作物 id</th><th>售价</th><th>周期</th>
              <th>习性</th><th>成熟水分</th><th>高分水分</th><th>涝害&gt;</th>
              <th>偏好土</th><th>不适土</th>
              <th>生长分维</th><th>微量</th><th>施肥</th><th>建造物</th><th>备注</th>
            </tr>
          </thead>
          <tbody id="crop-tbody"></tbody>
        </table>
      </div>
    </section>

    <section id="tiers">
      <h2>五档生长口径（摘要）</h2>
      <ul class="compact">
        <li><strong>1 档</strong>：水 + 土 + 轮作；微量/肥不参与生长分。</li>
        <li><strong>2 档</strong>：常见田园；花生为二档全维示例（水+微+土+轮，非示范田专属）。</li>
        <li><strong>3 档</strong>：水 + 微量 + 肥 + 土 + 轮作；可登记液态肥。</li>
        <li><strong>4～5 档</strong>：全维计分、窗口更窄；4 档起可登记海藻精。</li>
      </ul>
      <h3>生长分速查</h3>
      <ul class="compact">
        <li>每<strong>正分</strong> +25% 产量；每<strong>负分</strong> −25%（负分惩罚封顶 −50%）。</li>
        <li><strong>土种</strong>：偏好 +1 / 不适 −1（始终）；盐碱融合：耐盐 +1 / 非耐盐 −1。</li>
        <li><strong>轮作</strong>：换 group <strong>+2</strong>；豆科后非豆科 <strong>+2</strong>（实现已加大；黄绵/草甸融合另有加成）；黑土融合连作 −1/−2。</li>
      </ul>
      <p class="note">完整规则见 <code>docs/design/28-agriculture-irrigation.md</code> §2.2b / §2.2g / §4b.3 / §8.4～§8.6；海藻精见 <code>seaweed-extract-design-standalone.html</code>。</p>
    </section>
  </div>
  <script>
    window.CROP_OVERVIEW_ROWS = ${JSON.stringify(rows)};
    window.CROP_OVERVIEW_TIER_LABELS = ${JSON.stringify(tierLabels)};
    window.CROP_OVERVIEW_COL_COUNT = ${COL_COUNT};
    (function () {
      var tbody = document.getElementById("crop-tbody");
      var ft = document.getElementById("filter-tier");
      var fwp = document.getElementById("filter-wp");
      var fs = document.getElementById("filter-struct");
      var ftr = document.getElementById("filter-trace");
      var fq = document.getElementById("filter-q");
      var colCount = window.CROP_OVERVIEW_COL_COUNT || 15;
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
          var structCell = r.structId === "—" ? "—" : '<span class="tag tag-struct">' + esc(r.structName) + '</span> <code>' + esc(r.structId) + '</code>';
          var traceCell = traceTag(r.traceSens);
          if (r.traceScore !== "—") traceCell += " " + esc(r.traceScore);
          else if (r.traceSafe !== "—") traceCell += " ≤" + r.traceSafe;
          var prefCell = r.soilPreferred === "—" ? "—" : '<span class="tag tag-soil-ok">' + esc(r.soilPreferred) + '</span>';
          var badCell = r.soilUnsuitable === "—" ? "—" : '<span class="tag tag-soil-bad">' + esc(r.soilUnsuitable) + '</span>';
          var floodCell = r.waterloggedAbove ? esc(r.waterloggedAbove) : "—";
          html += "<tr><td>" + r.tier + "</td><td>" + esc(r.seedName) + "<br><code>" + esc(r.seedId) + "</code></td><td><code>" +
            esc(r.cropId) + "</code></td><td>" + r.price + "</td><td>" + (r.growthTicks || "—") + " tick</td><td>" +
            wpTag(r.waterProfile, r.waterProfileLabel) + "</td><td>" + esc(r.water) + "</td><td>" + esc(r.perfectWater) +
            "</td><td>" + floodCell + "</td><td>" + prefCell + "</td><td>" + badCell + "</td><td>" + esc(r.scoreDims) +
            "</td><td>" + traceCell + "</td><td>" + esc(r.fertScore) + "</td><td>" + structCell +
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
console.log('Wrote', OUT, '(' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB, crops:', rows.length + ', soils:', soilRows.length + ')');
