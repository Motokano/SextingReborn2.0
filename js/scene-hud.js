/**
 * SceneHud — 面板刷新通道（scene-app 组合根化拆解 P0 产物）
 *
 * 目的：把「状态变了 → 直调 updateStatusPanel / renderCombatModal / 各站点 panel」
 * 的刷新调用，收敛为 SceneHud.refresh(kind) 的事件式分发。迁出主 JS 的子模块
 * 只需调用本通道，不必反向依赖 scene-app 闭包。
 *
 * 规则：
 * - 谁拥有某类面板的 DOM，谁 register(kind, fn)；fn 由注册方闭包持有。
 * - register 保留单一旧视图所有者；subscribe 只观察刷新完成，返回取消订阅函数。
 * - refresh 对没有所有者/订阅者的 kind 静默 no-op。
 * - refresh 透传参数（如 SceneRenderer 传 gatherState），保持与直调完全一致。
 * - 不做 try/catch：与旧直调抛错语义一致，错误仍按原路径冒泡。
 *
 * 加载序：本文件须在 scene-app.js 之前加载（index.html 已保证）。
 */
(function (global) {
    'use strict';

    var registry = {}; // kind -> fn
    var subscribers = {}; // Presentation observers; never replace the legacy owner.

    var SceneHud = {
        /** 注册/覆盖某 kind 的刷新回调（幂等）。 */
        register: function (kind, fn) {
            if (!kind || typeof fn !== 'function') return;
            registry[kind] = fn;
        },
        /** 订阅完成通知，不替换现有渲染回调。 */
        subscribe: function (kind, listener) {
            if (typeof listener !== 'function') throw new TypeError('SceneHud listener must be a function');
            var list = subscribers[kind] || (subscribers[kind] = new Set());
            list.add(listener);
            return function () { list.delete(listener); };
        },
        /** 注销旧视图所有者；订阅者独立取消。 */
        unregister: function (kind) {
            if (kind) delete registry[kind];
        },
        /**
         * 触发某 kind 的刷新。参数原样透传给注册的回调；
         * 旧视图更新后通知订阅者；没有任何消费者时静默 no-op。
         */
        refresh: function (kind /*, ...args */) {
            var fn = registry[kind];
            var args = Array.prototype.slice.call(arguments, 1);
            if (typeof fn === 'function') fn.apply(null, args);
            if (subscribers[kind]) Array.from(subscribers[kind]).forEach(function (listener) { listener.apply(null, args); });
        },
        isRegistered: function (kind) {
            return typeof registry[kind] === 'function';
        },
        kinds: function () {
            return Object.keys(registry);
        }
    };

    global.SceneHud = SceneHud;
})(typeof window !== 'undefined' ? window : globalThis);
