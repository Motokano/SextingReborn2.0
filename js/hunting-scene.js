/* Symbolic overhead view derived from the saved event; never changes hunting state. */
(function (global) {
    'use strict';
    function render(parent, a, event, config) {
        var t = function (k, v) { return global.UIText.t('hunting.scene.' + k, v); };
        var section = document.createElement('section'); section.className = 'hunting-scene'; parent.appendChild(section);
        function html(tag, text, cls) {
            var el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; section.appendChild(el); return el;
        }
        var caught = !!a.reward, escaped = a.phase==='survey' || a.last === 'hunting.result.escaped' || a.last === 'hunting.result.herd_escaped';
        html('h3', t(a.phase === 'processing' ? 'processing' : caught ? 'caught' : escaped ? 'escaped' : a.phase === 'ended' ? 'ended' : a.phase), 'hunting-scene-stage');
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 540 350'); svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', t('description')); section.appendChild(svg);
        function draw(tag, attrs, root, text) {
            var el = document.createElementNS(svg.namespaceURI, tag);
            Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
            if (text != null) el.textContent = text; (root || svg).appendChild(el); return el;
        }
        draw('title', {}, svg, t('description'));
        var defs=draw('defs',{});
        var ground=draw('radialGradient',{id:'hunt-ground',cx:'.5',cy:'.5',r:'.7'},defs);
        draw('stop',{offset:'0%', 'stop-color':'#555b37'},ground);draw('stop',{offset:'100%','stop-color':'#172c24'},ground);
        draw('rect', {x:1,y:1,width:538,height:348,rx:16,fill:'url(#hunt-ground)',stroke:'#566047'});
        if(a.variant==='watering')draw('ellipse',{cx:382,cy:162,rx:101,ry:48,fill:'#487875',opacity:'.45',stroke:'#91b5a1','stroke-width':3});
        if(a.variant==='passage')draw('path',{d:'M235 52L256 98L237 119M316 38L304 82L332 106',fill:'none',stroke:'#7b7c68','stroke-width':18,'stroke-linejoin':'round'});
        draw('path',{d:'M53 291C100 240 155 210 233 219S350 193 393 140 433 94 462 85',fill:'none',stroke:'#787052','stroke-opacity':'.22','stroke-width':73,'stroke-linecap':'round'});
        draw('path',{d:'M56 291C129 215 175 239 255 214S365 189 454 90',fill:'none',stroke:'#c0a576','stroke-opacity':'.13','stroke-width':24,'stroke-linecap':'round'});
        // Fixed details avoid flicker or consuming gameplay randomness on redraw.
        for(var i=0;i<90;i++) {
            var gx=18+(i*97)%503, gy=20+(i*61)%310;
            draw('path',{d:'M'+gx+' '+gy+'l-3 -5m3 5 2-7m-2 7 5-3',fill:'none',stroke:i%3?'#8c9563':'#b2a373','stroke-width':1,opacity:'.25'});
        }
        [[183,67,17],[197,77,11],[385,284,19],[407,277,12],[78,217,10]].forEach(function(p){
            draw('ellipse',{cx:p[0]+3,cy:p[1]+5,rx:p[2]+2,ry:p[2]*.55,fill:'#0c1815',opacity:'.4'});
            draw('path',{d:'M'+(p[0]-p[2])+' '+p[1]+'l8 '+(-p[2]*.7)+' 16 3 5 11-18 3z',fill:'#727464',stroke:'#8c8c73','stroke-width':1});
        });
        [[45,65,33],[98,52,25],[489,260,30],[453,290,24],[52,169,18],[345,53,20]].forEach(function (p) {
            draw('ellipse',{cx:p[0]+7,cy:p[1]+13,rx:p[2]+8,ry:p[2]*.7,fill:'#0d2019',opacity:'.6'});
            for(var j=0;j<7;j++) {
                var angle=j*2.4, bx=p[0]+Math.cos(angle)*p[2]*.55, by=p[1]+Math.sin(angle)*p[2]*.35;
                draw('ellipse',{cx:bx,cy:by,rx:p[2]*.62,ry:p[2]*.45,fill:['#354f36','#48613e','#577047'][j%3],stroke:'#71804d','stroke-opacity':'.35'});
                draw('path',{d:'M'+(bx-8)+' '+by+'q6 -5 12 -2',fill:'none',stroke:'#98a564',opacity:'.4'});
            }
        });
        var retreat = event.rabbit ? t('burrow') : event.herd || event.strength ? t('passage') : event.startles ? t('nest') : t('cover');
        var shelter=a.shelter || [458,84];
        var block=[276+(shelter[0]-276)*.73,159+(shelter[1]-159)*.73];
        var trap=a.flags.observe?[276+(shelter[0]-276)*.35,159+(shelter[1]-159)*.35]:[280,210];
        if (a.flags.observe || a.flags.coverLocated) {
        var shelterRoot=svg;
        svg=draw('g',{transform:'translate('+(shelter[0]-458)+' '+(shelter[1]-84)+')'});
        if(event.rabbit) draw('path',{d:'M419 94Q419 49 455 55T492 94Z',fill:'#847455',stroke:'#a38c62','stroke-width':2});
        else {
            draw('path',{d:'M414 97l6-31 15 7 10-23 13 16 19-8 17 32-22 13z',fill:'#314b31',stroke:'#70834d','stroke-width':2});
            draw('path',{d:'M420 80l14-3 9-15m13 12 21-8m-9 17 20 5',fill:'none',stroke:'#91a061','stroke-width':2});
        }
        draw('ellipse',{cx:456,cy:86,rx:25,ry:14,fill:'#15231a'});
        draw('path',{d:'M421 96q33 10 69-1',fill:'none',stroke:event.rabbit?'#b19969':'#6d804b','stroke-width':3});
        draw('text',{x:458,y:53,'text-anchor':'middle',class:'hunt-map-label'},null,retreat);
        svg=shelterRoot;
        }
        if (a.flags.observe) {
            draw('path',{d:'M276 159L'+shelter.join(' '),fill:'none',stroke:a.flags.block?'#aa7760':'#d4b678','stroke-width':3,'stroke-dasharray':'7 7'});
        }
        if (a.flags.block) {
            var blockRoot=svg;svg=draw('g',{transform:'translate('+(block[0]-405)+' '+(block[1]-127)+')'});
            draw('path',{d:'M386 117l37 22m-33 1 30-27',stroke:'#c49670','stroke-width':9,'stroke-linecap':'round'});
            draw('path',{d:'M386 115l37 22m-33 1 30-27',stroke:'#74583b','stroke-width':3,'stroke-linecap':'round'});
            svg=blockRoot;
        }
        if (a.flags.bait) {
            draw('circle',{cx:267,cy:222,r:20,fill:'#baa363','fill-opacity':'.12',stroke:'#baa363','stroke-dasharray':'3 4'});
            draw('path',{d:'M258 217l17 4-10 12z',fill:'#d79c55',stroke:'#efd091','stroke-width':1});
            draw('path',{d:'M272 219l-1-9m1 9 7-7',stroke:'#93ab59','stroke-width':3});
            draw('text',{x:267,y:263,'text-anchor':'middle',class:'hunt-map-label'},null,t('bait'));
        }
        if (a.trapChance != null || a.flags.set_intercept || a.flags.set_tether) {
            var trapRoot=svg;svg=draw('g',{transform:'translate('+(trap[0]-327)+' '+(trap[1]-161)+')'});
            draw('ellipse',{cx:327,cy:161,rx:27,ry:15,fill:'none',stroke:'#d7c99e','stroke-width':3});
            draw('path',{d:'M352 159l16-28',stroke:'#d7c99e','stroke-width':2});
            draw('text',{x:335,y:117,'text-anchor':'middle',class:'hunt-map-label'},null,t('snare'));
            svg=trapRoot;
        }
        var player = a.flags.hide ? shelter : a.phase==='retry' ? [201,244] : [111,268];
        var prey = caught ? [Math.min(480,player[0]+74),player[1]-20] : a.phase==='charge' ? [177,223] : escaped && a.flags.observe ? shelter : a.phase==='retry' ? [276+(shelter[0]-276)*.5,159+(shelter[1]-159)*.5] : a.flags.bait ? [282,187] : [276,159];
        if(a.phase==='herd_alert' || a.phase==='straining')prey=trap;
        if((event.herd || event.strength) && a.phase!=='ended' && !caught) {
            var flock=a.phase==='herd_alert'?[trap[0]+35,trap[1]+20]:[353,127];
            [[0,0],[33,15],[-4,32]].forEach(function(offset){
                var x=flock[0]+offset[0],y=flock[1]+offset[1];
                draw('ellipse',{cx:x+2,cy:y+10,rx:16,ry:6,fill:'#091710',opacity:'.4'});
                draw('ellipse',{cx:x,cy:y,rx:14,ry:10,fill:'#c5bd9c',stroke:'#6d6852'});
                draw('ellipse',{cx:x-13,cy:y+2,rx:5,ry:7,fill:'#776d56'});
            });
            draw('text',{x:flock[0]+16,y:flock[1]+59,'text-anchor':'middle',class:'hunt-map-label'},null,t(event.strength?'cattle_herd':'herd'));
        }
        if(a.phase==='airborne') {
            prey=[330,100];
            draw('ellipse',{cx:330,cy:190,rx:24,ry:8,fill:'#091710',opacity:'.35'});
            draw('path',{d:'M276 159Q284 113 315 105',fill:'none',stroke:'#e0bc76','stroke-width':2,'stroke-dasharray':'5 5'});
        } else if(a.flags.landed && !caught && a.phase!=='ended')prey=shelter;
        if(a.phase==='charge')draw('path',{d:'M235 185L139 251l6-19m-6 19 22-1',fill:'none',stroke:'#dc886b','stroke-width':4,'stroke-dasharray':'8 5'});
        function token(pos, color, icon, label, faded) {
            var g=draw('g',{transform:'translate('+pos.join(' ')+')',opacity:faded?'.45':'1'});
            var moving = icon === 'animal' && a.phase !== 'ended';
            var motion = a.phase === 'charge' || a.phase === 'retry' ? 'alert' : a.phase === 'waiting' ? 'watch' : a.flags.bait ? 'feed' : 'roam';
            var period = motion === 'alert' ? 4 : motion === 'feed' ? 9 : 12;
            // A shared clock preserves motion across UI redraws without advancing world time.
            var delay = -((Date.now()/1000)%period);
            if (moving) {
                g=draw('g',{class:'hunt-prey-motion hunt-prey-'+motion},g);
                g.style.animationDelay=delay+'s';
            }
            draw('ellipse',{cx:3,cy:12,rx:22,ry:9,fill:'#091710',opacity:'.55'},g);
            draw('ellipse',{cy:12,rx:25,ry:13,fill:'none',stroke:color,'stroke-width':1,opacity:'.7'},g);
            if (icon === 'animal') {
                var facing=draw('g',{class:moving?'hunt-prey-facing':''},g);
                if(moving) { facing.style.animationDuration=period+'s'; facing.style.animationDelay=delay+'s'; }
                var body=draw('g',{fill:kind==='rabbit'?'#e4d7b5':kind==='pig'?'#b3956b':'#d1bd92',stroke:'#514838','stroke-width':'.6',transform:'scale(1.5)'},facing);
                draw('ellipse',{cx:-3,cy:3,rx:9,ry:6},body);
                draw('circle',{cx:7,cy:-3,r:5},body);
                if (kind==='rabbit') {
                    draw('ellipse',{cx:5,cy:-10,rx:2,ry:7,transform:'rotate(-12 5 -10)'},body);
                    draw('ellipse',{cx:10,cy:-10,rx:2,ry:7,transform:'rotate(15 10 -10)'},body);
                    draw('circle',{cx:-12,cy:1,r:3},body);
                } else if (kind==='chicken') {
                    draw('path',{d:'M10-5l6 3-6 2M-10 1l-5-8 9 6M-3 7v5m5-5v5'},body);
                    if(a.phase==='airborne')draw('path',{d:'M-4 1Q-25-20-24-4L-10 7M0 0Q15-22 19-13L6 7',fill:'#ddcaa0',stroke:'#514838','stroke-width':1},body);
                } else {
                    draw('path',{d:'M-8 5v7h3V5M2 5v7h3V5'},body);
                    if(kind==='cattle'||kind==='sheep')draw('path',{d:'M3-5L0-12 6-8 12-12 12-4',fill:'none',stroke:color,'stroke-width':2},body);
                    if(kind==='pig') {
                        draw('ellipse',{cx:12,cy:-1,rx:4,ry:3},body);
                        draw('path',{d:'M-10-1l2-6 3 3 3-5 3 6M11 2l3-3',fill:'none',stroke:'#695037','stroke-width':1.5},body);
                    }
                }
                draw('circle',{cx:9,cy:-4,r:1,fill:'#20291f',stroke:'none'},body);
            } else draw('text',{y:6,'text-anchor':'middle','font-size':20,fill:color},g,icon);
            draw('text',{y:43,'text-anchor':'middle',class:'hunt-map-label'},g,label);
        }
        token(player,'#97d1cf','◆',t('player'));
        var kind = event.species || 'rabbit';
        if (!escaped || a.flags.observe) token(prey,'#e0bc76',caught?'✓':'animal',t(kind)+(a.target==='juvenile' && a.phase!=='charge'?' · '+t('juvenile'):''),escaped);
    }
    global.HuntingScene = {render:render};
})(window);
