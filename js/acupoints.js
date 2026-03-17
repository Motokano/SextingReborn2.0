(function (global) {
    /**
     * 穴位数据与状态管理。
     *
     * 优先从 docs/穴位.csv 动态加载全部经脉与穴位，
     * 若加载失败，则退回到内置的少量示例数据。
     */

    // 实际对外使用的经脉与穴位表
    var categories = [];
    var acupointsByCategory = {};

    // 内置示例数据（CSV 加载失败时作为退路）
    var fallbackCategories = [
        { id: 'du', label: '督脉', icon: '⛰️' },
        { id: 'ren', label: '任脉', icon: '🌊' },
        { id: 'lu', label: '手太阴·肺', icon: '🫁' },
        { id: 'st', label: '足阳明·胃', icon: '🔥' }
    ];

    var fallbackAcupointsByCategory = {
        du: [
            { id: 'du_changqiang', name: '长强', effectsText: '底气上限+10，后天筋骨+2' },
            { id: 'du_mingmen', name: '命门', effectsText: '底气上限+10，后天筋骨+2' },
            { id: 'du_baihui', name: '百会', effectsText: '底气上限+10，后天呼吸+2' }
        ],
        ren: [
            { id: 'ren_huiyin', name: '会阴', effectsText: '底气上限+10，后天筋骨+2' },
            { id: 'ren_qihai', name: '气海', effectsText: '底气上限+10，后天筋骨+2' },
            { id: 'ren_shenzhong', name: '膻中', effectsText: '底气上限+10，后天呼吸+2' }
        ],
        lu: [
            { id: 'lu_zhongfu', name: '中府', effectsText: '底气上限+10，后天筋骨+2' },
            { id: 'lu_chize', name: '尺泽', effectsText: '底气上限+10，后天筋骨+2' }
        ],
        st: [
            { id: 'st_chengqi', name: '承泣', effectsText: '底气上限+10，后天柔韧+2' },
            { id: 'st_zusanli', name: '足三里', effectsText: '底气上限+10，后天柔韧+2' }
        ]
    };

    /** 已点亮穴位 id 集合（前端演示用，真正存档由游戏系统管理） */
    var unlocked = {};

    /**
     * 将当前 acupointsByCategory 中所有已点亮穴位的效果，汇总为角色属性加成。
     *
     * 解析类似“底气上限+10，后天筋骨+2”的效果文本，转为数值加成。
     * 返回 { maxQi: number, acquired: { jingu, flexibility, breath, dexterity, focus } }
     */
    function parseEffects(effectsText) {
        var out = {
            maxQi: 0,
            acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 }
        };
        if (!effectsText || typeof effectsText !== 'string') return out;
        var parts = effectsText.split(/[，,]/);
        for (var i = 0; i < parts.length; i++) {
            var t = parts[i].trim();
            if (!t) continue;
            var m = t.match(/([+-]?\d+)/);
            var val = m ? parseInt(m[1], 10) : 0;
            if (!val) continue;
            if (t.indexOf('底气上限') >= 0) {
                out.maxQi += val;
            } else if (t.indexOf('后天筋骨') >= 0) {
                out.acquired.jingu += val;
            } else if (t.indexOf('后天柔韧') >= 0) {
                out.acquired.flexibility += val;
            } else if (t.indexOf('后天呼吸') >= 0) {
                out.acquired.breath += val;
            } else if (t.indexOf('后天身手') >= 0) {
                out.acquired.dexterity += val;
            } else if (t.indexOf('后天专注') >= 0) {
                out.acquired.focus += val;
            }
        }
        return out;
    }

    /**
     * 统计当前全部已点亮穴位带来的：
     * - 底气上限总加成 maxQi
     * - 五维后天加成 acquired.*
     * - 任督/全通成就带来的“先天五维+1”加成 innate.*
     */
    function computeStatBonus() {
        var bonus = {
            maxQi: 0,
            acquired: { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 },
            innate:  { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 }
        };

        // 逐穴位累加效果
        Object.keys(acupointsByCategory).forEach(function (catId) {
            var list = acupointsByCategory[catId] || [];
            list.forEach(function (a) {
                if (!unlocked[a.id]) return;
                var eff = parseEffects(a.effectsText || '');
                bonus.maxQi += eff.maxQi;
                bonus.acquired.jingu       += eff.acquired.jingu;
                bonus.acquired.flexibility += eff.acquired.flexibility;
                bonus.acquired.breath      += eff.acquired.breath;
                bonus.acquired.dexterity   += eff.acquired.dexterity;
                bonus.acquired.focus       += eff.acquired.focus;
            });
        });

        // 成就：任脉 / 督脉 / 任督俱通 / 全部穴位
        function isCategoryComplete(catId) {
            var list = acupointsByCategory[catId] || [];
            if (!list.length) return false;
            for (var i = 0; i < list.length; i++) {
                if (!unlocked[list[i].id]) return false;
            }
            return true;
        }

        // 通过“经脉名称”而非 id 识别任脉/督脉，兼容 CSV 动态加载
        var renDone = false;
        var duDone  = false;
        categories.forEach(function (c) {
            if (!c || !c.id || !c.label) return;
            if (c.label.indexOf('任脉') >= 0 && isCategoryComplete(c.id)) renDone = true;
            if (c.label.indexOf('督脉') >= 0 && isCategoryComplete(c.id)) duDone  = true;
        });

        var innateBonusSteps = 0;
        if (renDone) innateBonusSteps += 1;
        if (duDone) innateBonusSteps  += 1;
        if (renDone && duDone) innateBonusSteps += 1;

        // 全部穴位是否点满（当前 acupointsByCategory 中的全部）
        var allIds = [];
        Object.keys(acupointsByCategory).forEach(function (catId) {
            var list = acupointsByCategory[catId] || [];
            for (var i = 0; i < list.length; i++) allIds.push(list[i].id);
        });
        var allDone = allIds.length > 0 && allIds.every(function (id) { return !!unlocked[id]; });
        if (allDone) innateBonusSteps += 1;

        if (innateBonusSteps > 0) {
            bonus.innate.jingu       += innateBonusSteps;
            bonus.innate.flexibility += innateBonusSteps;
            bonus.innate.breath      += innateBonusSteps;
            bonus.innate.dexterity   += innateBonusSteps;
            bonus.innate.focus       += innateBonusSteps;
        }

        return bonus;
    }

    /**
     * 退回到内置示例数据：用于文件加载失败或不支持 fetch 的情况。
     */
    function useFallbackData() {
        categories = fallbackCategories.slice();
        acupointsByCategory = {};
        for (var k in fallbackAcupointsByCategory) {
            if (fallbackAcupointsByCategory.hasOwnProperty(k)) {
                acupointsByCategory[k] = fallbackAcupointsByCategory[k].slice();
            }
        }
    }

    /**
     * 将字符串转为适合作为 id 的 slug：移除空白与非字母数字下划线。
     */
    function makeIdSlug(str, fallback) {
        if (!str) return fallback || '';
        var s = String(str).trim().replace(/\s+/g, '');
        s = s.replace(/[^\w\-]/g, '');
        return s || (fallback || '');
    }

    /**
     * 根据经脉分类名称给一个默认图标（可按需扩展）。
     */
    function iconForCategory(label) {
        if (!label) return '';
        if (label.indexOf('督脉') >= 0) return '⛰️';
        if (label.indexOf('任脉') >= 0) return '🌊';
        if (label.indexOf('肺')   >= 0) return '🫁';
        if (label.indexOf('胃')   >= 0) return '🔥';
        if (label.indexOf('肾')   >= 0) return '💧';
        if (label.indexOf('胆')   >= 0) return '🟢';
        if (label.indexOf('肝')   >= 0) return '🌳';
        return '';
    }

    /**
     * 尝试从 docs/穴位.csv 载入全部穴位数据。
     * CSV 字段：经脉分类,经脉,穴位,效果
     */
    function initFromCsv() {
        if (!global.fetch) {
            useFallbackData();
            return;
        }
        fetch('docs/穴位.csv', { cache: 'no-cache' })
            .then(function (resp) {
                if (!resp.ok) throw new Error('failed to load');
                return resp.text();
            })
            .then(function (text) {
                categories = [];
                acupointsByCategory = {};

                var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
                if (!lines.length) {
                    useFallbackData();
                    return;
                }

                // 允许首行是表头：检测是否包含“经脉分类”
                var startIdx = 0;
                if (lines[0].indexOf('经脉分类') >= 0) startIdx = 1;

                var catMap = {}; // key = catLabel（按中文名称分组）

                for (var i = startIdx; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line) continue;
                    // 允许逗号或制表符分隔
                    var cols = line.split(/[,|\t]/);
                    if (cols.length < 3) continue;
                    var catLabel = cols[0].trim();
                    var meridianName = cols[1].trim();
                    var acName = cols[2].trim();
                    var effText = cols[3] ? cols[3].trim() : '';
                    if (!catLabel || !acName) continue;

                    // 以“经脉分类”原文作为分组键，避免中文被清洗后产生多个分类
                    var catKey = catLabel;
                    if (!catMap[catKey]) {
                        var icon = iconForCategory(catLabel);
                        var catIdNew = catKey; // 直接用中文作为 id
                        var catObj = { id: catIdNew, label: catLabel, icon: icon };
                        catMap[catKey] = catObj;
                        categories.push(catObj);
                        acupointsByCategory[catIdNew] = [];
                    }
                    var catId = catMap[catKey].id;

                    // 为避免不同经脉中出现“经脉+穴位”同名导致 id 冲突，
                    // 这里将“经脉分类+经脉+穴位+行号”一并纳入 id 生成。
                    var acId = makeIdSlug(catLabel + '_' + meridianName + '_' + acName + '_' + i, 'ac_' + i);
                    acupointsByCategory[catId].push({
                        id: acId,
                        name: acName,
                        effectsText: effText
                    });
                }

                // 如果解析后依然没有数据，则退回默认示例
                if (!categories.length) {
                    useFallbackData();
                }
            })
            .catch(function () {
                useFallbackData();
            });
    }

    // 初始化：优先尝试从 CSV 加载
    initFromCsv();

    var Acupoints = {
        /**
         * 返回经脉分类列表。
         * [{id,label,icon}]
         */
        getCategories: function () {
            return categories.slice();
        },
        /**
         * 按经脉 id 获取该经下所有穴位。
         * 返回 [{id,name,effectsText}]
         */
        getAcupointsByCategory: function (catId) {
            return (acupointsByCategory[catId] || []).slice();
        },
        /** 是否已点亮某穴位 */
        isUnlocked: function (acupointId) {
            return !!unlocked[acupointId];
        },
        /**
         * 点亮指定穴位。
         * 实际属性加成的结算由角色/属性系统实现，这里只负责记录状态。
         */
        unlock: function (acupointId) {
            if (!acupointId) return false;
            if (unlocked[acupointId]) return false;
            unlocked[acupointId] = true;
            return true;
        },
        /** 取得当前已点亮列表（调试用） */
        getUnlockedIds: function () {
            return Object.keys(unlocked);
        },
        /**
         * 供角色属性模块调用的总加成：
         * { maxQi: number, acquired: {jingu,...}, innate: {jingu,...} }
         */
        getStatBonus: function () {
            return computeStatBonus();
        }
    };

    global.Acupoints = Acupoints;
})(window);

