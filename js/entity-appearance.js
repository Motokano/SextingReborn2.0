/**
 * 实体形象接口：统一管理玩家、NPC 等可更换形象图片
 * 用法：setEntityAppearance(entityId, imageUrl) / getEntityAppearance(entityId)
 * 场景层可监听变更并更新对应 DOM（如玩家用 setPlayerAvatar，NPC 用各自的 sprite）
 */
(function (global) {
    'use strict';

    var registry = {};
    var changeCallback = null;

    /**
     * 设置某实体的形象图片（会触发 onAppearanceChange 回调）
     * @param {string} entityId - 实体 ID，如 'player'、'npc_merchant'、'npc_xxx'
     * @param {string} imageUrl - 图片 URL（相对或绝对），空字符串表示清除，恢复默认
     */
    function setEntityAppearance(entityId, imageUrl) {
        if (entityId == null || entityId === '') return;
        var url = (imageUrl != null && imageUrl !== '') ? String(imageUrl) : '';
        registry[entityId] = url;
        if (typeof changeCallback === 'function') {
            changeCallback(entityId, url);
        }
    }

    /**
     * 仅更新 registry，不触发回调（用于场景层先更新 DOM 再同步记录时避免循环）
     * @param {string} entityId
     * @param {string} imageUrl
     */
    function setEntityAppearanceSilent(entityId, imageUrl) {
        if (entityId == null || entityId === '') return;
        registry[entityId] = (imageUrl != null && imageUrl !== '') ? String(imageUrl) : '';
    }

    /**
     * 获取某实体当前设定的形象图片 URL，未设置则返回 null
     * @param {string} entityId
     * @returns {string|null}
     */
    function getEntityAppearance(entityId) {
        if (entityId == null || entityId === '') return null;
        var url = registry[entityId];
        return (url != null && url !== '') ? url : null;
    }

    /**
     * 清除某实体的形象设定
     * @param {string} entityId
     */
    function clearEntityAppearance(entityId) {
        if (entityId == null) return;
        delete registry[entityId];
        if (typeof changeCallback === 'function') {
            changeCallback(entityId, '');
        }
    }

    /**
     * 获取当前所有已设置的实体形象（用于存档等）
     * @returns {Object} entityId -> imageUrl
     */
    function getAllAppearances() {
        var out = {};
        for (var k in registry) {
            if (registry.hasOwnProperty(k) && registry[k]) out[k] = registry[k];
        }
        return out;
    }

    /**
     * 批量恢复实体形象（如读档后）
     * @param {Object} map - entityId -> imageUrl
     */
    function setAllAppearances(map) {
        if (!map || typeof map !== 'object') return;
        for (var k in map) {
            if (map.hasOwnProperty(k)) setEntityAppearance(k, map[k]);
        }
    }

    /**
     * 注册形象变更回调：当 setEntityAppearance 被调用时触发，便于场景层同步 DOM
     * @param {function(string, string)} fn - (entityId, imageUrl)
     */
    function onAppearanceChange(fn) {
        changeCallback = typeof fn === 'function' ? fn : null;
    }

    global.EntityAppearance = {
        setEntityAppearance: setEntityAppearance,
        setEntityAppearanceSilent: setEntityAppearanceSilent,
        getEntityAppearance: getEntityAppearance,
        clearEntityAppearance: clearEntityAppearance,
        getAllAppearances: getAllAppearances,
        setAllAppearances: setAllAppearances,
        onAppearanceChange: onAppearanceChange
    };
})(typeof window !== 'undefined' ? window : this);
