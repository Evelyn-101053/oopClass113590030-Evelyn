/*
 * 輪迴水靈 Turritopsis sp. Ω — M2 物種雛形
 * index.html 負責畫面結構與樣式，這支 sketch.js 負責 3D 場景、生物、互動與控制面板。
 * 需要的函式庫（three.js r128、Tweakpane 3）由 index.html 先從 CDN 載入。
 */

/**
 * 輪迴水靈 Turritopsis Ω — Three.js r128
 * 生物本體：泡靈——住在一顆會長大的肥皂泡裡；泡膜有薄膜干涉色與軟體物理，養分消化後「吹」一口氣讓泡泡長大
 * 控制面板：Tweakpane 3 (github.com/cocopon/tweakpane)
 */
const container = document.getElementById('webgl-container');
let width = window.innerWidth;
let height = window.innerHeight;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------
// 1. 音效 Web Audio（沿用原本的程序化音效）
// ------------------------------------------------------------------
let audioCtx = null;
let soundEnabled = false;

function initAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playEldritchSFX(type) {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const presets = {
            dash:          ['sine',     95, 260, 'exp', 0.12, 0.3],
            eat:           ['sine',    340, 760, 'exp', 0.08, 0.16],
            injure:        ['sawtooth',190,  36, 'exp', 0.22, 0.6],
            rebirth_stare: ['triangle',110, 440, 'exp', 0.22, 0.9],
            death:         ['sawtooth',110,  28, 'lin', 0.26, 0.9]
        };
        const p = presets[type];
        if (!p) return;
        osc.type = p[0];
        osc.frequency.setValueAtTime(p[1], now);
        if (p[3] === 'exp') osc.frequency.exponentialRampToValueAtTime(p[2], now + p[5] * 0.75);
        else osc.frequency.linearRampToValueAtTime(p[2], now + p[5] * 0.95);
        gain.gain.setValueAtTime(p[4], now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + p[5]);
        osc.start(now);
        osc.stop(now + p[5]);
    } catch (e) {}
}

// ------------------------------------------------------------------
// 2. Scene / Camera / Renderer / Bloom
// ------------------------------------------------------------------
const WATER = 0x0b0a20;
const scene = new THREE.Scene();
// 糖果色的溫暖淺海：上方是從水面透下來的粉紅光，往下變成薰衣草紫、深紫
const bgTex = (() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 512;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0.0, '#9c72c4');
    grd.addColorStop(0.18, '#6c55b0');
    grd.addColorStop(0.42, '#3c3280');
    grd.addColorStop(0.58, '#2b2662');
    grd.addColorStop(1.0, '#17133c');
    g.fillStyle = grd;
    g.fillRect(0, 0, 16, 512);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.LinearFilter;
    return t;
})();
scene.background = bgTex;
scene.fog = new THREE.FogExp2(0x2b2662, 0.0115);

const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 600);
camera.position.set(0, 12, 54);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 140;
controls.minDistance = 14;
controls.maxPolarAngle = Math.PI * 0.6;

const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.5, 0.96);
composer.addPass(bloomPass);

// 光源 Lighting：上方微弱天光 + 生物本身的微光
scene.add(new THREE.HemisphereLight(0xffc6e0, 0x2a2060, 0.6));
const topLight = new THREE.DirectionalLight(0xffe0ef, 0.6);
topLight.position.set(15, 90, 25);
scene.add(topLight);
const creatureCoreLight = new THREE.PointLight(0xc4303f, 1.4, 38, 2);
scene.add(creatureCoreLight);

// 共用的柔光貼圖 Soft sprite texture
const softTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
})();

// ------------------------------------------------------------------
// 3. 型態主題 Morph themes
// ------------------------------------------------------------------
const MORPH_THEMES = [
    {
        name: '夢幻泡泡 Dream',
        filmBias: 0.0, filmTint: 0xffffff,
        core: 0xffb6d3, coreDeep: 0xff5f9e, coreRim: 0xffe3a8,
        heart: 0xff4f86, heartGlow: 0xffd27a, blush: 0xff7fae, lip: 0xff6f9e, lid: 0xff8fbd,
        fin: 0xffc4dc, finEdge: 0xffe9b0, tuft: 0xff8fbd, tuftTip: 0xffe9b0,
        tent: 0xd9b8ff, tentTip: 0xfff0ff,
        sclera: ['#f2fbea', '#cfe9c4', '#6fa486'],
        iris: '#e0a63a', burst: 0xffd0ea, light: 0xff9cc8
    },
    {
        name: '薄荷汽水 Soda',
        filmBias: 0.35, filmTint: 0xe8fff8,
        core: 0x8eeed6, coreDeep: 0x24b89c, coreRim: 0xf6ffb0,
        heart: 0xff6a7e, heartGlow: 0xfff2a8, blush: 0xff9fb8, lip: 0xff8fb2, lid: 0x6fe0c6,
        fin: 0xb6fff0, finEdge: 0xf6ffb0, tuft: 0x6fe0c6, tuftTip: 0xfff6b0,
        tent: 0x9fd8ff, tentTip: 0xf0fbff,
        sclera: ['#fff8e2', '#f3e2b4', '#b39a62'],
        iris: '#2fa7a0', burst: 0xc8fff0, light: 0x8ffff0
    },
    {
        name: '星夜 Starry',
        filmBias: -0.25, filmTint: 0xf0ecff,
        core: 0xb9a6ff, coreDeep: 0x6a4cf0, coreRim: 0xa8f4ff,
        heart: 0xff5fc8, heartGlow: 0xbff6ff, blush: 0xff8fd8, lip: 0xff7fc8, lid: 0xa08cff,
        fin: 0xcfc2ff, finEdge: 0xa8f4ff, tuft: 0xa08cff, tuftTip: 0xbff6ff,
        tent: 0x9fe6ff, tentTip: 0xffffff,
        sclera: ['#eef0ff', '#ccd4f6', '#7c86bc'],
        iris: '#d0567f', burst: 0xd8ccff, light: 0xb39cff
    }
];
let currentMorphIndex = 0;

// ------------------------------------------------------------------
// 4. 貼圖
// ------------------------------------------------------------------
function createGooglyTexture(sclera) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = sclera[2];
    ctx.fillRect(0, 0, 1024, 512);
    ctx.save();
    ctx.translate(512, 256);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 380);
    g.addColorStop(0, sclera[0]);
    g.addColorStop(0.5, sclera[1]);
    g.addColorStop(1, sclera[2]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 380, 0, Math.PI * 2); ctx.fill();
    const ir = ctx.createRadialGradient(0, 0, 0, 0, 0, 58);
    ir.addColorStop(0, '#1a0f22');
    ir.addColorStop(0.62, '#2b1d3a');
    ir.addColorStop(0.92, '#5a4a70');
    ir.addColorStop(1, 'rgba(90,74,112,0)');
    ctx.fillStyle = ir;
    ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#050307';
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
}
function createEyeTexture(irisHex) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f0e6d4';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.save();
    ctx.translate(512, 256);
    const R = 150;
    const ir = ctx.createRadialGradient(0, 0, 14, 0, 0, R);
    ir.addColorStop(0, '#fff3c8');
    ir.addColorStop(0.35, irisHex);
    ir.addColorStop(0.9, '#2a1206');
    ir.addColorStop(1, '#120806');
    ctx.fillStyle = ir;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 300; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = 26 + Math.random() * 20, r1 = R * (0.7 + Math.random() * 0.25);
        ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,240,200,0.16)' : 'rgba(20,8,4,0.3)';
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
    }
    ctx.fillStyle = '#020101';
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 112, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
}
function radialSpriteTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}
const haloTex = radialSpriteTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

// ------------------------------------------------------------------
// 5. 生物本體：泡靈（住在一顆會長大的泡泡裡）
//    外殼：肥皂泡膜（薄膜干涉色 + 窗光反射 + 軟體物理）
//    核心：泡靈本體（大眼、時之心、鰭、頭頂捲毛）
// ------------------------------------------------------------------
const creatureGroup = new THREE.Group();
creatureGroup.rotation.order = 'YXZ';
scene.add(creatureGroup);
const bodyGroup = new THREE.Group();      // 泡泡（以泡泡中心為原點）
creatureGroup.add(bodyGroup);
const coreGroup = new THREE.Group();      // 泡靈本體（在泡泡裡有慣性地晃）
bodyGroup.add(coreGroup);

const GLSL_NOISE = `
    vec3 hash3(vec3 p) {
        p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
        return fract(sin(p) * 43758.5453);
    }
    float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash3(i).x, n100 = hash3(i + vec3(1,0,0)).x, n010 = hash3(i + vec3(0,1,0)).x, n110 = hash3(i + vec3(1,1,0)).x;
        float n001 = hash3(i + vec3(0,0,1)).x, n101 = hash3(i + vec3(1,0,1)).x, n011 = hash3(i + vec3(0,1,1)).x, n111 = hash3(i + vec3(1,1,1)).x;
        return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
    }
    float fbm(vec3 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1) + 0.15 * vnoise(p * 4.3); }`;
const BASIC_VERT = `
    varying vec3 vN; varying vec3 vView; varying vec3 vObj;
    void main() {
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
    }`;

// 5A. 泡膜 Bubble membrane —— 軟體變形在 vertex shader：
//     半徑 + 沿運動方向拉長（體積守恆）+ 6 個晃動模態 + 吹泡時的「頸部」
const BUBBLE_DEFORM = `
    uniform float uRadius;
    uniform vec3 uStretchDir;
    uniform float uStretch;
    uniform vec3 uModesA;
    uniform vec3 uModesB;
    uniform float uNeck;
    uniform vec4 uPods[3];    // 偽足：xyz = 方向，w = 伸出長度
    uniform vec4 uPodsB[3];   // 黏液手：x = 從泡膜借用的範圍（角度），y = 尖端水滴半徑，z = 下垂量，w = 頸部半徑
    uniform vec4 uPodsC[3];   // 手臂往內彎：xyz = 彎的方向，w = 指尖要彎過去的距離
    uniform float uTime;
    float gooW = 0.0;   // 這個點屬於黏液手的程度（給 fragment 加厚顏色用）
    vec3 deformBubble(vec3 d) {
        gooW = 0.0;
        float r = uRadius;
        // 晃動模態（類似球諧函數 l=2,3）
        float w = uModesA.x * (1.5 * d.y * d.y - 0.5)
                + uModesA.y * (d.x * d.z * 2.0)
                + uModesA.z * (d.x * d.x - d.z * d.z)
                + uModesB.x * (d.y * (2.5 * d.y * d.y - 1.5))
                + uModesB.y * (d.x * d.y * 2.0)
                + uModesB.z * (d.z * d.y * 2.0);
        w += 0.008 * sin(d.x * 9.0 + uTime * 2.3) * sin(d.y * 7.0 - uTime * 1.9);
        vec3 p = d * r * (1.0 + w);
        // 黏液手 Slime arms（胞吞作用的偽足，史萊姆質感）：
        //   每條手臂分三段：尖端是一顆圓圓的水滴 → 中段是會流動的細頸 → 根部是平滑接回泡膜的「黏液彎月面」
        for (int i = 0; i < 3; i++) {
            vec4 pd = uPods[i];
            vec4 pb = uPodsB[i];
            vec4 pc = uPodsC[i];
            float L = pd.w;
            if (L > 0.001) {
                vec3 ax = pd.xyz;
                float a = clamp(dot(d, ax), -1.0, 1.0);
                float ang = acos(a);
                float W = pb.x;
                if (ang < W) {
                    float t = ang / W;                       // 0 = 手臂中心軸，1 = 邊緣
                    vec3 lat = d - ax * a;
                    float ll = length(lat);
                    lat = ll > 1e-5 ? lat / ll : vec3(0.0);
                    float bulbR = pb.y;
                    float neckR = pb.w;
                    float Rs = length(p);
                    vec3 orig = p;
                    float tipC = Rs + L;                     // 水滴中心
                    const float BETA = 2.05;                 // 水滴包到後方約 117°
                    vec3 goo;
                    float f = 0.0;   // 這個點往尖端的程度（整顆水滴 = 1，一起彎、一起垂，不會被剪切變形）
                    if (t < 0.55) {
                        // 尖端水滴
                        float beta = (t / 0.55) * BETA;
                        goo = ax * (tipC + bulbR * cos(beta)) + lat * bulbR * sin(beta);
                        f = 1.0;
                    } else if (t < 0.86) {
                        // 細頸：從水滴後面往根部收細，粗細會像黏液一樣慢慢起伏流動
                        float s = (t - 0.55) / 0.31;
                        float axial = mix(tipC + bulbR * cos(BETA), Rs + neckR * 0.7, s);
                        float rad = mix(bulbR * sin(BETA), neckR, smoothstep(0.0, 0.32, s));
                        rad *= 1.0 + 0.1 * sin(axial * 2.4 - uTime * 3.2 + float(i) * 1.7);
                        rad = mix(rad, neckR * 1.25, smoothstep(0.75, 1.0, s));
                        goo = ax * axial + lat * rad;
                        f = clamp((axial - Rs) / max(L + bulbR * cos(BETA), 0.1), 0.0, 1.0);
                    } else {
                        // 根部：黏液彎月面，平滑地接回泡膜
                        float s = smoothstep(0.86, 1.0, t);
                        vec3 neckPt = ax * (Rs + neckR * 0.7) + lat * neckR * 1.25;
                        goo = mix(neckPt, orig, s * s * (3.0 - 2.0 * s));
                    }
                    // 越往尖端，越受重力往下垂；兩隻手合抱時尖端往內彎
                    goo += vec3(0.0, -1.0, 0.0) * pb.z * f * f;
                    goo += pc.xyz * pc.w * f * f;
                    // 尖端水滴微微晃動
                    vec3 side = normalize(cross(ax, abs(ax.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
                    goo += side * sin(uTime * 2.4 + float(i) * 2.0) * 0.1 * min(L, 3.0) * f * f;
                    // 剛伸出一點點時只是一個鼓包，慢慢長成黏液手
                    float k = smoothstep(0.0, 1.2, L);
                    p = mix(orig + ax * L * (1.0 - t) * (1.0 - t), goo, k);
                    gooW = max(gooW, k * (1.0 - smoothstep(0.8, 1.0, t)));
                }
            }
        }
        // 沿運動方向拉長、其他方向收窄（體積守恆）
        float s = uStretch;
        float a = dot(p, uStretchDir);
        p = (p - uStretchDir * a) / sqrt(1.0 + s) + uStretchDir * a * (1.0 + s);
        // 吹泡頸部：底部往下拉成細頸，接在吹泡口上
        float nw = smoothstep(-0.15, -1.0, d.y) * uNeck;
        p.xz *= mix(1.0, 0.1, nw * nw);
        p.y -= nw * r * 0.5;
        return p;
    }`;
const bubbleUniforms = {
    uRadius: { value: 6 }, uStretchDir: { value: new THREE.Vector3(0, 1, 0) }, uStretch: { value: 0 },
    uModesA: { value: new THREE.Vector3() }, uModesB: { value: new THREE.Vector3() }, uNeck: { value: 0 },
    uPods: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uPodsB: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uPodsC: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uTime: { value: 0 }, uFilmBias: { value: 0 }, uTint: { value: new THREE.Color(0xffffff) },
    uFrost: { value: 0 }, uAlert: { value: 0 }, uThin: { value: 0 }
};
const bubbleMat = new THREE.ShaderMaterial({
    uniforms: bubbleUniforms,
    vertexShader: `
        ${BUBBLE_DEFORM}
        varying vec3 vN; varying vec3 vView; varying vec3 vDir; varying float vGoo;
        void main() {
            vec3 d = normalize(position);
            vec3 P = deformBubble(d);
            vGoo = gooW;
            // 用相鄰點重新算法線（變形後光澤才會跟著動）
            vec3 t1 = normalize(cross(d, abs(d.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
            vec3 t2 = cross(d, t1);
            vec3 Pa = deformBubble(normalize(d + t1 * 0.02));
            vec3 Pb = deformBubble(normalize(d + t2 * 0.02));
            vec3 n = normalize(cross(Pa - P, Pb - P));
            if (dot(n, P) < 0.0) n = -n;
            vDir = d;
            vec4 mv = modelViewMatrix * vec4(P, 1.0);
            vN = normalize(normalMatrix * n);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
        }`,
    fragmentShader: `
        uniform float uTime; uniform float uFilmBias; uniform vec3 uTint; uniform float uFrost; uniform float uAlert; uniform float uThin;
        varying vec3 vN; varying vec3 vView; varying vec3 vDir; varying float vGoo;
        ${GLSL_NOISE}
        void main() {
            vec3 n = normalize(vN);
            vec3 v = normalize(vView);
            if (!gl_FrontFacing) n = -n;
            float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
            float fres = pow(1.0 - ndv, 3.0);

            // 薄膜厚度：漩渦流動 + 重力排液（上薄下厚）
            vec3 q = vDir * 1.35 + vec3(0.0, uTime * 0.07, uTime * 0.03);
            float swirl = fbm(q + fbm(q * 1.7 + uTime * 0.05) * 1.6);
            float thick = 0.42 + 0.55 * swirl - 0.22 * vDir.y + uFilmBias - uThin * 0.25;
            // 光程差 → 三個波長的干涉
            float cosT = sqrt(1.0 - (1.0 - ndv * ndv) / 1.77);
            float opd = 2.0 * 1.33 * thick * cosT;
            vec3 film = 0.5 + 0.5 * cos(6.2831 * opd / vec3(0.65, 0.51, 0.47) * 1.0);
            film = mix(vec3(dot(film, vec3(0.333))), film, 0.85) * uTint;

            // 反射強度（邊緣強、中央弱）
            float edge = 1.0 - ndv;
            float refl = 0.012 + 0.16 * pow(edge, 1.4) + 0.85 * pow(edge, 3.2);
            vec3 col = film * refl;

            // 假環境反射：左上的方窗光 + 右下小亮點 + 地平線
            vec3 r = reflect(-v, n);
            vec2 wpos = r.xy - vec2(-0.48, 0.55);
            float win = (1.0 - smoothstep(0.0, 0.035, max(abs(wpos.x) - 0.06, abs(wpos.y) - 0.045))) * step(0.0, r.z);
            float bar = (1.0 - smoothstep(0.004, 0.012, abs(wpos.x))) * (1.0 - smoothstep(0.04, 0.05, abs(wpos.y)));
            float bar2 = (1.0 - smoothstep(0.004, 0.012, abs(wpos.y))) * (1.0 - smoothstep(0.055, 0.065, abs(wpos.x)));
            win = max(win - max(bar, bar2) * 0.85, 0.0) * (gl_FrontFacing ? 1.0 : 0.35);
            float dotB = pow(max(dot(r, normalize(vec3(0.55, -0.45, 0.7))), 0.0), 220.0);
            float horizon = (1.0 - smoothstep(0.0, 0.08, abs(r.y + 0.05))) * 0.12;
            col += vec3(1.0) * (win * 0.7 + dotB * 0.9) + film * horizon * 0.6;

            // 結晶化（囊胞）：霧面白、冰晶紋
            float crystal = smoothstep(0.55, 0.75, vnoise(vDir * 14.0)) * 0.6 + 0.4 * fbm(vDir * 6.0);
            col = mix(col, (vec3(0.55, 0.6, 0.72) * (0.12 + crystal * 0.35) + film * 0.08) * (0.35 + 0.65 * pow(1.0 - ndv, 1.5)), uFrost * 0.9);

            // 黏液手比泡膜厚：顏色更濃、更不透明，邊緣更亮，像史萊姆
            float gooEdge = pow(1.0 - ndv, 1.4);
            col += vGoo * (film * (0.12 + 0.32 * gooEdge) + vec3(0.04, 0.03, 0.06));
            col += vGoo * vec3(1.0) * pow(max(dot(reflect(-v, n), normalize(vec3(-0.4, 0.75, 0.55))), 0.0), 60.0) * 0.55;

            // 警戒：泡膜泛紅閃爍
            col = mix(col, col * vec3(1.5, 0.45, 0.5) + vec3(0.18, 0.0, 0.02) * fres, uAlert);

            gl_FragColor = vec4(col, 1.0);
        }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
});
const bubbleMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 64), bubbleMat);   // 約 8 萬個三角形：黏液手的水滴和細頸才有足夠的頂點變圓
bubbleMesh.renderOrder = 8;
bubbleMesh.frustumCulled = false;
bodyGroup.add(bubbleMesh);

// 5B. 泡靈本體：手繪漫畫風——粗黑描邊（inverted hull）+ 平塗雙色
//     梨形身體、頂上一大一小、互相疊著的大白眼、兩隻短黑腳
const INK = 0x1b1418;
const CORE_R = 2.4;
const CORE_VIS = 1.3;
const LIGHT_DIR = 'normalize(vec3(-0.45, 0.8, 0.5))';

// 描邊：沿法線往外推、只畫背面
const outlineMats = {};
function outlineMat(thick) {
    const key = thick.toFixed(3);
    if (!outlineMats[key]) {
        outlineMats[key] = new THREE.ShaderMaterial({
            uniforms: { uThick: { value: thick }, uInk: { value: new THREE.Color(INK) } },
            vertexShader: `
                uniform float uThick;
                void main() {
                    vec3 p = position + normalize(normal) * uThick;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
                }`,
            fragmentShader: `
                uniform vec3 uInk;
                void main() { gl_FragColor = vec4(uInk, 1.0); }`,
            side: THREE.BackSide
        });
    }
    return outlineMats[key];
}
function inked(geo, mat, thick) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    const o = new THREE.Mesh(geo, outlineMat(thick));
    m.renderOrder = 4;
    o.renderOrder = 4;
    g.add(m, o);
    return { g, m, o };
}
// 平塗雙色（亮面 / 暗面，硬邊交界）
function makeToonMat(colorHex, shadeHex) {
    return new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(colorHex) }, uShade: { value: new THREE.Color(shadeHex) } },
        vertexShader: `
            varying vec3 vWN;
            void main() {
                vWN = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 uCol; uniform vec3 uShade;
            varying vec3 vWN;
            void main() {
                float d = dot(normalize(vWN), ${LIGHT_DIR});
                float t = smoothstep(-0.12, -0.04, d);
                gl_FragColor = vec4(mix(uShade, uCol, t) * 0.94, 1.0);
            }`
    });
}

const toon = new THREE.Group();          // 整隻（往下移，讓視覺中心在泡泡中央）
toon.position.y = -0.75;
coreGroup.add(toon);
const bodyRig = new THREE.Group();       // 身體 + 腳（吹氣時會壓扁）
toon.add(bodyRig);

// 身體：梨形，底部圓胖，往上收成脖子
const bodyPts = new THREE.SplineCurve([
    new THREE.Vector2(0.001, -1.95), new THREE.Vector2(0.62, -1.88), new THREE.Vector2(1.06, -1.62),
    new THREE.Vector2(1.3, -1.2), new THREE.Vector2(1.36, -0.72), new THREE.Vector2(1.26, -0.2),
    new THREE.Vector2(1.02, 0.28), new THREE.Vector2(0.72, 0.72), new THREE.Vector2(0.52, 1.1),
    new THREE.Vector2(0.44, 1.5), new THREE.Vector2(0.4, 1.95), new THREE.Vector2(0.001, 2.1)
]).getPoints(70);
// 小熊軟糖質地 Gummy：半透明、邊緣顏色較深（比較厚）、中央透亮、糖果般的銳利高光
// ------------------------------------------------------------------
// 小熊軟糖材質 Gummy（用「真實厚度」上色）
//   1. 每一幀先把軟糖部位的「背面深度」畫到一張貼圖（back-face depth pass）
//   2. 正面著色時讀回背面深度 → 算出光線穿過軟糖的厚度
//   3. Beer–Lambert 吸收：薄的地方（腳趾、脖子、邊緣）透亮、厚的地方（肚子）深而飽和
//   4. 加上次表面散射、內部微霧、糖果高光
// ------------------------------------------------------------------
const GUMMY_LAYER = 2;
const gummyRT = new THREE.WebGLRenderTarget(4, 4, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true
});
const gummyShared = {
    uBackDepth: { value: gummyRT.texture },
    uRes: { value: new THREE.Vector2(4, 4) },
    uNear: { value: camera.near }, uFar: { value: camera.far },
    uFogColor: { value: scene.fog.color }, uFogDensity: { value: scene.fog.density }
};
function gummyVert(morph, forBack) {
    return `
        uniform float uShape;
        varying vec3 vN; varying vec3 vWN; varying vec3 vView; varying vec3 vObj; varying float vViewZ;
        void main() {
            vec3 p = position;
            vec3 nrm = normal;
            ${morph ? `
            // 剛吹出來時是一顆圓球，慢慢變成梨形
            vec3 c = vec3(0.0, -0.55, 0.0);
            vec3 sph = c + normalize(position - c) * 1.3;
            p = mix(sph, position, uShape);
            nrm = normalize(mix(normalize(position - c), normal, uShape));` : ''}
            vObj = p;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vViewZ = mv.z;
            vN = normalize(normalMatrix * nrm);
            vWN = normalize(mat3(modelMatrix) * nrm);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
        }`;
}
const gummyMats = [];
function makeGummyMat(colorHex, deepHex, morph, fixedThick) {
    const uniforms = Object.assign({
        uCol: { value: new THREE.Color(colorHex) }, uDeep: { value: new THREE.Color(deepHex) },
        uShape: { value: 1 }, uTime: { value: 0 },
        uFixedThick: { value: fixedThick === undefined ? -1 : fixedThick },
        uDensity: { value: 0.75 }
    }, gummyShared);
    const front = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: gummyVert(morph),
        fragmentShader: `
            #include <packing>
            uniform vec3 uCol; uniform vec3 uDeep; uniform float uTime;
            uniform sampler2D uBackDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar;
            uniform float uFixedThick; uniform float uDensity;
            uniform vec3 uFogColor; uniform float uFogDensity;
            varying vec3 vN; varying vec3 vWN; varying vec3 vView; varying vec3 vObj; varying float vViewZ;
            float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
            float noise3(vec3 p) {
                vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                           mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
            }
            void main() {
                // ---- 厚度 ----
                float thick;
                if (uFixedThick >= 0.0) {
                    thick = uFixedThick;
                } else {
                    float bd = unpackRGBAToDepth(texture2D(uBackDepth, gl_FragCoord.xy / uRes));
                    float backZ = perspectiveDepthToViewZ(bd, uNear, uFar);
                    thick = bd >= 0.9999 ? 0.4 : clamp(vViewZ - backZ, 0.0, 12.0);
                }
                // 內部一點點不均勻（像真的軟糖有微霧）
                thick *= 0.85 + 0.3 * noise3(vObj * 2.6 + vec3(0.0, uTime * 0.05, 0.0));

                vec3 n = normalize(vN);
                // 表面極細微的凹凸，避免太像塑膠
                n = normalize(n + 0.03 * (vec3(noise3(vObj * 9.0), noise3(vObj * 9.0 + 7.1), noise3(vObj * 9.0 + 3.3)) - 0.5));
                vec3 v = normalize(vView);
                float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
                vec3 L = ${LIGHT_DIR};

                // ---- Beer–Lambert：吸收掉互補色，越厚越深、越飽和 ----
                vec3 sigma = (vec3(1.0) - uCol) * uDensity * 1.6 + uDensity * 0.18;
                vec3 T = exp(-sigma * thick);
                // 穿透光（從背後與四周進來，被染色）
                vec3 transmitted = mix(uCol, vec3(1.0), 0.06) * T * 1.05;
                // 散射光（在糖體內部打轉出來的顏色，厚的地方偏深色）
                vec3 scattered = mix(uCol, uDeep, smoothstep(0.5, 3.5, thick)) * (1.0 - exp(-thick * 0.9)) * 0.62;
                vec3 col = transmitted + scattered;

                // 受光面稍亮（保留形體）
                float wrap = dot(normalize(vWN), L) * 0.5 + 0.5;
                col *= 0.7 + 0.42 * wrap;

                // 菲涅耳反射 + 糖果高光（一大片柔光 + 一個銳利亮點）
                float fres = pow(1.0 - ndv, 4.0);
                col += mix(uCol, vec3(1.0), 0.5) * fres * 0.12;
                vec3 h = normalize(normalize(vec3(-0.45, 0.8, 0.6)) + v);
                float nh = max(dot(n, h), 0.0);
                col += vec3(1.0) * (pow(nh, 140.0) * 1.15 + pow(nh, 16.0) * 0.14);
                vec3 h2 = normalize(normalize(vec3(0.75, -0.15, 0.65)) + v);
                col += vec3(1.0) * pow(max(dot(n, h2), 0.0), 220.0) * 0.45;

                // 半透明：薄的地方看得到後面（例如飄過去的愛心）
                float a = clamp(1.0 - dot(T, vec3(0.333)) * 0.6, 0.66, 0.97);
                // 深海的霧
                float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
                col = mix(col * 0.94, uFogColor, fogF);
                gl_FragColor = vec4(col, a);
            }`,
        transparent: true
    });
    if (fixedThick === undefined) {
        front.userData.back = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: gummyVert(morph),
            fragmentShader: `
                #include <packing>
                void main() { gl_FragColor = packDepthToRGBA(gl_FragCoord.z); }`,
            side: THREE.BackSide, blending: THREE.NoBlending
        });
    }
    gummyMats.push(front);
    return front;
}
const gummyMeshes = [];
function registerGummy(root) {
    root.traverse((o) => {
        if (o.isMesh && gummyMats.includes(o.material) && o.material.userData.back) {
            o.layers.enable(GUMMY_LAYER);
            gummyMeshes.push(o);
        }
    });
}
// 每幀：把軟糖的背面深度畫到 gummyRT
function renderGummyBackDepth() {
    const prevBg = scene.background;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color()).getHex();
    const prevAlpha = renderer.getClearAlpha();
    for (const m of gummyMeshes) { m.userData.front = m.material; m.material = m.material.userData.back; }
    scene.background = null;
    camera.layers.set(GUMMY_LAYER);
    renderer.setRenderTarget(gummyRT);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    camera.layers.set(0);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    scene.background = prevBg;
    for (const m of gummyMeshes) m.material = m.userData.front;
}
function resizeGummy() {
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    gummyRT.setSize(v.x, v.y);
    gummyShared.uRes.value.copy(v);
}
resizeGummy();

const bodyMat = makeGummyMat(0xffb6d3, 0xe0588f, true);
const gummyMat = makeGummyMat(0xffb6d3, 0xe0588f, false);   // 脖子
const lidGummyMat = makeGummyMat(0xffb6d3, 0xe0588f, false, 0.35);   // 眼皮是薄殼，用固定厚度
const footMat = makeGummyMat(0xf58cb8, 0xb83a72, false);    // 腳丫顏色深一點
const bodyMesh = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 72), bodyMat);
bodyMesh.rotation.z = -0.07;
bodyMesh.renderOrder = 4;
bodyRig.add(bodyMesh);

// 腳丫：圓圓胖胖的軟糖小腳（放大，比較看得清楚）
const inkMat = new THREE.MeshBasicMaterial({ color: INK });
const legGeo = new THREE.CylinderGeometry(0.26, 0.24, 0.42, 18);
legGeo.translate(0, -0.2, 0);
const footGeo = new THREE.SphereGeometry(1, 28, 18);
footGeo.scale(0.46, 0.27, 0.62);
const toeGeo = new THREE.SphereGeometry(0.13, 14, 10);
const legs = [];
for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.52, -1.72, 0.08);
    const leg = new THREE.Mesh(legGeo, footMat);
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(side * 0.04, -0.46, 0.16);
    // 三顆小腳趾
    for (let t = -1; t <= 1; t++) {
        const toe = new THREE.Mesh(toeGeo, footMat);
        toe.position.set(side * 0.04 + t * 0.2, -0.44, 0.7 - Math.abs(t) * 0.06);
        toe.renderOrder = 4;
        pivot.add(toe);
    }
    leg.renderOrder = foot.renderOrder = 4;
    pivot.add(leg, foot);
    bodyRig.add(pivot);
    legs.push({ pivot, side });
}

// 時之心：一顆會發光的立體小愛心，在泡泡裡飄來飄去
const heartShape = new THREE.Shape();
heartShape.moveTo(0, -1.0);
heartShape.bezierCurveTo(0.25, -0.6, 1.15, -0.3, 1.15, 0.28);
heartShape.bezierCurveTo(1.15, 0.85, 0.5, 1.08, 0, 0.58);
heartShape.bezierCurveTo(-0.5, 1.08, -1.15, 0.85, -1.15, 0.28);
heartShape.bezierCurveTo(-1.15, -0.3, -0.25, -0.6, 0, -1.0);
const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.42, bevelSize: 0.34, bevelSegments: 14, curveSegments: 48 });
heartGeo.center();
heartGeo.computeVertexNormals();
const heartUniforms = { uCol: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uBeat: { value: 0 }, uRewind: { value: 0 }, uTime: { value: 0 } };
const heartMat = new THREE.ShaderMaterial({
    uniforms: heartUniforms,
    vertexShader: `
        varying vec3 vN; varying vec3 vView; varying vec3 vObj;
        void main() {
            vObj = position;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
        }`,
    fragmentShader: `
        uniform vec3 uCol; uniform vec3 uGlow; uniform float uBeat; uniform float uRewind; uniform float uTime;
        varying vec3 vN; varying vec3 vView; varying vec3 vObj;
        void main() {
            vec3 n = normalize(vN);
            vec3 v = normalize(vView);
            float ndv = abs(dot(n, v));
            float fres = pow(1.0 - ndv, 2.0);
            // 像糖果一樣的內部發光：越中心越亮
            float core = 1.0 - smoothstep(0.0, 1.35, length(vObj.xy));
            vec3 col = mix(uCol * 0.85, uGlow, core * (0.45 + uBeat * 0.5 + uRewind * 0.6));
            col *= 0.8 + 0.35 * clamp(n.y * 0.6 + n.z * 0.5 + 0.3, 0.0, 1.0);
            // 邊緣透光 + 兩個高光
            col += uGlow * fres * 0.9;
            vec3 h1 = normalize(normalize(vec3(-0.45, 0.75, 0.6)) + v);
            vec3 h2 = normalize(normalize(vec3(0.6, -0.2, 0.8)) + v);
            col += vec3(1.0) * (pow(max(dot(n, h1), 0.0), 70.0) * 1.4 + pow(max(dot(n, h2), 0.0), 120.0) * 0.7);
            col *= 1.05 + uBeat * 0.25;
            gl_FragColor = vec4(col, 1.0);
        }`
});
const heartGroup = new THREE.Group();
bodyGroup.add(heartGroup);
const heart = new THREE.Mesh(heartGeo, heartMat);
heart.renderOrder = 5;
heartGroup.add(heart);
// 心臟正面的小時針：平常順時針走，結繭時逆轉
const handPivot = new THREE.Group();
handPivot.position.set(0, 0.03, 0.68);
const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.46, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }));
hand.position.y = 0.2;
handPivot.add(hand);
heart.add(handPivot);
const heartHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffd27a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
heartHalo.scale.set(3.4, 3.4, 3.4);
heartGroup.add(heartHalo);
// 飄過的光點尾巴
const HEART_TRAIL = 14;
const heartTrail = [];
const heartHistory = [];
for (let i = 0; i < HEART_TRAIL; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.renderOrder = 6;
    bodyGroup.add(sp);
    heartTrail.push(sp);
}
let heartSpin = 0;
const heartPos = new THREE.Vector3(3.2, 1.2, 1.0);
const heartVel = new THREE.Vector3(1.7, 0.9, 1.1);
let heartSquash = 0;
let bodyJiggle = 0;
const _hn = new THREE.Vector3();
// 生長進度：0 = 什麼都沒有 → 先吹出泡泡 → 身體像泡泡一樣脹出來 → 長出脖子和眼睛 → 長出腳丫
let birth = 0;
let growth = 1;
function startBirth() { birth = 0; bub.R = 0.3; bub.vR = 0; }
function easeOutElastic(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
}
const growPart = (a, b) => easeOutElastic(THREE.MathUtils.clamp((growth - a) / (b - a), 0, 1));

// 吹泡口：平常看不到，吹氣時才冒出一個小小的「o」
const mouthGroup = new THREE.Group();
mouthGroup.position.set(-0.08, 0.62, 0.86);
mouthGroup.rotation.x = -0.35;
const mouthRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 10, 24), inkMat);
const mouthHole = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: 0x5a1830 }));
mouthGroup.add(mouthRing, mouthHole);
mouthGroup.scale.setScalar(0.001);
bodyRig.add(mouthGroup);

// 眼睛：大白眼 + 小黑瞳（瞳孔畫在貼圖上，眼球轉動時瞳孔會跟著你）
function createToonEyeTexture(stare) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fbfaf4';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.save();
    ctx.translate(512, 256);
    if (stare) {
        // 凝視：細細的血絲 + 直立狹長瞳孔
        ctx.strokeStyle = 'rgba(200, 40, 60, 0.55)';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            let x = Math.cos(a) * 230, y = Math.sin(a) * 200;
            ctx.beginPath(); ctx.moveTo(x, y);
            for (let s = 0; s < 5; s++) { x *= 0.8; y *= 0.8; x += (Math.random() - 0.5) * 14; y += (Math.random() - 0.5) * 14; ctx.lineTo(x, y); }
            ctx.stroke();
        }
        ctx.fillStyle = '#120a0c';
        ctx.beginPath(); ctx.ellipse(0, 0, 13, 84, 0, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.fillStyle = '#120a0c';
        ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
}
function makeEyeMat(tex) {
    return new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex } },
        vertexShader: `
            varying vec2 vUv; varying vec3 vWN;
            void main() {
                vUv = uv;
                vWN = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform sampler2D uMap;
            varying vec2 vUv; varying vec3 vWN;
            void main() {
                vec3 col = texture2D(uMap, vUv).rgb;
                float d = dot(normalize(vWN), ${LIGHT_DIR});
                col *= mix(0.84, 0.95, smoothstep(-0.35, -0.2, d));
                gl_FragColor = vec4(col, 1.0);
            }`
    });
}
const eyeMat = makeEyeMat(createToonEyeTexture(false));
const stareMat = makeEyeMat(createToonEyeTexture(true));
const eyeCluster = new THREE.Group();     // 兩顆眼睛一起晃（像大頭娃娃）
eyeCluster.position.set(0.1, 1.85, 0);
toon.add(eyeCluster);
const EYE_SPECS = [
    { pos: [-0.55, 1.0, 0.05], r: 1.22 },   // 左上那顆比較高、比較大
    { pos: [0.92, 0.12, 0.55], r: 1.06 }    // 右下那顆比較低、疊在前面
];
const EYE_OPEN = -Math.PI / 2 - 0.12;    // 眼皮收在眼睛後上方
const EYE_SHUT = Math.PI / 2 - 0.02;     // 眼皮完全蓋住正面
const eyes = [];
for (const spec of EYE_SPECS) {
    const socket = new THREE.Group();
    socket.position.set(...spec.pos);
    const geo = new THREE.SphereGeometry(spec.r, 48, 32);
    geo.rotateY(-Math.PI / 2);
    const ball = new THREE.Mesh(geo, eyeMat);
    const slit = new THREE.Mesh(geo, stareMat);
    slit.visible = false;
    const outline = new THREE.Mesh(new THREE.SphereGeometry(spec.r, 48, 32), outlineMat(0.075));
    ball.renderOrder = slit.renderOrder = outline.renderOrder = 4;
    // 眼皮：跟身體同色的半球殼，眨眼時從上往下蓋住眼睛
    const lidGeo = new THREE.SphereGeometry(spec.r * 1.05, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const lidPivot = new THREE.Group();
    const lid = new THREE.Mesh(lidGeo, lidGummyMat);
    const lidInk = new THREE.Mesh(lidGeo, outlineMat(0.04));
    lid.renderOrder = lidInk.renderOrder = 4;
    // 眼皮邊緣的黑線（漫畫感的關鍵）
    const lash = new THREE.Mesh(new THREE.TorusGeometry(spec.r * 1.05, 0.05, 8, 64), inkMat);
    lash.rotation.x = Math.PI / 2;
    lidPivot.add(lid, lidInk, lash);
    lidPivot.rotation.x = EYE_OPEN;
    socket.add(ball, slit, outline, lidPivot);
    eyeCluster.add(socket);
    eyes.push({ socket, ball, slit, lidPivot, q: new THREE.Quaternion(), wob: Math.random() * 6, blink: 0, delay: -1 });
}
// 脖子：從身體頂端接到兩顆眼睛之間
const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0.12, 2.2, 0.1), new THREE.Vector3(0.3, 2.6, 0.25)
]);
const neckGeo = new THREE.TubeGeometry(neckCurve, 24, 0.38, 18, false);
neckGeo.translate(0, -1.7, 0);
const neckPivot = new THREE.Group();
neckPivot.position.set(0, 1.7, 0);
const neckMesh = new THREE.Mesh(neckGeo, gummyMat);
neckMesh.renderOrder = 4;
neckPivot.add(neckMesh);
toon.add(neckPivot);
registerGummy(toon);

// 5C. 記憶泡泡 Memory bubbles：每輪迴一次多一顆，繞著泡靈轉
const memUniforms = {
    uRadius: { value: 1 }, uStretchDir: { value: new THREE.Vector3(0, 1, 0) }, uStretch: { value: 0 },
    uModesA: { value: new THREE.Vector3() }, uModesB: { value: new THREE.Vector3() }, uNeck: { value: 0 },
    uPods: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uPodsB: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uPodsC: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uTime: { value: 0 }, uFilmBias: { value: 0.15 }, uTint: { value: new THREE.Color(0xffffff) },
    uFrost: { value: 0 }, uAlert: { value: 0 }, uThin: { value: 0 }
};
const memMat = new THREE.ShaderMaterial({
    uniforms: memUniforms, vertexShader: bubbleMat.vertexShader, fragmentShader: bubbleMat.fragmentShader,
    transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending
});
const MAX_MEM = 9;
const memGroup = new THREE.Group();
bodyGroup.add(memGroup);
const memBubbles = [];
for (let i = 0; i < MAX_MEM; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), memMat);
    m.scale.setScalar(0.001);
    m.renderOrder = 6;
    memGroup.add(m);
    memBubbles.push({ mesh: m, target: 0, pop: 0, phase: (i / MAX_MEM) * Math.PI * 2, tilt: (Math.random() - 0.5) * 0.9, speed: 0.4 + Math.random() * 0.3, size: 0.38 + Math.random() * 0.14 });
}
let memCount = 0;
function setRings(level) {
    const n = Math.min(MAX_MEM, Math.max(1, level));
    for (let i = 0; i < MAX_MEM; i++) {
        const on = i < n;
        if (on && memBubbles[i].target === 0) memBubbles[i].pop = 1;
        memBubbles[i].target = on ? 1 : 0;
    }
    memCount = n;
}

// 5D. 泡泡尾巴 Bubble tail：從泡泡底部垂下的細絲，尾端掛著小泡泡珠
const tubeVert = `
    uniform float uTime; uniform vec3 uDrag; uniform float uSway;
    attribute float aPhase;
    varying vec3 vN; varying vec3 vView; varying float vS;
    void main() {
        float s = uv.y;
        vS = s;
        vec3 p = position;
        float w = pow(s, 1.3);
        p.x += sin(uTime * 1.5 + s * 4.0 + aPhase) * uSway * w;
        p.z += cos(uTime * 1.2 + s * 3.5 + aPhase * 1.7) * uSway * w;
        p += clamp(uDrag, vec3(-3.5), vec3(3.5)) * w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
    }`;
const tubeFrag = `
    uniform vec3 uBase; uniform vec3 uTip;
    varying vec3 vN; varying vec3 vView; varying float vS;
    void main() {
        vec3 n = normalize(vN);
        float fres = pow(1.0 - abs(dot(n, normalize(vView))), 2.0);
        vec3 col = mix(uBase, uTip, smoothstep(0.5, 1.0, vS));
        col *= 0.75 + 0.35 * clamp(n.y * 0.7 + n.z * 0.4 + 0.3, 0.0, 1.0);
        col += uTip * (fres * 0.6 + smoothstep(0.88, 1.0, vS) * 0.9);
        gl_FragColor = vec4(col, 0.85);
    }`;
function makeTubeMat(sway) {
    return new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uDrag: { value: new THREE.Vector3() }, uSway: { value: sway }, uBase: { value: new THREE.Color() }, uTip: { value: new THREE.Color() } },
        vertexShader: tubeVert, fragmentShader: tubeFrag, transparent: true
    });
}
function makeTube(pathFn, radiusFn, rows, radial, phase) {
    const pos = [], uv = [], ph = [], idx = [];
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    const ref = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i <= rows; i++) {
        const s = i / rows;
        const p = pathFn(s);
        T.subVectors(pathFn(Math.min(1, s + 1 / rows)), pathFn(Math.max(0, s - 1 / rows))).normalize();
        N.crossVectors(T, ref);
        if (N.lengthSq() < 1e-4) N.set(0, 0, 1);
        N.normalize();
        B.crossVectors(T, N).normalize();
        for (let j = 0; j <= radial; j++) {
            const phi = (j / radial) * Math.PI * 2;
            const r = radiusFn(s, phi);
            pos.push(p.x + (N.x * Math.cos(phi) + B.x * Math.sin(phi)) * r, p.y + (N.y * Math.cos(phi) + B.y * Math.sin(phi)) * r, p.z + (N.z * Math.cos(phi) + B.z * Math.sin(phi)) * r);
            uv.push(j / radial, s);
            ph.push(phase);
        }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
const tentMat = makeTubeMat(0.5);
const tailGroup = new THREE.Group();
bodyGroup.add(tailGroup);
for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const len = 3.4 + (k % 3) * 1.0;
    const geo = makeTube(
        (s) => new THREE.Vector3(Math.cos(a) * (0.4 + s * 0.9) + Math.sin(s * 9 + k) * 0.18 * s, -s * len, Math.sin(a) * (0.4 + s * 0.9)),
        (s) => {
            // 細絲上串著幾顆小珠子，尾端一顆圓球
            const bead = Math.max(0, Math.cos((s * 5.0 % 1) * Math.PI * 2)) ;
            const tip = s > 0.88 ? Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.94) / 0.06, 2))) * 0.22 : 0;
            return Math.max(0.045 + 0.05 * Math.pow(bead, 8) * (s > 0.15 ? 1 : 0), tip);
        },
        90, 8, a * 2);
    const m = new THREE.Mesh(geo, tentMat);
    m.renderOrder = 2;
    tailGroup.add(m);
}

// 5D-2. 小熊軟糖 Gummy bears：投放的孢子就是一顆顆小熊軟糖
function mergeGeos(parts) {
    const pos = [], nor = [], idx = [];
    let off = 0;
    for (const [g, m] of parts) {
        const gg = g.clone();
        gg.applyMatrix4(m);
        const p = gg.attributes.position, n = gg.attributes.normal;
        for (let i = 0; i < p.count; i++) {
            pos.push(p.getX(i), p.getY(i), p.getZ(i));
            nor.push(n.getX(i), n.getY(i), n.getZ(i));
        }
        for (let i = 0; i < gg.index.count; i++) idx.push(gg.index.getX(i) + off);
        off += p.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    return geo;
}
const bearGeo = (() => {
    const S = new THREE.SphereGeometry(1, 22, 16);
    const M = (x, y, z, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    const g = mergeGeos([
        [S, M(0, 0, 0, 0.52, 0.62, 0.42)],          // 肚子
        [S, M(0, 0.8, 0, 0.44, 0.4, 0.38)],         // 頭
        [S, M(-0.31, 1.1, 0, 0.15, 0.15, 0.11)],    // 耳朵
        [S, M(0.31, 1.1, 0, 0.15, 0.15, 0.11)],
        [S, M(0, 0.7, 0.31, 0.17, 0.13, 0.12)],     // 鼻子
        [S, M(-0.49, 0.18, 0.06, 0.17, 0.26, 0.16)],// 手
        [S, M(0.49, 0.18, 0.06, 0.17, 0.26, 0.16)],
        [S, M(-0.27, -0.56, 0.08, 0.21, 0.22, 0.2)],// 腳
        [S, M(0.27, -0.56, 0.08, 0.21, 0.22, 0.2)]
    ]);
    g.translate(0, -0.2, 0);
    return g;
})();
const CANDY_FLAVORS = [
    { name: '草莓', col: 0xff4f86, deep: 0x8a0f3a },
    { name: '柳橙', col: 0xff8a2a, deep: 0x8a3a00 },
    { name: '檸檬', col: 0xffd23a, deep: 0x8a6000 },
    { name: '薄荷', col: 0x2fd6a8, deep: 0x0a6650 },
    { name: '葡萄', col: 0x9a6bff, deep: 0x3a1a8a },
    { name: '櫻桃', col: 0xff2f4a, deep: 0x7a0018 },
    { name: '藍莓', col: 0x4f8fff, deep: 0x14348a }
];
const candyMats = CANDY_FLAVORS.map(f => makeGummyMat(f.col, f.deep, false));
function addGummyMesh(mesh) {
    mesh.layers.enable(GUMMY_LAYER);
    gummyMeshes.push(mesh);
    mesh.renderOrder = 4;
}
function removeGummyMesh(mesh) {
    const i = gummyMeshes.indexOf(mesh);
    if (i >= 0) gummyMeshes.splice(i, 1);
}

// 5E. 泡泡裡的養分 Nutrients：孢子穿過泡膜後，在泡泡裡繞圈、被泡靈吸收
const MAX_FOOD = 40;
const foodPos = new Float32Array(MAX_FOOD * 3);
const foodCol = new Float32Array(MAX_FOOD * 3);
const foodGeo = new THREE.BufferGeometry();
foodGeo.setAttribute('position', new THREE.BufferAttribute(foodPos, 3));
foodGeo.setAttribute('color', new THREE.BufferAttribute(foodCol, 3));
const foodPoints = new THREE.Points(foodGeo, new THREE.PointsMaterial({ size: 1.0, map: softTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
foodPoints.frustumCulled = false;
foodPoints.renderOrder = 7;
bodyGroup.add(foodPoints);
foodPoints.visible = false;   // 改用迷你小熊軟糖
const food = [];
const miniBears = [];
// 吞噬小泡 Phagosome：被偽足包進來的軟糖，外面裹著一層小泡泡
const vesicles = [];
const vesicleGeo = new THREE.IcosahedronGeometry(1, 4);
for (let i = 0; i < MAX_FOOD; i++) {
    const m = new THREE.Mesh(bearGeo, candyMats[0]);
    m.visible = false;
    bodyGroup.add(m);
    addGummyMesh(m);
    miniBears.push(m);
    const v = new THREE.Mesh(vesicleGeo, memMat);
    v.visible = false;
    v.renderOrder = 7;
    bodyGroup.add(v);
    vesicles.push(v);
}
const DIGEST_TIME = 2.6;

// 泡泡的軟體狀態 Soft-body state
const bub = {
    R: 5.0, vR: 0,                      // 半徑彈簧
    stretch: new THREE.Vector3(), vStretch: new THREE.Vector3(),
    modes: [0, 0, 0, 0, 0, 0], modeAmp: [0, 0, 0, 0, 0, 0],
    modeFreq: [5.1, 6.3, 6.9, 7.8, 8.6, 9.4], modePhase: [0, 1.3, 2.1, 0.7, 2.9, 1.8],
    coreOff: new THREE.Vector3(), vCore: new THREE.Vector3(),
    prevVel: new THREE.Vector3(), neck: 0, puff: 0, blowWobble: 0
};
function shellTargetRadius() { return 3.9 + 4.4 * creatureState.maturity; }
function bubbleWorldRadius() { return bub.R * creatureGroup.scale.x; }
function exciteWobble(strength) {
    for (let i = 0; i < 6; i++) {
        bub.modeAmp[i] = Math.min(0.16, bub.modeAmp[i] + strength * (0.5 + Math.random() * 0.8));
        bub.modePhase[i] = Math.random() * 6.28;
    }
}

let mouthOpen = 0;
let eatOpen = 0;          // 張大嘴吃軟糖
let chomp = 0;            // 咬下去那一下
const eatLook = new THREE.Vector3();
let eatLookOn = 0;
// 偽足 Pseudopods：用兩條像雙手一樣合抱軟糖（見下方 grab）
const POD_REACH = 9.0;    // 偽足最長能伸多遠（泡泡表面以外）
// 泡泡環 Bubble ring：吐出泡泡環 → 飛過去 → 收成小泡泡包住軟糖 → 拉回來 → 併進大泡泡；一次只吃一顆
const RING_REACH = 12.0;            // 泡泡環能飛多遠（泡泡表面以外）
const ringMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: `
        varying vec3 vN; varying vec3 vView; varying vec3 vObj;
        void main() {
            vObj = position;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
        }`,
    fragmentShader: `
        uniform float uTime; uniform float uFade;
        varying vec3 vN; varying vec3 vView; varying vec3 vObj;
        void main() {
            vec3 n = normalize(vN);
            vec3 v = normalize(vView);
            if (!gl_FrontFacing) n = -n;
            float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
            // 泡泡環也是肥皂膜：薄膜干涉色會沿著環一直轉
            float ang = atan(vObj.y, vObj.x);
            float thick = 0.48 + 0.3 * sin(ang * 3.0 + uTime * 3.0) + 0.15 * sin(vObj.z * 9.0 - uTime * 5.0);
            float cosT = sqrt(1.0 - (1.0 - ndv * ndv) / 1.77);
            vec3 film = 0.5 + 0.5 * cos(6.2831 * (2.66 * thick * cosT) / vec3(0.65, 0.51, 0.47));
            vec3 col = film * (0.16 + 1.0 * pow(1.0 - ndv, 2.0));
            vec3 h = normalize(normalize(vec3(-0.4, 0.8, 0.5)) + v);
            col += vec3(1.0) * pow(max(dot(n, h), 0.0), 60.0) * 0.9;
            gl_FragColor = vec4(col * uFade, 1.0);
        }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
});
const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 32, 96), ringMat);
ringMesh.visible = false;
ringMesh.renderOrder = 8;
scene.add(ringMesh);
const capMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 20), memMat);   // 包住軟糖的小泡泡
capMesh.visible = false;
capMesh.renderOrder = 8;
scene.add(capMesh);
const grab = {
    active: false, sp: null, phase: 'idle', t: 0, s: 0,
    from: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    ringR: 0.4, capR: 1, crossed: false, spin: 0
};
let spitOpen = 0;
const _ringTmp = new THREE.Vector3();
const _podLocal = new THREE.Vector3();
function podReachWorld() { return bubbleWorldRadius() + RING_REACH * creatureGroup.scale.x; }
function isEating() { return grab.active || food.length > 0; }
function tryGrab(sp) {
    if (creatureState.stage !== 'MEDUSA' || growth < 1) return false;
    if (isEating()) return false;                 // 一次只吃一顆
    grab.active = true; grab.sp = sp; grab.phase = 'aim'; grab.t = 0;
    grab.capR = 0.75 * (sp.baseScale || 1) + 0.45;
    grab.crossed = false;
    sp.grabbed = true;
    return true;
}
function releaseGrab() {
    if (grab.sp) grab.sp.grabbed = false;
    grab.sp = null;
    grab.phase = 'idle';
    grab.active = false;
    ringMesh.visible = false;
    capMesh.visible = false;
}
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
let happy = 0;
const _fp = new THREE.Vector3();
function feedStomach(amount, worldPos, flavor) {
    if (food.length >= MAX_FOOD) food.shift();
    const start = new THREE.Vector3();
    if (worldPos) {
        start.copy(worldPos);
        bodyGroup.worldToLocal(start);
        start.setLength(bub.R * 0.92);
    } else {
        start.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).setLength(bub.R * 0.9);
    }
    food.push({ p: start, phase: 'swim', t: 0, amount, flavor: flavor || 0, rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0) });
    exciteWobble(0.035);   // 孢子穿過泡膜，泡膜輕輕一震
}
// 消化完成 → 泡靈「呼」地吹一口氣，泡泡長大一圈
function blowPuff(amount) {
    creatureState.maturity = Math.min(1, creatureState.maturity + amount);
    bub.vR += 5.5;
    bub.puff = 1;
    mouthOpen = 1;
    exciteWobble(0.07);
    spawn3DBurst(creatureState.pos.clone().add(new THREE.Vector3(0, -0.5, 2)), MORPH_THEMES[currentMorphIndex].burst, 5, 0.25);
}

// 5F. 囊胞 Cyst：泡膜縮緊、結晶化（不另外做外殼）
const cystCocoonGroup = new THREE.Group();
cystCocoonGroup.visible = false;
creatureGroup.add(cystCocoonGroup);

// 5G. 水螅體 Polyp：頂端是一個「吹泡圈」，把新的自己吹成泡泡
const polypGroup = new THREE.Group();
polypGroup.visible = false;
scene.add(polypGroup);
const polypSkinMat = new THREE.MeshStandardMaterial({ roughness: 0.4, transparent: true, opacity: 0.92, emissiveIntensity: 0.3 });
const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 4.2, 14, 6), polypSkinMat);
stalk.position.y = -1.6;
const hydranthPts = [];
for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    hydranthPts.push(new THREE.Vector2(0.3 + Math.sin(Math.PI * t * 0.75) * 0.55 + t * 0.25, 0.2 + t * 1.5));
}
const hydranth = new THREE.Mesh(new THREE.LatheGeometry(hydranthPts, 32), polypSkinMat);
const wand = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.11, 12, 40), polypSkinMat);
wand.rotation.x = Math.PI / 2;
wand.position.y = 1.72;
polypGroup.add(stalk, hydranth, wand);
const polypTentMat = makeTubeMat(0.2);
for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    polypGroup.add(new THREE.Mesh(makeTube(
        (s) => new THREE.Vector3(Math.cos(a) * (0.7 + s * 1.3), 1.6 - Math.sin(s * Math.PI * 0.9) * 0.2 - s * 0.8, Math.sin(a) * (0.7 + s * 1.3)),
        (s) => { const tip = s > 0.82 ? Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.91) / 0.09, 2))) * 0.15 : 0; return Math.max(0.1 * (1 - s) + 0.03, tip); },
        24, 8, a * 2), polypTentMat));
}
const WAND_Y = 1.72;   // 吹泡圈相對於 creatureState.pos 的高度

function applyMorphTheme(idx) {
    const t = MORPH_THEMES[idx];
    bubbleUniforms.uFilmBias.value = t.filmBias;
    bubbleUniforms.uTint.value.setHex(t.filmTint);
    memUniforms.uFilmBias.value = t.filmBias + 0.2;
    // 軟糖的顏色：同一個色相，但飽和度拉高（軟糖本來就很鮮豔）
    const gumCol = new THREE.Color(t.core).lerp(new THREE.Color(t.coreDeep), 0.55);
    const gumDeep = new THREE.Color(t.coreDeep).multiplyScalar(0.62);
    for (const m of [bodyMat, gummyMat, lidGummyMat]) {
        m.uniforms.uCol.value.copy(gumCol);
        m.uniforms.uDeep.value.copy(gumDeep);
    }
    footMat.uniforms.uCol.value.copy(gumCol).lerp(new THREE.Color(t.coreDeep), 0.3);
    footMat.uniforms.uDeep.value.copy(gumDeep).multiplyScalar(0.85);
    heartUniforms.uCol.value.setHex(t.heart); heartUniforms.uGlow.value.setHex(t.heartGlow);
    heartHalo.material.color.setHex(t.heartGlow);
    for (const sp of heartTrail) sp.material.color.setHex(t.heartGlow);
    tentMat.uniforms.uBase.value.setHex(t.tent); tentMat.uniforms.uTip.value.setHex(t.tentTip);
    polypTentMat.uniforms.uBase.value.setHex(t.tent); polypTentMat.uniforms.uTip.value.setHex(t.tentTip);
    polypSkinMat.color.setHex(t.core); polypSkinMat.emissive.setHex(t.coreDeep);
    creatureCoreLight.color.setHex(t.light);
}

// ------------------------------------------------------------------
// 器官狀態與標示
// ------------------------------------------------------------------
const organState = { bpm: 0, digesting: 0, alert: false };
const ORGANS = [
    { key: 'membrane', name: '泡膜', en: 'Bubble membrane', fn: '會隨水流拉長、晃動；泡靈吐出的泡泡環會穿過泡膜飛出去，把軟糖包成小泡泡拉回來', dx: 170, dy: -70 },
    { key: 'mouth', name: '吹泡口', en: 'Blow-mouth', fn: '養分消化完，泡靈就往泡膜吹一口氣，整顆泡泡長大一圈', dx: -200, dy: 50 },
    { key: 'heart', name: '時之心', en: 'Chrono-heart', fn: '發光的小愛心在泡泡裡飄來飄去；結繭時繞著泡靈逆轉，把細胞倒帶回幼年', dx: 180, dy: 60 },
    { key: 'memory', name: '記憶泡泡', en: 'Memory bubbles', fn: '每輪迴一次多一顆，把前世的記憶帶到下一世', dx: -200, dy: -70 }
];
let organLabelsOn = true;
const labelLayer = document.getElementById('organLabels');
const lineLayer = document.getElementById('organLines');
for (const o of ORGANS) {
    o.el = document.createElement('div');
    o.el.className = 'organ-label';
    o.el.innerHTML = `<b>${o.name}</b><span>${o.en}</span><p>${o.fn}</p>`;
    labelLayer.appendChild(o.el);
    o.line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    lineLayer.appendChild(o.line);
    o.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    o.dot.setAttribute('r', '3');
    lineLayer.appendChild(o.dot);
}
const _lp = new THREE.Vector3();
function organAnchor(key, out) {
    if (key === 'heart') return heart.getWorldPosition(out);
    if (key === 'mouth') return mouthGroup.getWorldPosition(out);
    if (key === 'memory') {
        let best = memBubbles[0];
        for (const m of memBubbles) if (m.target && m.mesh.position.x < best.mesh.position.x) best = m;
        return best.mesh.getWorldPosition(out);
    }
    out.set(bub.R * 0.62, bub.R * 0.62, bub.R * 0.3);
    return bodyGroup.localToWorld(out);
}
function updateOrganLabels(stage) {
    const show = organLabelsOn && stage === 'MEDUSA' && !document.body.classList.contains('is-clean') && window.innerWidth >= 1100;
    labelLayer.style.opacity = show ? '1' : '0';
    lineLayer.style.opacity = show ? '1' : '0';
    if (!show) return;
    const paneW = (document.getElementById('paneHost').offsetWidth || 0) + 24;
    for (const o of ORGANS) {
        organAnchor(o.key, _lp).project(camera);
        if (_lp.z > 1) { o.el.style.display = 'none'; continue; }
        o.el.style.display = '';
        const x = (_lp.x * 0.5 + 0.5) * width;
        const y = (-_lp.y * 0.5 + 0.5) * height;
        const right = o.dx > 0;
        let lx = x + o.dx;
        const ly = y + o.dy;
        if (right) lx = Math.min(lx, width - paneW - 210);
        else lx = Math.max(lx, 220);
        o.el.style.transform = `translate(${right ? lx : lx - 200}px, ${ly - 10}px)`;
        o.el.style.textAlign = right ? 'left' : 'right';
        o.line.setAttribute('points', `${x},${y} ${lx + (right ? -18 : 18)},${ly} ${lx},${ly}`);
        o.dot.setAttribute('cx', x);
        o.dot.setAttribute('cy', y);
    }
}

// ------------------------------------------------------------------
// 每幀更新
// ------------------------------------------------------------------
const _invQ = new THREE.Quaternion();
const _vLocal = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _prevQ = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
let blinkTimer = 2.5, blink = 0, handAngle = 0, prevStage = 'MEDUSA';

function updateCreatureVisual(dt, time, stage, pulse, stare) {
    bodyGroup.visible = stage !== 'DEAD';
    bubbleUniforms.uTime.value = time;
    memUniforms.uTime.value = time;

    tentMat.uniforms.uTime.value = time;
    polypTentMat.uniforms.uTime.value = time;

    // 從水螅「吹出來」後斷開那一瞬間：頸部斷掉，泡泡大晃一下
    if (prevStage === 'POLYP' && stage === 'MEDUSA') { exciteWobble(0.14); bub.vR += 3; }
    if (prevStage !== 'CYST' && stage === 'CYST') exciteWobble(0.12);
    if (prevStage === 'POLYP' && stage === 'MEDUSA') birth = 1;
    prevStage = stage;
    if (stage === 'POLYP') growth = creatureState.polypTimer;
    else if (stage === 'MEDUSA') { birth = Math.min(1, birth + dt / 5.0); growth = birth; }
    else growth = 1;

    // ---- 速度、加速度轉成身體座標 ----
    _invQ.copy(creatureGroup.quaternion).invert();
    _vLocal.copy(creatureState.vel).applyQuaternion(_invQ);
    _acc.copy(creatureState.vel).sub(bub.prevVel).applyQuaternion(_invQ);
    bub.prevVel.copy(creatureState.vel);
    const accMag = _acc.length();
    if (accMag > 0.02) exciteWobble(Math.min(0.06, accMag * 0.6));

    // ---- 半徑彈簧：吹泡泡式成長 ----
    let targetR;
    if (stage === 'CYST') targetR = CORE_R * CORE_VIS + 0.6;
    else {
        // 第一步：先吹出泡泡
        const b = THREE.MathUtils.smoothstep(growth, 0.02, 0.3);
        targetR = 0.3 + b * (shellTargetRadius() - 0.3);
    }
    const growingBubble = growth < 0.32;
    const k = growingBubble ? 120 : 55, c = growingBubble ? 14 : 5.5;
    bub.vR += ((targetR - bub.R) * k - bub.vR * c) * dt;
    bub.R += bub.vR * dt;
    bub.R = Math.max(0.2, bub.R);
    bubbleUniforms.uRadius.value = bub.R;

    // ---- 拉長彈簧：往運動方向拉長，停下來會彈回、晃一晃 ----
    const sTarget = _tmp.copy(_vLocal).multiplyScalar(stage === 'MEDUSA' ? 1.1 : 0);
    if (sTarget.length() > 0.38) sTarget.setLength(0.38);
    bub.vStretch.addScaledVector(_tmp.sub(bub.stretch).multiplyScalar(38), dt);
    bub.vStretch.multiplyScalar(Math.exp(-dt * 5.5));
    bub.stretch.addScaledVector(bub.vStretch, dt);
    const sLen = bub.stretch.length();
    if (sLen > 1e-4) bubbleUniforms.uStretchDir.value.copy(bub.stretch).divideScalar(sLen);
    bubbleUniforms.uStretch.value = Math.min(0.45, sLen);

    // ---- 晃動模態：衰減的振盪 ----
    for (let i = 0; i < 6; i++) {
        bub.modeAmp[i] *= Math.exp(-dt * 1.6);
        bub.modes[i] = bub.modeAmp[i] * Math.sin(bub.modeFreq[i] * time + bub.modePhase[i]);
    }
    // 漂浮時本來就有一點點呼吸般的起伏
    const breathe = 0.012 * Math.sin(time * 1.3);
    bubbleUniforms.uModesA.value.set(bub.modes[0] + breathe, bub.modes[1], bub.modes[2]);
    bubbleUniforms.uModesB.value.set(bub.modes[3], bub.modes[4], bub.modes[5]);
    bubbleUniforms.uThin.value = THREE.MathUtils.lerp(bubbleUniforms.uThin.value, Math.min(1, sLen * 2), 0.1);

    // ---- 吹泡頸部（只在水螅期） ----
    const neckTarget = stage === 'POLYP' ? 1 - THREE.MathUtils.smoothstep(creatureState.polypTimer, 0.93, 1.0) : 0;
    bub.neck = THREE.MathUtils.lerp(bub.neck, neckTarget, 1 - Math.exp(-dt * (neckTarget > bub.neck ? 6 : 18)));
    bubbleUniforms.uNeck.value = bub.neck;

    // 泡泡中心的位置：水螅期要讓泡泡底部黏在吹泡圈上
    const sc = creatureGroup.scale.x || 1;
    let bodyY = 0;
    if (stage === 'POLYP') bodyY = WAND_Y / sc + bub.R * (1 + 0.5 * bub.neck) * 0.98;
    bodyGroup.position.y = THREE.MathUtils.lerp(bodyGroup.position.y, bodyY, stage === 'POLYP' ? 0.5 : 1 - Math.exp(-dt * 2.5));

    // ---- 結晶化（囊胞） ----
    bubbleUniforms.uFrost.value = THREE.MathUtils.lerp(bubbleUniforms.uFrost.value, stage === 'CYST' ? 1 : 0, 1 - Math.exp(-dt * 3));

    // ---- 泡靈本體：在泡泡裡有慣性地晃 ----
    const coreTarget = _tmp.copy(_acc).multiplyScalar(-6).clampLength(0, bub.R - CORE_R);
    bub.vCore.addScaledVector(coreTarget.sub(bub.coreOff).multiplyScalar(30), dt);
    bub.vCore.multiplyScalar(Math.exp(-dt * 4));
    bub.coreOff.addScaledVector(bub.vCore, dt);
    bub.coreOff.clampLength(0, Math.max(0, bub.R - CORE_R * CORE_VIS - 0.3));
    coreGroup.position.copy(bub.coreOff);
    coreGroup.position.y += Math.sin(time * 1.3) * 0.12;
    let coreScale = 1;
    if (stage === 'CYST') coreScale = 0.68;   // 縮成一團
    coreScale = Math.max(0.001, coreScale * Math.min(1, (bub.R - 0.3) / (CORE_R * CORE_VIS)));
    coreGroup.scale.setScalar(THREE.MathUtils.lerp(coreGroup.scale.x, coreScale * CORE_VIS, 0.25));
    coreGroup.rotation.z = Math.sin(time * 0.9) * 0.06 - bub.coreOff.x * 0.05;

    // 吹氣：身體先吸氣壓扁、再「呼」地拉長，嘴巴冒出一個小 o
    bub.puff = Math.max(0, bub.puff - dt * 2.0);
    const pf = Math.min(1, bub.puff);
    const inhale = pf > 0.6 ? Math.sin((1 - pf) / 0.4 * Math.PI * 0.5) : 0;
    const exhale = pf <= 0.6 ? Math.sin(pf / 0.6 * Math.PI) : 0;
    bodyRig.scale.set(1 + inhale * 0.14 - exhale * 0.06, 1 - inhale * 0.12 + exhale * 0.08, 1 + inhale * 0.14 - exhale * 0.06);

    // ---- 分段長出來 ----
    const gBody = growPart(0.3, 0.55);          // 身體像泡泡一樣脹出來
    const gShape = THREE.MathUtils.smoothstep(growth, 0.42, 0.62);   // 圓球 → 梨形
    const gNeck = growPart(0.48, 0.66);         // 脖子像芽一樣往上冒
    const gEyes = growPart(0.6, 0.8);           // 眼睛像花苞一樣冒出來
    const gFeet = growPart(0.76, 0.96);         // 最後長出腳丫
    bodyJiggle = Math.max(0, bodyJiggle - dt * 2.5);
    const jig = Math.sin(time * 22) * 0.06 * bodyJiggle;
    bodyMesh.scale.set(Math.max(0.001, gBody) * (1 + jig), Math.max(0.001, gBody) * (1 - jig), Math.max(0.001, gBody) * 0.92 * (1 + jig));
    bodyMat.uniforms.uShape.value = gShape;
    neckPivot.scale.set(Math.max(0.001, Math.min(1.2, gNeck * 1.1 - 0.1) * 0.9 + 0.1 * gNeck), Math.max(0.001, gNeck), Math.max(0.001, gNeck));
    eyeCluster.scale.setScalar(Math.max(0.001, gEyes));
    for (const l of legs) l.pivot.scale.setScalar(Math.max(0.001, gFeet));
    mouthGroup.visible = gBody > 0.5;

    // 小黑腳：游動時亂踢，停下來輕輕晃
    const spd = creatureState.vel.length();
    for (const l of legs) {
        const kick = Math.min(1, spd * 6);
        l.pivot.rotation.x = Math.sin(time * 13 + (l.side > 0 ? Math.PI : 0)) * 0.55 * kick + Math.sin(time * 1.6 + l.side) * 0.08;
        l.pivot.rotation.z = l.side * (0.08 + 0.05 * Math.sin(time * 2 + l.side));
    }
    // 兩顆大眼睛像大頭娃娃一樣慢半拍地晃
    eyeCluster.rotation.z = -bub.vCore.x * 0.06 + Math.sin(time * 1.4) * 0.05;
    eyeCluster.rotation.x = bub.vCore.z * 0.05 + Math.sin(time * 1.1) * 0.03;
    // 有軟糖進來時，泡靈轉頭看著它準備張嘴
    const idleYaw = Math.sin(time * 0.6) * 0.12;
    const lookYaw = Math.atan2(eatLook.x - coreGroup.position.x, eatLook.z - coreGroup.position.z);
    const yawT = eatLookOn > 0 ? THREE.MathUtils.clamp(lookYaw, -1.4, 1.4) : idleYaw;
    toon.rotation.y += (yawT - toon.rotation.y) * (1 - Math.exp(-dt * 5));

    // ---- 時之心：在泡泡裡飄來飄去；結繭時繞著泡靈逆向快轉（倒帶） ----
    const rewinding = stage === 'CYST';
    heartUniforms.uTime.value = time;
    heartUniforms.uBeat.value = pulse;
    heartUniforms.uRewind.value = THREE.MathUtils.lerp(heartUniforms.uRewind.value, rewinding ? 1 : 0, 0.08);
    const coreSize = CORE_R * CORE_VIS;
    const roam = Math.max(0.6, bub.R - 1.1);
    const hr = Math.min(roam, Math.max(coreSize * 0.95, (coreSize + bub.R) * 0.5 + 0.4));
    const heartR = 0.75;
    const wall = Math.max(0.4, bub.R - heartR - 0.15);
    if (rewinding) {
        heartSpin -= dt * 4.2;
        _tmp.set(Math.cos(heartSpin) * wall * 0.85, Math.sin(time * 3.0) * 0.4, Math.sin(heartSpin) * wall * 0.85);
        heartPos.lerp(_tmp, 1 - Math.exp(-dt * 8));
    } else {
        // 隨水流飄：一點點亂流 + 泡泡被甩動時的慣性
        heartVel.x += Math.sin(time * 0.71 + 1.3) * dt * 0.9;
        heartVel.y += Math.sin(time * 0.53) * dt * 0.7 + 0.15 * dt;
        heartVel.z += Math.cos(time * 0.61) * dt * 0.9;
        heartVel.addScaledVector(_acc, -14);
        const hsp = heartVel.length();
        if (hsp < 0.05) heartVel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).setLength(1.5);
        else if (hsp < 1.3) heartVel.multiplyScalar(1 + dt * 0.9);
        else if (hsp > 4.5) heartVel.setLength(4.5);
        heartPos.addScaledVector(heartVel, dt);

        // 撞到泡膜就反彈（泡膜跟著輕輕一震）
        const d = heartPos.length();
        if (d > wall) {
            _hn.copy(heartPos).divideScalar(d);
            const vn = heartVel.dot(_hn);
            if (vn > 0) {
                heartVel.addScaledVector(_hn, -1.85 * vn);
                exciteWobble(Math.min(0.045, 0.01 + vn * 0.012));
                heartSquash = 1;
            }
            heartPos.setLength(wall);
        }
        // 撞到軟糖泡靈也會彈開（軟糖抖一下）
        const cs = coreGroup.scale.x;
        const blobs = [[0, -1.4, 0, 1.9], [0.25, 2.0, 0.3, 1.85]];
        for (const bl of blobs) {
            _tmp.set(bl[0] * cs, bl[1] * cs, bl[2] * cs).add(coreGroup.position);
            _hn.subVectors(heartPos, _tmp);
            const dist = _hn.length();
            const minD = bl[3] * cs + heartR;
            if (cs > 0.2 && gBody > 0.5 && dist < minD && dist > 1e-4) {
                _hn.divideScalar(dist);
                const vn = heartVel.dot(_hn);
                if (vn < 0) {
                    heartVel.addScaledVector(_hn, -1.6 * vn);
                    heartSquash = 1;
                    bodyJiggle = Math.max(bodyJiggle, Math.min(1, -vn * 0.4));
                }
                heartPos.copy(_tmp).addScaledVector(_hn, minD);
            }
        }
    }
    heartGroup.position.copy(heartPos);
    heartGroup.rotation.y = rewinding ? heartSpin * 3 : Math.sin(time * 0.8) * 0.7;
    heartGroup.rotation.z = Math.sin(time * 1.2) * 0.22;
    heartGroup.rotation.x = Math.sin(time * 0.9) * 0.15;
    const beat = 1 + pulse * 0.2;
    const gHeart = growPart(0.34, 0.5);
    heartSquash = Math.max(0, heartSquash - dt * 4);
    const sq = Math.sin(heartSquash * Math.PI) * 0.22;
    const hs = 0.55 * Math.max(0.001, gHeart);
    heart.scale.set(hs * beat * (1 + sq), hs * beat * (1 - sq), hs);
    handAngle += dt * (rewinding ? 14 : -1.2);
    handPivot.rotation.z = handAngle;
    heartHalo.scale.setScalar(3.4 * Math.max(0.001, gHeart) * (1 + pulse * 0.25));
    heartHalo.material.opacity = 0.35 + pulse * 0.3 + heartUniforms.uRewind.value * 0.4;
    heartHistory.unshift(heartGroup.position.clone());
    if (heartHistory.length > HEART_TRAIL * 2) heartHistory.length = HEART_TRAIL * 2;
    heartTrail.forEach((sp, i) => {
        const p = heartHistory[Math.min(heartHistory.length - 1, i * 2 + 1)];
        sp.position.copy(p);
        const f = 1 - i / HEART_TRAIL;
        sp.scale.setScalar(0.9 * f * Math.max(0.001, gHeart));
        sp.material.opacity = 0.32 * f * f;
    });
    const rate = 3.0 + (1 - creatureState.maturity) * 1.6 + creatureState.stress * 0.03;
    organState.bpm = Math.round(rate / (Math.PI * 2) * 60);

    // ---- 記憶泡泡 ----
    const orbit = (CORE_R * CORE_VIS + bub.R) * 0.5 + 0.2;
    for (const m of memBubbles) {
        m.pop = Math.max(0, m.pop - dt * 1.5);
        const a = m.phase + time * m.speed;
        m.mesh.position.set(Math.cos(a) * orbit, Math.sin(a * 1.3) * orbit * 0.35 + Math.sin(a) * m.tilt * orbit * 0.4, Math.sin(a) * orbit);
        const tgt = m.target * m.size * (1 + Math.sin(m.pop * Math.PI) * 0.9) * THREE.MathUtils.smoothstep(growth, 0.3, 0.5);
        m.mesh.scale.setScalar(THREE.MathUtils.lerp(m.mesh.scale.x, Math.max(0.001, tgt), 1 - Math.exp(-dt * 8)));
    }

    // ---- 泡泡環：瞄準 → 吐出 → 飛過去 → 收成小泡泡包住軟糖 → 拉回來 → 併進大泡泡 ----
    ringMat.uniforms.uTime.value = time;
    if (grab.active && stage !== 'MEDUSA') releaseGrab();
    spitOpen = Math.max(0, spitOpen - dt * 2.5);
    if (grab.active && grab.sp) {
        const sp = grab.sp;
        const center = creatureState.pos;
        if (grab.phase === 'aim') {
            // 1. 轉頭看著軟糖，深吸一口氣
            grab.t += dt;
            eatLook.copy(sp.mesh.position); bodyGroup.worldToLocal(eatLook); eatLookOn = 1;
            spitOpen = Math.max(spitOpen, Math.min(1, grab.t / 0.35) * 0.6);
            if (grab.t > 0.4) {
                // 2. 「呼」地吐出泡泡環
                mouthGroup.getWorldPosition(grab.from);
                grab.pos.copy(grab.from);
                grab.phase = 'fly'; grab.t = 0; grab.s = 0;
                bub.puff = 1; mouthOpen = 1; spitOpen = 1;
                ringMesh.visible = true;
                ringMat.uniforms.uFade.value = 1;
                exciteWobble(0.02);
                playEldritchSFX('dash');
            }
        } else if (grab.phase === 'fly') {
            // 3. 泡泡環邊轉邊飛過去，越飛越大
            eatLook.copy(sp.mesh.position); bodyGroup.worldToLocal(eatLook); eatLookOn = 1;
            const dist = Math.max(0.5, grab.from.distanceTo(sp.mesh.position));
            grab.s = Math.min(1, grab.s + dt * (9.0 / dist));
            const e = 1 - Math.pow(1 - grab.s, 2.2);
            grab.pos.lerpVectors(grab.from, sp.mesh.position, e);
            // 環稍微上下飄一點，比較像在水裡游
            grab.pos.y += Math.sin(grab.s * Math.PI) * 0.8;
            grab.ringR = THREE.MathUtils.lerp(0.55, grab.capR * 1.45, e);
            ringMesh.position.copy(grab.pos);
            _ringTmp.copy(sp.mesh.position);
            if (_ringTmp.distanceToSquared(grab.pos) > 1e-4) ringMesh.lookAt(_ringTmp);
            grab.spin += dt * 5;
            ringMesh.rotateZ(grab.spin);
            const wob = 1 + Math.sin(time * 14) * 0.05;
            ringMesh.scale.set(grab.ringR * wob, grab.ringR / wob, grab.ringR * (0.9 + 0.1 * wob));
            // 穿過大泡泡的膜時，泡膜被撐一下
            if (!grab.crossed && grab.pos.distanceTo(center) > bubbleWorldRadius()) { grab.crossed = true; exciteWobble(0.05); }
            if (grab.s >= 1) { grab.phase = 'wrap'; grab.t = 0; }
        } else if (grab.phase === 'wrap') {
            // 4. 泡泡環收攏成一顆小泡泡，把軟糖整顆包起來
            grab.t += dt;
            const k = Math.min(1, grab.t / 0.45);
            grab.pos.copy(sp.mesh.position);
            ringMesh.position.copy(grab.pos);
            ringMesh.scale.set(grab.ringR * (1 - k * 0.7), grab.ringR * (1 - k * 0.7), grab.ringR * (1 + k * 1.2));
            ringMat.uniforms.uFade.value = 1 - k;
            capMesh.visible = true;
            capMesh.position.copy(grab.pos);
            capMesh.scale.setScalar(Math.max(0.001, grab.capR * easeOutBack(k)));
            const sq = Math.sin(k * Math.PI) * 0.12;
            sp.mesh.scale.set(sp.baseScale * (1 - sq), sp.baseScale * (1 + sq), sp.baseScale * (1 - sq));
            if (k >= 1) { ringMesh.visible = false; grab.phase = 'reel'; grab.t = 0; grab.vel.set(0, 0, 0); }
        } else if (grab.phase === 'reel') {
            // 5. 把包著軟糖的小泡泡拉回來，越拉越快
            grab.t += dt;
            _ringTmp.copy(center).sub(grab.pos);
            const d = _ringTmp.length();
            _ringTmp.normalize();
            grab.vel.addScaledVector(_ringTmp, (6 + grab.t * 26) * dt);
            grab.vel.multiplyScalar(Math.exp(-dt * 1.5));
            grab.pos.addScaledVector(grab.vel, dt);
            capMesh.position.copy(grab.pos);
            const wob = 1 + Math.sin(time * 16) * 0.05;
            capMesh.scale.set(grab.capR * wob, grab.capR / wob, grab.capR * wob);
            sp.mesh.position.copy(grab.pos);
            sp.mesh.rotation.y += dt * 2;
            eatLook.copy(grab.pos); bodyGroup.worldToLocal(eatLook); eatLookOn = 1;
            // 6. 碰到大泡泡就融進去，軟糖連同小泡泡一起進到泡泡裡
            if (d < bubbleWorldRadius() + grab.capR * 0.3) {
                feedStomach(0.09, grab.pos, sp.flavor);
                sp.eaten = true;
                capMesh.visible = false;
                exciteWobble(0.08);
                bub.vR += 1.5;
                grab.sp = null; grab.phase = 'idle'; grab.active = false;
            }
        }
    }
    // 這一版不用黏液手：偽足全部收起來
    for (let k = 0; k < 3; k++) {
        bubbleUniforms.uPods.value[k].set(0, 1, 0, 0);
        bubbleUniforms.uPodsB.value[k].set(0.3, 0.5, 0, 0.3);
        bubbleUniforms.uPodsC.value[k].set(0, 1, 0, 0);
    }

    // ---- 泡泡裡的軟糖：飄到泡靈嘴邊 → 張嘴吃掉 → 消化 → 吹大泡泡 ----
    const mouthLocal = mouthGroup.getWorldPosition(new THREE.Vector3());
    bodyGroup.worldToLocal(mouthLocal);
    let wantOpen = 0;
    eatLookOn = Math.max(0, eatLookOn - dt * 1.5);
    for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i];
        if (f.phase === 'swim') {
            f.t += dt;
            f.p.lerp(mouthLocal, 1 - Math.exp(-dt * (1.2 + f.t * 1.5)));
            f.p.clampLength(0, Math.max(0.1, bub.R * 0.92));
            const dm = f.p.distanceTo(mouthLocal);
            eatLook.copy(f.p); eatLookOn = 1;
            if (dm < 4.5) wantOpen = Math.max(wantOpen, 1 - dm / 4.5 + 0.35);
            if (dm < 0.9 || f.t > 3.0) {
                f.phase = 'pop'; f.t = 0;          // 小泡在嘴邊「啵」一聲破掉
            }
        } else if (f.phase === 'pop') {
            f.t += dt;
            f.p.lerp(mouthLocal, 1 - Math.exp(-dt * 10));
            wantOpen = 1;
            if (f.t > 0.22) {
                f.phase = 'chew'; f.t = 0;
                chomp = 1;
                happy = 0.6;
                bodyJiggle = Math.max(bodyJiggle, 0.7);
            }
        } else {
            f.t += dt;
            if (f.t > 1.4) {
                food.splice(i, 1);
                // （消化完）
                if (stage === 'MEDUSA') blowPuff(f.amount);
            }
        }
    }
    eatOpen += (Math.min(1, wantOpen) - eatOpen) * (1 - Math.exp(-dt * 8));
    chomp = Math.max(0, chomp - dt * 4);
    for (let i = 0; i < MAX_FOOD; i++) {
        const m = miniBears[i];
        const f = food[i];
        const v = vesicles[i];
        if (!f || (f.phase !== 'swim' && f.phase !== 'pop')) { m.visible = false; v.visible = false; continue; }
        m.visible = true;
        m.material = candyMats[f.flavor];
        m.position.copy(f.p);
        f.rot.x += dt * 1.3; f.rot.y += dt * 1.7;
        m.rotation.set(f.rot.x, f.rot.y, f.rot.z);
        const dm = f.p.distanceTo(mouthLocal);
        m.scale.setScalar(0.62 * Math.max(0.35, Math.min(1, dm / 2.5)));
        // 吞噬小泡：包著軟糖一起漂；到嘴邊時脹大一下然後消失
        v.visible = true;
        v.position.copy(f.p);
        if (f.phase === 'pop') {
            const k = f.t / 0.22;
            v.scale.setScalar(0.95 * (1 + k * 0.6));
            if (k > 0.85) v.visible = false;
        } else {
            v.scale.setScalar(0.95 + Math.sin(time * 5 + i) * 0.04);
        }
    }
    organState.digesting = food.length;

    // ---- 尾巴：掛在泡泡底部，被水流往後拖 ----
    const bottom = -bub.R * (1 + 0.5 * bub.neck);
    tailGroup.position.set(0, bottom * 0.97, 0);
    tailGroup.scale.setScalar(stage === 'MEDUSA' ? THREE.MathUtils.lerp(tailGroup.scale.x, 1, 0.05) : THREE.MathUtils.lerp(tailGroup.scale.x, 0.001, 0.15));
    const drag = _tmp.copy(_vLocal).multiplyScalar(-7).clampLength(0, 3.5);
    tentMat.uniforms.uDrag.value.lerp(drag, 1 - Math.exp(-dt * 4));
    if (!(tentMat.uniforms.uDrag.value.length() <= 3.5)) tentMat.uniforms.uDrag.value.set(0, 0, 0);

    // ---- 警戒 ----
    const alert = predators3D.length > 0 || creatureState.stress > 40;
    organState.alert = alert;
    const flash = alert ? 0.35 + 0.35 * (Math.sin(time * 12) > 0 ? 1 : 0) : 0;
    bubbleUniforms.uAlert.value = THREE.MathUtils.lerp(bubbleUniforms.uAlert.value, flash, 0.3);

    // ---- 眼睛：眼皮眨眼（兩顆眼睛差一點點時間，偶爾連眨兩下）----
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
        eyes[0].blink = 1;
        eyes[1].delay = 0.05;
        const doubleBlink = Math.random() < 0.3;
        blinkTimer = doubleBlink ? 0.28 : 2.0 + Math.random() * 3.5;
    }
    happy = Math.max(0, happy - dt);
    const speed = creatureState.vel.length();
    eyes.forEach((e, i) => {
        if (e.delay >= 0) { e.delay -= dt; if (e.delay < 0) e.blink = 1; }
        e.blink = Math.max(0, e.blink - dt * 6.5);
        let shut = Math.sin(Math.min(1, e.blink) * Math.PI);       // 0 = 張開, 1 = 閉上
        if (stage === 'CYST' || growth < 0.84) shut = 1;           // 繭裡、剛冒芽時眼睛閉著，長好才睜開
        else if (stare) shut = 0;                                   // 瞪大不眨眼
        else if (bub.puff > 0.2) shut = Math.max(shut, 0.55);       // 吹氣時用力瞇眼
        else if (alert) shut = Math.min(shut, 0.0);
        else shut = Math.max(shut, 0.12 + 0.04 * Math.sin(time * 0.7 + i));   // 平常眼皮微微垂著，比較呆萌
        const lidTarget = THREE.MathUtils.lerp(stare ? EYE_OPEN - 0.15 : EYE_OPEN, EYE_SHUT, shut);
        e.lidPivot.rotation.x = THREE.MathUtils.lerp(e.lidPivot.rotation.x, lidTarget, 1 - Math.exp(-dt * 40));

        e.ball.visible = !stare;
        e.slit.visible = stare;
        const active = stare ? e.slit : e.ball;
        _prevQ.copy(e.q);
        active.lookAt(_gaze);
        e.q.copy(_prevQ).slerp(active.quaternion, 1 - Math.exp(-dt * (stare ? 12 : 5 + i * 2)));
        active.quaternion.copy(e.q);
        if (!stare && speed > 0.05) active.rotateZ(Math.sin(time * 16 + e.wob) * Math.min(0.3, speed * 0.35));
        const big = stare ? 1.15 : (alert ? 1.08 : 1.0);
        const squish = happy > 0 ? Math.sin(happy * Math.PI * 3) * 0.1 * happy : 0;
        const sx = THREE.MathUtils.lerp(e.socket.scale.x, big * (1 + squish), 0.15);
        const sy = THREE.MathUtils.lerp(e.socket.scale.y, big * (1 - squish), 0.15);
        e.socket.scale.set(sx, sy, sx);
    });

    // ---- 吹泡口 ----
    mouthOpen = Math.max(0, mouthOpen - dt * 2.0);
    const o = Math.max(Math.sin(Math.min(1, mouthOpen) * Math.PI), stare ? 0.6 : 0, eatOpen * 1.7 * (1 - chomp * 0.85), spitOpen * 1.5);
    mouthGroup.scale.set(Math.max(0.001, o), Math.max(0.001, o * (1 + eatOpen * 0.5)), Math.max(0.001, o));

    updateOrganLabels(stage);
}

// ------------------------------------------------------------------
// 6. 深海環境 Environment
// ------------------------------------------------------------------
const SEAFLOOR_Y = -28;

const floorGeo = new THREE.PlaneGeometry(420, 420, 180, 180);
floorGeo.rotateX(-Math.PI / 2);
{
    const pa = floorGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), z = pa.getZ(i);
        const d = Math.hypot(x, z);
        const dunes = Math.sin(x * 0.05 + Math.sin(z * 0.03) * 2) * 1.6 + Math.sin(z * 0.11 + x * 0.02) * 0.6;
        const grain = Math.sin(x * 0.9) * Math.sin(z * 0.8) * 0.12;
        const bowl = d > 60 ? Math.pow((d - 60) * 0.045, 1.4) : 0;   // 遠處只微微翹起，自然消失在霧裡
        pa.setY(i, dunes + grain + bowl);
    }
    floorGeo.computeVertexNormals();
}
// 海床：薰衣草色的糖砂，上面有水面折射下來的流動光紋（caustics）
const floorMat = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: scene.fog.color }, uFogDensity: { value: scene.fog.density },
        uSandA: { value: new THREE.Color(0x2a2262) }, uSandB: { value: new THREE.Color(0x4a377c) },
        uCaustic: { value: new THREE.Color(0xffd2ec) }
    },
    vertexShader: `
        varying vec3 vWorld; varying vec3 vN; varying float vViewZ;
        void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 mv = viewMatrix * w;
            vViewZ = mv.z;
            gl_Position = projectionMatrix * mv;
        }`,
    fragmentShader: `
        uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity;
        uniform vec3 uSandA; uniform vec3 uSandB; uniform vec3 uCaustic;
        varying vec3 vWorld; varying vec3 vN; varying float vViewZ;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        // 水面折射光紋
        float caustic(vec2 uv, float t) {
            vec2 p = mod(uv * 6.2831, 6.2831) - 250.0;
            vec2 i = p;
            float c = 1.0;
            float inten = 0.005;
            for (int n = 0; n < 4; n++) {
                float tt = t * (1.0 - (3.5 / float(n + 1)));
                i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
                c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
            }
            c /= 4.0;
            c = 1.17 - pow(c, 1.4);
            return clamp(pow(abs(c), 8.0), 0.0, 1.0);
        }
        void main() {
            vec3 n = normalize(vN);
            float grain = vnoise(vWorld.xz * 0.9) * 0.6 + vnoise(vWorld.xz * 0.08) * 0.4;
            vec3 sand = mix(uSandA, uSandB, grain);
            float light = clamp(dot(n, normalize(vec3(0.3, 1.0, 0.2))), 0.0, 1.0) * 0.55 + 0.45;
            vec3 col = sand * light;
            // 光紋：兩層錯開，像真的水面在晃
            float c1 = caustic(vWorld.xz * 0.018, uTime * 0.55);
            float c2 = caustic(vWorld.xz * 0.027 + 0.37, uTime * 0.42 + 1.7);
            col += uCaustic * (c1 * 0.5 + c2 * 0.32) * smoothstep(0.3, 0.9, n.y);
            // 糖砂上一點一點的閃光
            float sp = step(0.985, hash(floor(vWorld.xz * 3.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(vWorld.xz * 3.0)) * 40.0));
            col += vec3(1.0, 0.9, 0.97) * sp * 0.35;
            float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
            gl_FragColor = vec4(mix(col, uFogColor, fogF), 1.0);
        }`
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.position.y = SEAFLOOR_Y;
scene.add(floor);

// 海床岩塊 Rocks
// 海床上的大顆軟糖石（顏色比較深、比較厚）
const rockMats = [
    makeGummyMat(0x7a4cc9, 0x1c0c40, false, 2.2),
    makeGummyMat(0xc9408a, 0x3a0820, false, 2.2),
    makeGummyMat(0x2f9a80, 0x062a22, false, 2.2),
    makeGummyMat(0xd08a2a, 0x3a1c00, false, 2.2)
];
for (let i = 0; i < 26; i++) {
    const g = new THREE.SphereGeometry(1, 40, 28);   // 有索引的平滑球體 → 法線平滑，軟糖質感才出得來
    const pa = g.attributes.position;
    const sx = 0.8 + Math.random() * 0.5, sy = 0.4 + Math.random() * 0.4, ph = Math.random() * 10;
    for (let k = 0; k < pa.count; k++) { const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k); const n = 1 + 0.18 * Math.sin(x * 3 + ph) * Math.sin(y * 4 + z * 2) + 0.06 * Math.sin(x * 9 + z * 7); pa.setXYZ(k, x * sx * n, y * sy * n, z * n); }
    g.computeVertexNormals();
    const rock = new THREE.Mesh(g, rockMats[i % rockMats.length]);
    rock.renderOrder = 1;
    const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 90;
    const s = 1.5 + Math.random() * 5;
    rock.scale.set(s, s, s);
    rock.position.set(Math.cos(a) * d, SEAFLOOR_Y + s * 0.2, Math.sin(a) * d - 20);
    rock.rotation.y = Math.random() * Math.PI;
    scene.add(rock);
}

// 軟糖海草：雙色的酸味軟糖蟲，一叢一叢從糖砂裡長出來，隨水流擺動
const wormMats = CANDY_FLAVORS.map(f => makeGummyMat(f.col, f.deep, false, 0.85));
const worms = [];
function makeWormHalf(len, bendX, mat) {
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(bendX * 0.6, len * 0.5, bendX * 0.3), new THREE.Vector3(bendX * 0.2, len, 0)
    ]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.62, 16, false), mat);
    m.renderOrder = 1;
    return m;
}
for (let c = 0; c < 20; c++) {
    const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 70;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d * 0.7 - 12;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < count; k++) {
        const h = 5 + Math.random() * 7;
        const fa = Math.floor(Math.random() * CANDY_FLAVORS.length);
        const fb = (fa + 1 + Math.floor(Math.random() * 3)) % CANDY_FLAVORS.length;
        const base = new THREE.Group();
        base.position.set(cx + (Math.random() - 0.5) * 3, SEAFLOOR_Y - 0.6, cz + (Math.random() - 0.5) * 3);
        base.rotation.y = Math.random() * Math.PI * 2;
        const bend = (Math.random() - 0.5) * 3.2;
        base.add(makeWormHalf(h * 0.5, bend, wormMats[fa]));
        const mid = new THREE.Group();
        mid.position.set(bend * 0.2, h * 0.5, 0);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), wormMats[fb]);
        cap.position.set(-bend * 0.1, h * 0.5, 0);
        cap.renderOrder = 1;
        mid.add(makeWormHalf(h * 0.5, -bend, wormMats[fb]), cap);
        base.add(mid);
        scene.add(base);
        worms.push({ base, mid, phase: Math.random() * 6.28, amp: 0.08 + Math.random() * 0.08 });
    }
}

// 桃子圈軟糖：散落在海床上
const ringCandyMats = [makeGummyMat(0xff9a5a, 0x8a3a10, false, 1.0), makeGummyMat(0xff7fae, 0x8a1a4a, false, 1.0), makeGummyMat(0xffd25a, 0x8a5a00, false, 1.0)];
for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 75;
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.3 + Math.random() * 0.6, 0.55, 20, 40), ringCandyMats[i % 3]);
    r.position.set(Math.cos(a) * d, SEAFLOOR_Y + 0.25, Math.sin(a) * d * 0.7 - 12);
    r.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.5, 0, Math.random() * Math.PI);
    r.renderOrder = 1;
    scene.add(r);
}

// 泡泡泉：海床幾個地方會一串一串冒出彩虹小泡泡
const VENTS = [[-34, -18], [26, -26], [-12, 12], [44, 6], [6, -44]];
const ventBubbles = [];
const ventGeo = new THREE.IcosahedronGeometry(1, 8);
for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(ventGeo, memMat);
    m.renderOrder = 6;
    scene.add(m);
    const v = VENTS[i % VENTS.length];
    ventBubbles.push({ mesh: m, vent: v, y: SEAFLOOR_Y + Math.random() * 60, speed: 2.5 + Math.random() * 3, size: 0.15 + Math.random() * 0.45, phase: Math.random() * 6.28 });
}

// 上方天光光束 Light shafts
const shaftTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 256, 0, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
})();
const shafts = [];
for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
        new THREE.CylinderGeometry(3 + i * 1.2, 14 + i * 4, 140, 24, 1, true),
        new THREE.ShaderMaterial({
            uniforms: { uMap: { value: shaftTex }, uOpacity: { value: 0.08 }, uColor: { value: new THREE.Color(0xffc8e6) } },
            vertexShader: `varying vec2 vUv; varying float vFacing;
                void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
                gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; uniform vec3 uColor;
                varying vec2 vUv; varying float vFacing;
                void main() { float a = texture2D(uMap, vUv).r * pow(vFacing, 3.0) * uOpacity;
                gl_FragColor = vec4(uColor * a, 1.0); }`,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
    );
    m.position.set(-40 + i * 28, 40, -30 + (i % 2) * 22);
    m.rotation.z = 0.12 - i * 0.05;
    scene.add(m);
    shafts.push({ mesh: m, phase: i * 1.7 });
}

// 海雪 Marine snow
const SNOW = 1700;
const snowPos = new Float32Array(SNOW * 3);
const snowSpd = new Float32Array(SNOW);
for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 220;
    snowPos[i * 3 + 1] = SEAFLOOR_Y + Math.random() * 100;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * 180 - 10;
    snowSpd[i] = 0.4 + Math.random() * 1.2;
}
// 糖粉閃光：粉紅、薄荷、檸檬、薰衣草色的小亮點慢慢飄落，會一閃一閃
const snowCol = new Float32Array(SNOW * 3);
const snowBase = new Float32Array(SNOW * 3);
const SUGAR = [0xffb6d6, 0xa6f0dc, 0xfff0a0, 0xd8c8ff, 0xffffff].map(h => new THREE.Color(h));
for (let i = 0; i < SNOW; i++) {
    const c = SUGAR[i % SUGAR.length];
    snowBase[i * 3] = c.r; snowBase[i * 3 + 1] = c.g; snowBase[i * 3 + 2] = c.b;
}
snowCol.set(snowBase);
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
snowGeo.setAttribute('color', new THREE.BufferAttribute(snowCol, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    size: 0.38, map: softTex, vertexColors: true, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false
}));
snow.frustumCulled = false;
scene.add(snow);

// 發光孢子 Spores（吃了會長大）
const spores = [];   // 每一顆都是小熊軟糖

function spawnSpores3D(count = 16, nearCreature = false) {
    for (let i = 0; i < count; i++) {
        const flavor = Math.floor(Math.random() * CANDY_FLAVORS.length);
        const mesh = new THREE.Mesh(bearGeo, candyMats[flavor]);
        const baseScale = 0.85 + Math.random() * 0.35;
        mesh.scale.setScalar(baseScale);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        addGummyMesh(mesh);
        if (nearCreature) {
            // 撒在泡靈周圍 14–34 單位的海裡，要自己游過去吃
            const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 20;
            mesh.position.set(
                creatureState.pos.x + Math.cos(a) * r,
                Math.max(SEAFLOOR_Y + 5, Math.min(30, creatureState.pos.y + (Math.random() - 0.5) * 16)),
                creatureState.pos.z + Math.sin(a) * r * 0.7
            );
        } else {
            mesh.position.set((Math.random() - 0.5) * 110, SEAFLOOR_Y + 6 + Math.random() * 48, (Math.random() - 0.5) * 90);
        }
        scene.add(mesh);
        spores.push({
            mesh, flavor, baseScale, grabbed: false, eaten: false,
            vel: new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.06),
            spin: new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.0),
            phase: Math.random() * Math.PI * 2
        });
    }
}

// 粒子爆散 Burst particles
const burstParticles3D = [];
function spawn3DBurst(origin, colorHex, count = 30, speed = 0.8) {
    if (colorHex === undefined || colorHex === null) colorHex = 0xffffff;   // 避免 THREE 的 color undefined 警告
    for (let i = 0; i < count; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: colorHex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        m.position.copy(origin);
        const s = 0.6 + Math.random() * 1.2;
        m.scale.set(s, s, s);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const spd = (0.25 + Math.random() * 0.8) * speed;
        const vel = new THREE.Vector3(Math.sin(phi) * Math.cos(theta) * spd, Math.sin(phi) * Math.sin(theta) * spd, Math.cos(phi) * spd);
        scene.add(m);
        burstParticles3D.push({ mesh: m, vel, life: 1.0 });
    }
}

// ------------------------------------------------------------------
// 7. 狀態 State / 輸入 Input
// ------------------------------------------------------------------
const creatureState = {
    pos: new THREE.Vector3(0, 4, 0),
    vel: new THREE.Vector3(0, 0, 0),
    stage: 'MEDUSA',   // 'MEDUSA' | 'CYST' | 'POLYP' | 'DEAD'
    maturity: 1.0,
    stress: 0,
    rebirthCount: 1,
    pulsePhase: 0,
    pulse: 0,
    cystProgress: 0,
    polypTimer: 0,
    stareTimer: 0,
    followMouse: true
};

applyMorphTheme(0);
startBirth();   // 一開場就從吹泡泡開始長

spawnSpores3D(30, false);

const keys = { w: false, a: false, s: false, d: false, up: false, down: false };
const mouseNDC = new THREE.Vector2(0, 0);
const mouseWorldTarget = new THREE.Vector3(0, 6, 18);
const raycaster = new THREE.Raycaster();
const intersectPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

window.addEventListener('mousemove', (e) => {
    mouseNDC.x = (e.clientX / width) * 2 - 1;
    mouseNDC.y = -(e.clientY / height) * 2 + 1;
    raycaster.setFromCamera(mouseNDC, camera);
    intersectPlane.constant = -creatureState.pos.z;
    raycaster.ray.intersectPlane(intersectPlane, mouseWorldTarget);
});

// 只有真的在「打字」的欄位才擋掉快捷鍵（勾選框、按鈕、滑桿都不算）
function isTyping(e) {
    const t = e.target;
    if (!t || !t.tagName) return false;
    if (t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
    if (t.tagName === 'INPUT') return !['checkbox', 'radio', 'range', 'button', 'submit'].includes((t.type || '').toLowerCase());
    return false;
}
// 用 e.code（實體按鍵位置）判斷：開著注音／中文輸入法時 e.key 會變成 "Process"，用 e.code 才不會失靈
const KEY_MAP = {
    KeyW: 'w', ArrowUp: 'w',
    KeyS: 's', ArrowDown: 's',
    KeyA: 'a', ArrowLeft: 'a',
    KeyD: 'd', ArrowRight: 'd',
    KeyQ: 'up',
    KeyE: 'down'
};
window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    const k = KEY_MAP[e.code];
    if (k) { keys[k] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); }
    if (e.code === 'Space') {
        e.preventDefault();               // 避免同時「按到」面板上有焦點的按鈕或捲動頁面
        if (!e.repeat) triggerAbyssalDash();
    }
});
window.addEventListener('keyup', (e) => {
    const k = KEY_MAP[e.code];
    if (k) keys[k] = false;
    if (e.code === 'Space') e.preventDefault();
});
// 視窗失焦（切到別的程式）時把按鍵全部放開，避免一直往同一個方向漂
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const k in keys) keys[k] = false; });

const eventLog = document.getElementById('eventLog');
function updateNarrativeBanner(_icon, title, desc) {
    document.getElementById('eventTitle').textContent = title;
    document.getElementById('eventDesc').textContent = desc;
    eventLog.classList.remove('is-new');
    void eventLog.offsetWidth;
    eventLog.classList.add('is-new');
}

function showCystOverlay(show) {
    const el = document.getElementById('cystOverlay');
    el.classList.toggle('hidden', !show);
}

// ------------------------------------------------------------------
// 8. 行為 Behaviours
// ------------------------------------------------------------------
function triggerAbyssalDash() {
    if (creatureState.stage !== 'MEDUSA') return;
    initAudio();
    playEldritchSFX('dash');
    const dir = new THREE.Vector3().subVectors(mouseWorldTarget, creatureState.pos);
    if (dir.lengthSq() < 1) dir.set(0, 1, 0);
    dir.normalize();
    creatureState.vel.addScaledVector(dir, 1.25);
    creatureState.pulsePhase = Math.PI * 0.45;
    spawn3DBurst(creatureState.pos, MORPH_THEMES[currentMorphIndex].burst, 16, 0.55);
}

function triggerHeavyInjury3D() {
    if (creatureState.stage === 'DEAD') return;
    if (creatureState.stage === 'CYST') {
        updateNarrativeBanner('', '【繭化空窗期】牠正在繭裡倒帶重組',
            '目前處於 24–72 小時的逆轉空窗期，沉在海底無法移動。若此時召喚「繭期獵手」，囊胞會被直接夾碎吞掉。');
        return;
    }
    playEldritchSFX('injure');
    if (!prefersReducedMotion) {
        container.classList.remove('screen-shake');
        void container.offsetWidth;
        container.classList.add('screen-shake');
    }
    spawn3DBurst(creatureState.pos, 0xd8424f, 40, 1.0);
    creatureState.stress = 100;
    start3DCystRewind('遭受致命重創，泡膜縮成結晶囊胞');
}

function start3DCystRewind(reasonText) {
    if (creatureState.stage === 'CYST' || creatureState.stage === 'DEAD') return;
    creatureState.stage = 'CYST';
    creatureState.cystProgress = 0;
    creatureState.vel.set(0, -0.35, 0);
    cystCocoonGroup.visible = true;
    showCystOverlay(true);
    updateNarrativeBanner('', `【囊胞期】${reasonText}`,
        '泡膜一下子縮緊、結晶成一顆硬殼泡泡，泡靈閉上眼睛沉到海床。肚子裡的時之心開始逆轉，把細胞倒帶回幼年。接下來 72 小時（畫面上 3.5 秒）完全無法自衛。');
}

function hatchInto3DPolyp() {
    playEldritchSFX('eat');
    creatureState.stage = 'POLYP';
    creatureState.polypTimer = 0;
    creatureState.pos.y = SEAFLOOR_Y + 3.5;
    creatureState.vel.set(0, 0, 0);
    creatureState.stress = 0;
    creatureState.maturity = 0.32;
    cystCocoonGroup.visible = false;
    bodyGroup.visible = false;
    polypGroup.visible = true;
    spawn3DBurst(creatureState.pos, 0xa9d8cf, 30, 0.8);
    showCystOverlay(false);
    updateNarrativeBanner('', '【水螅固著期】結晶泡碎裂，退化成海床上的水螅',
        '細胞已經轉分化逆轉回幼體階段。水螅固著在海床上，頂端的吹泡圈正在慢慢把下一個自己吹成泡泡。這段時間完全不能移動。');
}

function releaseReborn3DMedusa() {
    playEldritchSFX('rebirth_stare');
    creatureState.stage = 'MEDUSA';
    creatureState.rebirthCount += 1;
    creatureState.stareTimer = 4.5;
    creatureState.vel.set(0, 0.32, 0);
    polypGroup.visible = false;
    bodyGroup.visible = true;
    setRings(creatureState.rebirthCount);
    spawn3DBurst(creatureState.pos, MORPH_THEMES[currentMorphIndex].burst, 40, 1.0);
    spawnSpores3D(12, true);

    document.getElementById('horrorVignette').style.opacity = '1';
    const sub = document.getElementById('eerieSubtitle');
    sub.style.opacity = '1';
    setTimeout(() => {
        document.getElementById('horrorVignette').style.opacity = '0';
        sub.style.opacity = '0';
    }, 4200);

    updateNarrativeBanner('', `【第 ${creatureState.rebirthCount} 次輪迴】你剛剛殺死的，又活著看你`,
        `水螅把新的自己吹成一顆小泡泡，泡泡從吹泡圈斷開、浮了上來。泡泡很小（需要重新吃孢子把它吹大），但裡面的記憶泡泡已經有 ${Math.min(9, creatureState.rebirthCount)} 顆了。那雙圓圓的眼睛，正看著螢幕前的你。`);
}

// 天敵 Predators
const predators3D = [];
// 天敵也是軟糖做的（共用材質，避免每次召喚都新建）
const predatorMats = {
    fish: makeGummyMat(0x6a5cff, 0x160c5a, false, 1.8),
    crabShell: makeGummyMat(0xff7a2a, 0x6a2200, false, 1.4),
    crabLeg: makeGummyMat(0xffa64a, 0x8a4000, false, 0.45)
};
predatorMats.fish.side = THREE.DoubleSide;

function spawn3DPredator(type) {
    if (type === 'LEVIATHAN') {
        const g = new THREE.Group();
        const skin = predatorMats.fish;
        const toothMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 0.35, emissive: 0x222018 });

        // 身體 Body（沿 x 軸，頭朝 +x）
        const bodyPts = [];
        for (let i = 0; i <= 24; i++) {
            const t = i / 24;
            bodyPts.push(new THREE.Vector2(Math.max(0.3, Math.sin(Math.PI * Math.pow(t, 0.6)) * 8.5 * (1 - t * 0.25)), -42 + t * 42));
        }
        const bodyGeo = new THREE.LatheGeometry(bodyPts, 28);
        bodyGeo.rotateZ(-Math.PI / 2);
        const body = new THREE.Mesh(bodyGeo, skin);
        body.scale.set(1, 0.85, 0.75);
        g.add(body);

        function makeJaw(upper) {
            const pivot = new THREE.Group();
            pivot.position.set(-1, 0, 0);
            const jg = new THREE.ConeGeometry(6.5, 17, 28, 1, true, upper ? Math.PI : 0, Math.PI);
            jg.rotateZ(-Math.PI / 2);
            jg.translate(8.5, 0, 0);
            const jaw = new THREE.Mesh(jg, skin);
            jaw.scale.set(1, 0.7, 1);
            pivot.add(jaw);
            for (let s = 0; s < 14; s++) {
                const u = s / 14;
                for (const side of [-1, 1]) {
                    const h = 1.7 * (1 - u * 0.6);
                    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.22, h, 6), toothMat);
                    tooth.position.set(17 * u, upper ? -h / 2 : h / 2, side * 6.3 * (1 - u));
                    if (upper) tooth.rotation.z = Math.PI;
                    pivot.add(tooth);
                }
            }
            return pivot;
        }
        const upperJaw = makeJaw(true);
        const lowerJaw = makeJaw(false);
        g.add(upperJaw, lowerJaw);

        // 眼 + 誘餌燈 Lure
        for (const side of [-1, 1]) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshBasicMaterial({ color: 0xcfe3df }));
            e.position.set(-2, 3.8, side * 5);
            g.add(e);
        }
        const lureCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-3, 6, 0), new THREE.Vector3(6, 16, 0), new THREE.Vector3(15, 9, 0));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(lureCurve, 20, 0.12, 5, false), skin));
        const lure = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xbff0e0, blending: THREE.AdditiveBlending, depthWrite: false }));
        lure.position.set(15, 9, 0);
        lure.scale.set(4, 4, 4);
        g.add(lure);
        const lureLight = new THREE.PointLight(0x9fe0d0, 1.2, 30, 2);
        lureLight.position.copy(lure.position);
        g.add(lureLight);

        const fromLeft = Math.random() > 0.5;
        g.position.set(fromLeft ? -100 : 100, creatureState.pos.y, creatureState.pos.z);
        if (!fromLeft) g.scale.x = -1;
        scene.add(g);
        predators3D.push({ type: 'LEVIATHAN', mesh: g, upperJaw, lowerJaw, vel: new THREE.Vector3(fromLeft ? 0.92 : -0.92, 0, 0), life: 330 });

        updateNarrativeBanner('', '【天敵來襲】「整隻吞下」型的巨口獸正在衝過來',
            '用 WASD 或空白鍵閃開。一旦被整隻吞下，轉分化連啟動的時間都沒有，這就是「生物學不死 ≠ 生態學不死」。');
    } else if (type === 'HUNTER') {
        const g = new THREE.Group();
        const shell = predatorMats.crabShell;
        const shellLight = predatorMats.crabLeg;

        const capGeo = new THREE.SphereGeometry(4.2, 40, 24);
        {
            const pa = capGeo.attributes.position;
            for (let k = 0; k < pa.count; k++) {
                const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k);
                const n = 1 + 0.05 * Math.sin(x * 2.2) * Math.sin(z * 2.6) + 0.03 * Math.sin(x * 6 + z * 5);
                pa.setXYZ(k, x * n, y * n, z * n);
            }
            capGeo.computeVertexNormals();
        }
        const carapace = new THREE.Mesh(capGeo, shell);
        carapace.scale.set(1, 0.42, 0.8);
        carapace.position.y = 1.4;
        g.add(carapace);

        // 步足 Legs：髖 → 膝（向上外張）→ 足尖（落地）
        const legs = [];
        for (const side of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
                const leg = new THREE.Group();
                const x0 = -2.2 + i * 1.35;
                leg.position.set(x0, 1.1, side * 2.4);
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(-0.3 - i * 0.15, 1.6, side * 2.4),
                    new THREE.Vector3(-0.6 - i * 0.3, -2.3, side * 4.4)
                ]);
                leg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.2, 6, false), shellLight));
                g.add(leg);
                legs.push({ leg, phase: i * 0.8 + (side > 0 ? Math.PI : 0) });
            }
        }
        for (const side of [-1, 1]) {
            const claw = new THREE.Group();
            claw.position.set(4.2, 1.2, side * 2.0);
            const palm = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), shell);
            palm.scale.set(1.6, 0.8, 0.8);
            const fingerA = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 6), shellLight);
            fingerA.rotation.z = -Math.PI / 2;
            fingerA.position.set(2.4, 0.35, 0);
            const fingerB = fingerA.clone();
            fingerB.position.y = -0.35;
            claw.add(palm, fingerA, fingerB);
            g.add(claw);
        }
        for (const side of [-1, 1]) {
            const stalkEye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0b0b0b }));
            stalkEye.position.set(3.3, 2.6, side * 0.9);
            g.add(stalkEye);
        }

        const startX = creatureState.pos.x > 0 ? -70 : 70;
        g.position.set(startX, SEAFLOOR_Y + 1.5, creatureState.pos.z);
        scene.add(g);
        predators3D.push({ type: 'HUNTER', mesh: g, legs, vel: new THREE.Vector3(startX < 0 ? 0.55 : -0.55, 0, 0), life: 400 });

        updateNarrativeBanner('', '【天敵來襲】底棲的「繭期獵手」在海床上搜尋囊胞',
            '繭期獵手專門在海床巡邏。只要牠處在 24–72 小時的繭期或固著水螅期，獵手就會衝過來把繭挖出來吃掉。');
    }
}

function triggerEcologicalDeath3D(title, reason) {
    playEldritchSFX('death');
    creatureState.stage = 'DEAD';
    creatureGroup.visible = false;
    polypGroup.visible = false;
    showCystOverlay(false);
    spawn3DBurst(creatureState.pos, 0xd8424f, 60, 1.3);
    document.getElementById('deathTitle').textContent = title;
    document.getElementById('deathReason').textContent = reason;
    document.getElementById('deathModal').classList.remove('hidden');
    document.getElementById('respawnBtn').focus();
}

// ------------------------------------------------------------------
// 9. 主迴圈 Simulation
// ------------------------------------------------------------------
let lastTime = performance.now();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _gaze = new THREE.Vector3();

function update3DSimulation(dt, now) {
    const time = now * 0.001;
    const scale = 1.0;   // 體型改由泡泡半徑表現（吹泡泡式成長）
    creatureGroup.scale.setScalar(scale);

    if (creatureState.stage === 'MEDUSA') {
        creatureState.pulsePhase += dt * (3.0 + (1 - creatureState.maturity) * 1.6 + creatureState.stress * 0.03);
        creatureState.pulse = Math.pow(Math.max(0, Math.sin(creatureState.pulsePhase)), 1.6);

        const moveForce = new THREE.Vector3();
        if (keys.w) moveForce.y += 1;
        if (keys.s) moveForce.y -= 1;
        if (keys.a) moveForce.x -= 1;
        if (keys.d) moveForce.x += 1;
        if (keys.up) moveForce.z -= 1;
        if (keys.down) moveForce.z += 1;

        if (moveForce.lengthSq() > 0) {
            creatureState.vel.add(moveForce.normalize().multiplyScalar(0.042));
        } else if (creatureState.followMouse) {
            const toMouse = new THREE.Vector3().subVectors(mouseWorldTarget, creatureState.pos);
            const dist = toMouse.length();
            if (dist > 3.5) creatureState.vel.add(toMouse.normalize().multiplyScalar(Math.min(0.026, dist * 0.0014)));
        }

        // 收縮推進 Jet propulsion：收縮時上推，放鬆時緩沉
        // 泡泡的浮力：輕輕上下漂
        creatureState.vel.y += Math.sin(creatureState.pulsePhase * 0.5) * 0.0035;
        creatureState.vel.multiplyScalar(0.93);
        creatureState.pos.add(creatureState.vel);

        creatureState.pos.x = Math.max(-55, Math.min(55, creatureState.pos.x));
        creatureState.pos.y = Math.max(SEAFLOOR_Y + 8, Math.min(34, creatureState.pos.y));
        creatureState.pos.z = Math.max(-35, Math.min(25, creatureState.pos.z));

        // 朝向：移動時面向前進方向，停下來就轉身面向你
        const hv = Math.hypot(creatureState.vel.x, creatureState.vel.z);
        let targetYaw;
        if (hv > 0.04) targetYaw = Math.atan2(creatureState.vel.x, creatureState.vel.z);
        else targetYaw = Math.atan2(camera.position.x - creatureState.pos.x, camera.position.z - creatureState.pos.z);
        let dYaw = targetYaw - creatureGroup.rotation.y;
        dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
        creatureGroup.rotation.y += dYaw * (1 - Math.exp(-dt * 3));
        creatureGroup.rotation.x = THREE.MathUtils.lerp(creatureGroup.rotation.x, -creatureState.vel.y * 0.35, 0.08);
        creatureGroup.rotation.z = THREE.MathUtils.lerp(creatureGroup.rotation.z, -creatureState.vel.x * 0.25, 0.06);

        creatureState.stress = Math.max(0, creatureState.stress - dt * 2.5);
        if (creatureState.stareTimer > 0) creatureState.stareTimer -= dt;

    } else if (creatureState.stage === 'CYST') {
        creatureState.pulse = THREE.MathUtils.lerp(creatureState.pulse, 0, 0.1);
        if (creatureState.pos.y > SEAFLOOR_Y + 5.5) creatureState.pos.y -= dt * 11;
        else creatureState.pos.y = SEAFLOOR_Y + 5.5;
        creatureGroup.rotation.x = THREE.MathUtils.lerp(creatureGroup.rotation.x, 0, 0.05);
        creatureGroup.rotation.z = THREE.MathUtils.lerp(creatureGroup.rotation.z, 0, 0.05);

        // 逆時針旋轉＝倒帶
        cystCocoonGroup.rotation.y -= dt * 1.6;
        const breathe = 1 + Math.sin(time * 3.2) * 0.03;
        cystCocoonGroup.scale.setScalar(breathe);

        creatureState.cystProgress += dt / 3.5;
        const pct = Math.min(100, creatureState.cystProgress * 100);
        const hrs = Math.min(72, creatureState.cystProgress * 72).toFixed(1);
        document.getElementById('cystProgressBar').style.width = `${pct}%`;
        document.getElementById('cystTimerText').textContent = `${hrs}h / 72.0h`;
        if (creatureState.cystProgress >= 1.0) hatchInto3DPolyp();

    } else if (creatureState.stage === 'POLYP') {
        creatureState.pos.y = SEAFLOOR_Y + 3.5;
        creatureState.polypTimer += dt / 5.5;   // 放慢，看得到「先吹泡泡 → 長身體 → 冒眼睛 → 長腳丫」
        if (creatureState.polypTimer >= 1.0) releaseReborn3DMedusa();
    }

    creatureGroup.position.copy(creatureState.pos);
    creatureCoreLight.position.copy(creatureState.pos).add(_v.set(0, 6 * scale, 4 * scale));
    creatureCoreLight.intensity = 0.7 + creatureState.pulse * 0.4;
    polypGroup.position.copy(creatureState.pos);
    polypGroup.rotation.z = Math.sin(time * 1.6) * 0.06;

    creatureGroup.updateMatrixWorld(true);
    _gaze.lerpVectors(camera.position, mouseWorldTarget, 0.3);
    updateCreatureVisual(dt, time, creatureState.stage, creatureState.pulse, creatureState.stareTimer > 0);

    // ---- 軟糖孢子：在海裡漂，靠近時泡靈才會吐泡泡環去抓 ----
    for (let i = spores.length - 1; i >= 0; i--) {
        const sp = spores[i];
        if (sp.eaten) {
            scene.remove(sp.mesh);
            removeGummyMesh(sp.mesh);
            spores.splice(i, 1);
            playEldritchSFX('eat');
            continue;
        }
        if (sp.grabbed) continue;        // 被泡泡環包住時，位置由泡泡環控制
        sp.phase += dt * 1.4;
        sp.mesh.position.add(sp.vel);
        sp.mesh.position.y += Math.sin(sp.phase) * 0.006;
        sp.mesh.rotation.x += sp.spin.x * dt;
        sp.mesh.rotation.y += sp.spin.y * dt;
        sp.mesh.rotation.z += sp.spin.z * dt;
        // 漂太遠就慢慢轉回來，不會一直漂出畫面
        if (Math.abs(sp.mesh.position.x) > 70) sp.vel.x = -Math.sign(sp.mesh.position.x) * Math.abs(sp.vel.x);
        if (Math.abs(sp.mesh.position.z) > 55) sp.vel.z = -Math.sign(sp.mesh.position.z) * Math.abs(sp.vel.z);
        if (sp.mesh.position.y < SEAFLOOR_Y + 4 || sp.mesh.position.y > 32) sp.vel.y = -sp.vel.y;
        if (creatureState.stage === 'MEDUSA') {
            const d = sp.mesh.position.distanceTo(creatureState.pos);
            if (d < podReachWorld()) tryGrab(sp);
        }
    }
    if (spores.length < 22) spawnSpores3D(1, false);

    // ---- 天敵 Predators ----
    for (let i = predators3D.length - 1; i >= 0; i--) {
        const pred = predators3D[i];
        pred.life -= 1;
        if (pred.type === 'LEVIATHAN') {
            if (creatureState.stage !== 'DEAD') {
                pred.mesh.position.y = THREE.MathUtils.lerp(pred.mesh.position.y, creatureState.pos.y, 0.035);
                pred.mesh.position.z = THREE.MathUtils.lerp(pred.mesh.position.z, creatureState.pos.z, 0.035);
            }
            pred.mesh.position.add(pred.vel);
            const open = 0.12 + Math.abs(Math.sin(now * 0.005)) * 0.42;
            pred.upperJaw.rotation.z = open;
            pred.lowerJaw.rotation.z = -open;
            pred.mesh.rotation.x = Math.sin(now * 0.002) * 0.05;
            if (creatureState.stage !== 'DEAD' && pred.mesh.position.distanceTo(creatureState.pos) < 11.5) {
                triggerEcologicalDeath3D('被「整隻吞下」型巨口獸一口吞噬',
                    '輪迴水靈是「生物學上不死」，不是「生態學上不死」。面對巨型掠食者一口整吞，需要 24–72 小時的轉分化根本來不及啟動，不死能力瞬間失效。');
            }
        } else if (pred.type === 'HUNTER') {
            pred.mesh.position.y = SEAFLOOR_Y + 1.5;
            let dir = pred.vel;
            if (creatureState.stage === 'CYST' || creatureState.stage === 'POLYP') {
                const toCyst = new THREE.Vector3().subVectors(creatureState.pos, pred.mesh.position);
                toCyst.y = 0;
                dir = toCyst.normalize().multiplyScalar(0.62);
            }
            pred.mesh.position.add(dir);
            pred.mesh.rotation.y = Math.atan2(-dir.z, dir.x);
            for (const l of pred.legs) l.leg.rotation.y = Math.sin(now * 0.02 + l.phase) * 0.35;

            if (creatureState.stage !== 'DEAD' && pred.mesh.position.distanceTo(creatureState.pos) < 8.5) {
                if (creatureState.stage === 'CYST' || creatureState.stage === 'POLYP') {
                    triggerEcologicalDeath3D('在繭期／水螅期被繭期獵手挖出來吃掉',
                        '倒帶期間牠只是一團沉在海底、不能動的囊胞（或剛變回固著的水螅），完全無法自衛，被專門搜尋囊胞的「繭期獵手」夾碎吞食。');
                } else {
                    triggerHeavyInjury3D();
                }
            }
        }
        if (pred.life <= 0) {
            scene.remove(pred.mesh);
            predators3D.splice(i, 1);
        }
    }

    // ---- 粒子 Bursts ----
    for (let i = burstParticles3D.length - 1; i >= 0; i--) {
        const bp = burstParticles3D[i];
        bp.mesh.position.add(bp.vel);
        bp.vel.multiplyScalar(0.95);
        bp.life -= dt * 1.2;
        bp.mesh.material.opacity = Math.max(0, bp.life);
        if (bp.life <= 0) {
            scene.remove(bp.mesh);
            bp.mesh.material.dispose();
            burstParticles3D.splice(i, 1);
        }
    }

    // ---- 海雪與光束 Ambient ----
    for (let i = 0; i < SNOW; i++) {
        const k = i * 3;
        snowPos[k + 1] -= snowSpd[i] * dt * 0.9;
        snowPos[k] += Math.sin(time * 0.3 + i) * 0.004;
        if (snowPos[k + 1] < SEAFLOOR_Y) snowPos[k + 1] += 100;
    }
    // 糖粉一閃一閃
    for (let i = 0; i < SNOW; i++) {
        const tw = 0.45 + 0.55 * Math.max(0, Math.sin(time * 2.2 + i * 1.7));
        const k = i * 3;
        snowCol[k] = snowBase[k] * tw; snowCol[k + 1] = snowBase[k + 1] * tw; snowCol[k + 2] = snowBase[k + 2] * tw;
    }
    snowGeo.attributes.position.needsUpdate = true;
    snowGeo.attributes.color.needsUpdate = true;
    for (const s of shafts) s.mesh.material.uniforms.uOpacity.value = 0.08 + Math.sin(time * 0.4 + s.phase) * 0.025;
    floorMat.uniforms.uTime.value = time;
    // 軟糖海草擺動
    for (const w of worms) {
        w.base.rotation.z = Math.sin(time * 0.7 + w.phase) * w.amp;
        w.base.rotation.x = Math.cos(time * 0.55 + w.phase) * w.amp * 0.6;
        w.mid.rotation.z = Math.sin(time * 1.1 + w.phase + 0.8) * w.amp * 1.6;
    }
    // 泡泡泉：一串一串往上冒
    for (const b of ventBubbles) {
        b.y += b.speed * dt;
        if (b.y > SEAFLOOR_Y + 62) b.y = SEAFLOOR_Y + 0.5;
        const rise = (b.y - SEAFLOOR_Y) / 62;
        b.mesh.position.set(b.vent[0] + Math.sin(time * 2.0 + b.phase) * (0.3 + rise * 1.2), b.y, b.vent[1] + Math.cos(time * 1.7 + b.phase) * (0.3 + rise * 1.2));
        const sc = b.size * (0.6 + rise * 0.9);
        b.mesh.scale.set(sc * (1 + Math.sin(time * 6 + b.phase) * 0.06), sc, sc);
    }

    updateTelemetry();
}

// ------------------------------------------------------------------
// 10. Tweakpane 控制面板
// ------------------------------------------------------------------
const ui = {
    stage: '成體 Adult',
    size: '4.5 mm',
    rings: '1 顆',
    heartRate: '—',
    stomachState: '空的',
    lanternState: '平靜',
    labels: true,
    gaze: '看著你',
    maturity: 100,
    stress: 0,
    stressTrace: 0,
    morph: 0,
    follow: true,
    sound: false,
    glow: 0.6
};

function updateTelemetry() {
    const st = creatureState.stage;
    if (st === 'MEDUSA') {
        ui.stage = creatureState.maturity < 0.55 ? '重生幼體 Juvenile' : '成體 Adult';
        ui.size = `${(creatureState.maturity * 4.5).toFixed(1)} mm`;
    } else if (st === 'CYST') {
        ui.stage = '囊胞 Cyst';
        ui.size = '1.2 mm';
    } else if (st === 'POLYP') {
        ui.stage = '固著水螅 Polyp';
        ui.size = '0.9 mm';
    } else {
        ui.stage = '生態學死亡 Dead';
        ui.size = '—';
    }
    ui.rings = `${Math.min(9, creatureState.rebirthCount)} 顆`;
    ui.heartRate = st === 'CYST' ? '逆轉中 Rewind' : `${organState.bpm} bpm`;
    ui.stomachState = organState.digesting > 0 ? `${organState.digesting} 顆消化中` : '沒有';
    ui.lanternState = organState.alert ? '泛紅警戒 Alert' : '平靜 Calm';
    ui.gaze = creatureState.stareTimer > 0 ? '鎖定你' : (predators3D.length > 0 ? '盯著天敵' : '看著你');
    ui.maturity = creatureState.maturity * 100;
    ui.stress = creatureState.stress;
    ui.stressTrace = creatureState.stress;
}

const pane = new Tweakpane.Pane({ container: document.getElementById('paneHost'), title: '標本 E 控制台' });
// 點完面板上的按鈕／勾選框就把焦點還給畫面，WASD、空白鍵、H 才不會被吃掉
document.getElementById('paneHost').addEventListener('click', () => {
    setTimeout(() => {
        const a = document.activeElement;
        if (a && (a.tagName === 'BUTTON' || (a.tagName === 'INPUT' && a.type === 'checkbox'))) a.blur();
    }, 0);
});
document.getElementById('paneHost').addEventListener('change', (e) => {
    if (e.target && e.target.tagName === 'SELECT') setTimeout(() => e.target.blur(), 0);
});

const fState = pane.addFolder({ title: '即時狀態 Telemetry', expanded: true });
fState.addMonitor(ui, 'stage', { label: '生命階段 Stage' });
fState.addMonitor(ui, 'size', { label: '體型 Size' });
fState.addMonitor(ui, 'rings', { label: '記憶泡泡 Memory' });
fState.addMonitor(ui, 'gaze', { label: '視線 Gaze' });
fState.addMonitor(ui, 'maturity', { label: '成熟度 Maturity', format: (v) => `${v.toFixed(0)}%` });
fState.addMonitor(ui, 'stress', { label: '細胞壓力 Stress', format: (v) => `${v.toFixed(0)}%` });
fState.addMonitor(ui, 'stressTrace', { label: '壓力曲線', view: 'graph', min: 0, max: 100, interval: 60 });

const fOrg = pane.addFolder({ title: '器官 Organs', expanded: true });
fOrg.addMonitor(ui, 'heartRate', { label: '時之心 Heart' });
fOrg.addMonitor(ui, 'stomachState', { label: '泡內養分 Nutrients' });
fOrg.addMonitor(ui, 'lanternState', { label: '泡膜 Membrane' });
fOrg.addInput(ui, 'labels', { label: '器官標示 Labels' }).on('change', (ev) => { organLabelsOn = ev.value; });

const fAct = pane.addFolder({ title: '行為 Actions', expanded: true });
fAct.addButton({ title: '脈衝突進 Dash', label: 'Space' }).on('click', () => triggerAbyssalDash()).element.classList.add('flav-straw');
const feedBtn = fAct.addButton({ title: '投放軟糖孢子 Feed', label: '長回成體' });
feedBtn.element.classList.add('flav-orange');
feedBtn.on('click', () => {
    initAudio();
    playEldritchSFX('eat');
    spawnSpores3D(14, true);
    updateNarrativeBanner('', '【投放孢子】把泡泡吹大',
        '軟糖撒在附近的海裡，游過去靠近時，泡靈會吐出泡泡環把軟糖包成小泡泡拉回來，再張嘴吃掉。每消化一顆，泡泡就被吹大一圈。');
});
const rewindBtn = fAct.addButton({ title: '主動轉分化 Rewind', label: '環境高壓' });
rewindBtn.element.classList.add('flav-grape');
rewindBtn.on('click', () => {
    initAudio();
    if (creatureState.stage === 'MEDUSA') {
        playEldritchSFX('injure');
        creatureState.stress = 100;
        start3DCystRewind('環境高壓，主動啟動細胞轉分化');
    }
});
const injureBtn = fAct.addButton({ title: '模擬致命重傷 Injure', label: '結繭倒帶' });
injureBtn.on('click', () => { initAudio(); triggerHeavyInjury3D(); });
injureBtn.element.classList.add('flav-cherry');

const fPred = pane.addFolder({ title: '天敵 Predators', expanded: true });
fPred.addButton({ title: '召喚繭期獵手 Hunter', label: '海床' }).on('click', () => { initAudio(); spawn3DPredator('HUNTER'); }).element.classList.add('flav-orange');
fPred.addButton({ title: '召喚巨口獸 Leviathan', label: '整隻吞下' }).on('click', () => { initAudio(); spawn3DPredator('LEVIATHAN'); }).element.classList.add('flav-berry');

const fView = pane.addFolder({ title: '外觀與視角 View', expanded: false });
const morphOptions = {};
MORPH_THEMES.forEach((t, i) => { morphOptions[t.name] = i; });
fView.addInput(ui, 'morph', { label: '型態 Morph', options: morphOptions }).on('change', (ev) => {
    initAudio();
    playEldritchSFX('dash');
    currentMorphIndex = ev.value;
    applyMorphTheme(currentMorphIndex);
    spawn3DBurst(creatureState.pos, MORPH_THEMES[currentMorphIndex].burst, 20, 0.6);
});
fView.addInput(ui, 'follow', { label: '游標牽引 Follow' }).on('change', (ev) => { creatureState.followMouse = ev.value; });
fView.addInput(ui, 'glow', { label: '光暈 Bloom', min: 0, max: 1.6, step: 0.05 }).on('change', (ev) => { bloomPass.strength = ev.value; });
fView.addInput(ui, 'sound', { label: '音效 Sound' }).on('change', (ev) => {
    initAudio();
    soundEnabled = ev.value;
    if (soundEnabled) playEldritchSFX('dash');
});
const camBtn = fView.addButton({ title: '鏡頭回到牠身上', label: 'Camera' });
camBtn.on('click', () => {
    camera.position.set(creatureState.pos.x, creatureState.pos.y + 6, creatureState.pos.z + 40);
    controls.target.copy(creatureState.pos);
});
camBtn.element.classList.add('flav-mint');
const cleanBtn = fView.addButton({ title: '純淨觀賞', label: 'H' });
cleanBtn.on('click', () => toggleCleanView());
cleanBtn.element.classList.add('flav-lemon');

const fDeck = pane.addFolder({ title: '簡報 Presentation', expanded: false });
const m2Btn = fDeck.addButton({ title: '設定書五欄與檢核', label: 'M2' });
m2Btn.on('click', () => openM2Modal());
m2Btn.element.classList.add('flav-straw');
const siftBtn = fDeck.addButton({ title: '設定與 SIFT 實證', label: '側欄' });
siftBtn.on('click', () => toggleDrawer());
siftBtn.element.classList.add('flav-grape');

// 手機：預設收合狀態欄、鏡頭拉遠
if (window.innerWidth < 720) {
    fState.expanded = false;
    camera.position.set(0, 10, 78);
}

// 純淨觀賞 Clean view
function toggleCleanView() { document.body.classList.toggle('is-clean'); }
window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (e.code === 'KeyH' && !e.repeat && m2Modal.classList.contains('hidden')) toggleCleanView();
});

document.getElementById('respawnBtn').addEventListener('click', () => {
    initAudio();
    playEldritchSFX('rebirth_stare');
    document.getElementById('deathModal').classList.add('hidden');
    for (const p of predators3D) scene.remove(p.mesh);
    predators3D.length = 0;

    creatureState.pos.set(0, 5, 0);
    creatureState.vel.set(0, 0, 0);
    creatureState.stage = 'MEDUSA';
    creatureState.maturity = 1.0;
    creatureState.stress = 0;
    creatureGroup.visible = true;
    cystCocoonGroup.visible = false;
    polypGroup.visible = false;
    bodyGroup.visible = true;
    startBirth();

    updateNarrativeBanner('', '【族群韌性 M4】新的一隻輪迴水靈醒來了',
        '單一個體被整隻吞下就會真的死去，但只要沒被秒殺就能無限重來，牠們在三千萬年後的海洋依然維持穩定的族群。');
});

// ------------------------------------------------------------------
// 11. 簡報側欄 Drawer + M2 Modal（沿用原本邏輯）
// ------------------------------------------------------------------
const drawer = document.getElementById('presentationDrawer');
let drawerOpen = false;
function toggleDrawer(forceState) {
    drawerOpen = typeof forceState === 'boolean' ? forceState : !drawerOpen;
    if (drawerOpen) {
        drawer.classList.remove('translate-x-[120%]', 'opacity-0', 'pointer-events-none');
        drawer.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');
    } else {
        drawer.classList.add('translate-x-[120%]', 'opacity-0', 'pointer-events-none');
        drawer.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
    }
}
document.getElementById('closeDrawerBtn').addEventListener('click', () => toggleDrawer(false));
document.getElementById('quickDemoSceneBtn').addEventListener('click', () => {
    initAudio();
    toggleDrawer(false);
    triggerHeavyInjury3D();
});

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach(b => { b.className = 'tab-btn py-2 rounded-lg text-slate-400 hover:text-white transition-all'; });
        btn.className = 'tab-btn py-2 rounded-lg bg-rose-500/25 text-rose-200 border border-rose-400/40 transition-all';
        tabContents.forEach(c => c.classList.add('hidden'));
        document.getElementById(target).classList.remove('hidden');
    });
});

const m2Modal = document.getElementById('m2PresentationModal');
function openM2Modal() { m2Modal.classList.remove('hidden'); m2Modal.classList.add('flex'); }
function closeM2Modal() { m2Modal.classList.add('hidden'); m2Modal.classList.remove('flex'); }
document.getElementById('closeM2ModalBtn').addEventListener('click', closeM2Modal);
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !m2Modal.classList.contains('hidden')) closeM2Modal();
});

const m2TabBtns = document.querySelectorAll('.m2-tab-btn');
const m2TabPanes = document.querySelectorAll('.m2-tab-pane');
m2TabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-m2tab');
        m2TabBtns.forEach(b => { b.className = 'm2-tab-btn px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all'; });
        btn.className = 'm2-tab-btn px-3.5 py-2 rounded-xl bg-rose-950/90 text-white border-2 border-rose-500 shadow-[0_0_15px_rgba(255,0,60,0.4)] transition-all';
        m2TabPanes.forEach(p => p.classList.add('hidden'));
        document.getElementById(targetId).classList.remove('hidden');
    });
});

let m2Seconds = 180;
let m2TimerInterval = null;
const m2TimerDisplay = document.getElementById('m2TimerDisplay');
const m2TimerToggleBtn = document.getElementById('m2TimerToggleBtn');
const m2TimerResetBtn = document.getElementById('m2TimerResetBtn');
function renderM2Timer() {
    const mins = String(Math.floor(m2Seconds / 60)).padStart(2, '0');
    const secs = String(m2Seconds % 60).padStart(2, '0');
    m2TimerDisplay.textContent = `${mins}:${secs}`;
    m2TimerDisplay.className = m2Seconds <= 30
        ? 'font-mono-sci font-black text-sm text-rose-400 animate-pulse'
        : 'font-mono-sci font-black text-sm text-emerald-400';
}
m2TimerToggleBtn.addEventListener('click', () => {
    if (m2TimerInterval) {
        clearInterval(m2TimerInterval);
        m2TimerInterval = null;
        m2TimerToggleBtn.textContent = '繼續';
    } else {
        m2TimerToggleBtn.textContent = '暫停';
        m2TimerInterval = setInterval(() => {
            if (m2Seconds > 0) { m2Seconds--; renderM2Timer(); }
            else { clearInterval(m2TimerInterval); m2TimerInterval = null; m2TimerToggleBtn.textContent = '時間到'; }
        }, 1000);
    }
});
m2TimerResetBtn.addEventListener('click', () => {
    clearInterval(m2TimerInterval);
    m2TimerInterval = null;
    m2Seconds = 180;
    m2TimerToggleBtn.textContent = '開始';
    renderM2Timer();
});

window.runM2Demo = function (mode) {
    initAudio();
    closeM2Modal();
    if (mode === 'injure') triggerHeavyInjury3D();
    else if (mode === 'hunter') { triggerHeavyInjury3D(); setTimeout(() => spawn3DPredator('HUNTER'), 350); }
    else if (mode === 'leviathan') spawn3DPredator('LEVIATHAN');
};

window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    resizeGummy();
});

function animate(now) {
    const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
    lastTime = now;
    update3DSimulation(dt, now);
    controls.target.lerp(creatureState.pos, 0.08);
    controls.update();
    renderGummyBackDepth();   // 小熊軟糖：先畫背面深度，算厚度
    composer.render();
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
