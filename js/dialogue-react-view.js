(function (global) {
    'use strict';

    var avatarRoot = null;
    var avatarMountNode = null;
    var actionsRoot = null;
    var actionsMountNode = null;
    var optionsRoot = null;
    var optionsMountNode = null;

    function createTextNodes(text) {
        var lines = String(text || '').split('\n');
        var nodes = [];
        for (var i = 0; i < lines.length; i++) {
            if (i > 0) nodes.push(global.React.createElement('br', { key: 'br-' + i }));
            nodes.push(lines[i]);
        }
        return nodes;
    }

    function DialogueTypingText(props) {
        var text = props && props.text ? String(props.text) : '';
        var isTyping = !!(props && props.isTyping);
        var children = createTextNodes(text);
        if (isTyping) {
            children.push(global.React.createElement('span', { className: 'dlg-typing-cursor', 'aria-hidden': 'true', key: 'cursor' }, '▋'));
        }
        return global.React.createElement('span', { className: 'dlg-typing-wrap' }, children);
    }

    function deriveAvatarAltUrl(url) {
        // 兼容 npc-editor 在“选择目录层级错误”导致的多/少一层路径：
        // 1) 期望：image/<folder>/<file>
        //    实际：image/<folder>/<folder>/<file>
        // 2) 期望：image/<folder>/<folder>/<file>
        //    实际：image/<folder>/<file>
        if (!url) return '';
        var s = String(url).trim();
        var flat = /^image\/([^\/]+)\/([^\/]+)$/.exec(s);
        if (flat) {
            return 'image/' + flat[1] + '/' + flat[1] + '/' + flat[2];
        }
        var nested = /^image\/([^\/]+)\/\1\/([^\/]+)$/.exec(s);
        if (nested) {
            return 'image/' + nested[1] + '/' + nested[2];
        }
        return '';
    }

    function ensureOptionsRoot(el) {
        if (!el || !global.ReactDOM || typeof global.ReactDOM.createRoot !== 'function') return;
        if (optionsMountNode !== el) {
            if (optionsRoot && typeof optionsRoot.unmount === 'function') optionsRoot.unmount();
            optionsRoot = global.ReactDOM.createRoot(el);
            optionsMountNode = el;
        }
    }

    function ensureAvatarRoot(el) {
        if (!el || !global.ReactDOM || typeof global.ReactDOM.createRoot !== 'function') return;
        if (avatarMountNode !== el) {
            if (avatarRoot && typeof avatarRoot.unmount === 'function') avatarRoot.unmount();
            avatarRoot = global.ReactDOM.createRoot(el);
            avatarMountNode = el;
        }
    }

    function ensureActionsRoot(el) {
        if (!el || !global.ReactDOM || typeof global.ReactDOM.createRoot !== 'function') return;
        if (actionsMountNode !== el) {
            if (actionsRoot && typeof actionsRoot.unmount === 'function') actionsRoot.unmount();
            actionsRoot = global.ReactDOM.createRoot(el);
            actionsMountNode = el;
        }
    }

    function DialogueOptions(props) {
        var options = (props && Array.isArray(props.options)) ? props.options : [];
        var onChoose = props && typeof props.onChoose === 'function' ? props.onChoose : null;
        if (!options.length) return null;
        return global.React.createElement(
            global.React.Fragment,
            null,
            options.map(function (opt, idx) {
                var txt = (opt && opt.text != null) ? String(opt.text) : '...';
                return global.React.createElement(
                    'button',
                    {
                        key: String(idx),
                        type: 'button',
                        className: 'dlg-option-btn',
                        onClick: function () {
                            if (onChoose) onChoose(idx);
                        }
                    },
                    txt
                );
            })
        );
    }

    function DialogueAvatar(props) {
        var url = props && props.avatarUrl ? String(props.avatarUrl) : '';
        var fallback = props && props.fallbackGlyph ? String(props.fallbackGlyph) : '❖';
        var hasImageRef = global.React.useRef(!!url);
        var _state = global.React.useState(!!url);
        var hasImage = _state[0];
        var setHasImage = _state[1];

        var _state2 = global.React.useState(url || '');
        var imgSrc = _state2[0];
        var setImgSrc = _state2[1];
        var triedFallbackRef = global.React.useRef(false);
        var fallbackUrl = deriveAvatarAltUrl(url);

        global.React.useEffect(function () {
            hasImageRef.current = !!url;
            setHasImage(!!url);
            triedFallbackRef.current = false;
            setImgSrc(url || '');
        }, [url]);

        return global.React.createElement(
            global.React.Fragment,
            null,
            global.React.createElement('img', {
                id: 'dialogue-avatar-img',
                src: imgSrc || '',
                alt: '',
                onLoad: function () {
                    if (!hasImageRef.current) return;
                    setHasImage(true);
                },
                onError: function () {
                    if (!triedFallbackRef.current && fallbackUrl && fallbackUrl !== imgSrc) {
                        triedFallbackRef.current = true;
                        setImgSrc(fallbackUrl);
                        return;
                    }
                    setHasImage(false);
                },
                // 覆盖 index.html 里“非 React 默认隐藏”的 CSS
                style: hasImage ? { display: 'block' } : { display: 'none' }
            }),
            global.React.createElement(
                'span',
                {
                    className: 'fallback',
                    id: 'dialogue-avatar-fallback',
                    // 有图失败时要能显示 fallback glyph（哪怕 CSS 也试图隐藏）
                    style: hasImage ? { display: 'none' } : { display: 'block' }
                },
                fallback
            )
        );
    }

    function DialogueActions(props) {
        var nextLabel = props && props.nextLabel ? String(props.nextLabel) : '...';
        var nextDisabled = !!(props && props.nextDisabled);
        var onNext = props && typeof props.onNext === 'function' ? props.onNext : null;
        var onClose = props && typeof props.onClose === 'function' ? props.onClose : null;
        var closeLabel = props && props.closeLabel ? String(props.closeLabel) : 'close';
        var showClose = !!(props && props.showCloseButton);
        var children = [
            global.React.createElement(
                'button',
                {
                    type: 'button',
                    className: 'dlg-btn primary',
                    id: 'dialogue-btn-next',
                    disabled: nextDisabled,
                    onClick: function () { if (onNext) onNext(); }
                },
                nextLabel
            )
        ];
        if (showClose) {
            children.push(global.React.createElement(
                'button',
                {
                    type: 'button',
                    className: 'dlg-btn',
                    id: 'dialogue-btn-close',
                    onClick: function () { if (onClose) onClose(); }
                },
                closeLabel
            ));
        }
        return global.React.createElement.apply(global.React, [global.React.Fragment, null].concat(children));
    }

    function mount(payload) {
        var p = payload || {};
        ensureAvatarRoot(p.avatarEl || null);
        ensureActionsRoot(p.actionsEl || null);
        ensureOptionsRoot(p.optionsEl || null);
    }

    function render(state) {
        var nextState = state || {};
        if (avatarRoot) {
            avatarRoot.render(global.React.createElement(DialogueAvatar, {
                avatarUrl: nextState.avatarUrl || '',
                fallbackGlyph: nextState.fallbackGlyph || '❖'
            }));
        }
        if (actionsRoot) {
            actionsRoot.render(global.React.createElement(DialogueActions, {
                nextLabel: nextState.nextLabel || '',
                nextDisabled: !!nextState.nextDisabled,
                closeLabel: nextState.closeLabel || 'close',
                showCloseButton: !!nextState.showCloseButton,
                onNext: nextState.onNext || null,
                onClose: nextState.onClose || null
            }));
        }
        if (optionsRoot) {
            optionsRoot.render(global.React.createElement(DialogueOptions, {
                options: nextState.options || [],
                onChoose: nextState.onChoose || null
            }));
        }
    }

    function unmount() {
        if (avatarRoot && typeof avatarRoot.unmount === 'function') avatarRoot.unmount();
        if (actionsRoot && typeof actionsRoot.unmount === 'function') actionsRoot.unmount();
        if (optionsRoot && typeof optionsRoot.unmount === 'function') optionsRoot.unmount();
        avatarRoot = null;
        avatarMountNode = null;
        actionsRoot = null;
        actionsMountNode = null;
        optionsRoot = null;
        optionsMountNode = null;
    }

    global.DialogueReactView = {
        mount: mount,
        render: render,
        unmount: unmount
    };
})(typeof window !== 'undefined' ? window : this);

