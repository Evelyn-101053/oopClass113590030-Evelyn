/**
 * AuraTree · 照片寫實噪聲點描法 (Photorealistic Noise Stippling Engine)
 * 
 * 完全拋棄幾何形狀，以「噪聲顆粒點描法」重現真實照片質感：
 * 1. 樹幹：數百根粗細不一的短弧線疊加，模擬真實照片中老樹皮的縱橫紋理
 * 2. 樹冠：用數萬個微小噪聲顆粒（點、短線、不規則斑塊）密集堆積，
 *    絕無完整的幾何圓形或橢圓，完全還原照片中細碎葉叢的有機質感
 * 3. 光影：對各點的 Y/X 位置做非線性光照調製，模擬真實自然光散射
 * 4. 大氣：遠處景物做藍移模糊（Aerial Perspective），重現景深感
 */

// =============================================================================
// 真實攝影取色 (Sampled from actual orchard tree photograph)
// =============================================================================

// 定向光源（照片中左上方明亮天空，右下方陰影）
const SUN_ANGLE = -0.55; // 弧度，45度斜光
const SUN_DIR_X = Math.cos(SUN_ANGLE);
const SUN_DIR_Y = Math.sin(SUN_ANGLE);

// 樹皮：取自照片中老果樹深層暗灰木質紋理
const BARK = {
  base: [62, 48, 36],
  dark: [28, 20, 14],
  mid: [88, 68, 50],
  light: [132, 108, 82],
  glint: [172, 148, 116],
  moss: [65, 78, 42]
};

// 葉片：取自照片中盛夏強光下的果樹葉色光譜
const LEAF_COLORS = [
  [186, 242, 80],   // 強光透射嫩黃綠
  [138, 210, 30],   // 受光草綠
  [88, 168, 24],    // 中調翠綠
  [56, 128, 20],    // 暗調深綠
  [34, 95, 16],     // 葉簇陰影深墨綠
  [24, 68, 14],     // 葉叢最深陰影
  [162, 196, 58],   // 側光黃綠
  [112, 180, 38],   // 半陰斜光綠
];

// 常春藤色
const IVY = [
  [74, 145, 32],
  [52, 108, 24],
  [96, 168, 42]
];

// 環境色
const ENV = {
  skyTop: [175, 215, 240],
  skyHorizon: [210, 232, 248],
  skyGlow: [235, 245, 255],
  distFarTree: [98, 148, 72],
  distMidTree: [78, 128, 58],
  lawnFar: [95, 158, 42],
  lawnMid: [118, 180, 52],
  lawnNear: [145, 205, 65],
  lawnBright: [168, 228, 80],
  shadowOnGrass: [32, 72, 24]
};

// =============================================================================
// 全域狀態
// =============================================================================
let params = {
  treeHeight: 1.0,
  curvature: 1.0,
  foliageDensity: 1.0,
  windSpeed: 0.7,
  elasticity: 0.4
};

let treeSeed = 5521;
let rootTree = null;
let treeNodes = []; // 所有節點的平坦列表，用於後處理渲染
let growthProgress = 1.0;
let isGrowing = false;
let growthStartTime = 0;
const GROWTH_DURATION = 2800;

let globalTime = 0;
let mouseWindForce = 0;
let pg = null; // offscreen graphics buffer (用於前一幀混合，製造微動模糊)

// =============================================================================
// 節點式老樹骨架 (Node-based Skeleton)
// =============================================================================
class TreeNode {
  constructor(x, y, parentNode, radius, depth, maxDepth) {
    this.pos = createVector(x, y);
    this.basePos = createVector(x, y);
    this.parent = parentNode;
    this.radius = radius;
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.children = [];

    this.angularVelocity = 0;
    this.swayOffset = 0;
    this.swayAngle = 0;
    this.stiffness = map(depth, 0, maxDepth, 0.2, 0.03);
    this.damping = 0.87;

    // 到父節點的基礎角度和長度
    if (parentNode) {
      let d = p5.Vector.sub(this.basePos, parentNode.basePos);
      this.baseAngle = d.heading();
      this.length = d.mag();
    } else {
      this.baseAngle = -HALF_PI;
      this.length = 0;
    }

    // 樹皮縱向裂紋參數（只在粗枝上生成）
    this.furrows = [];
    if (radius > 5 && depth <= 3) {
      let nf = int(map(radius, 5, 40, 2, 8));
      for (let i = 0; i < nf; i++) {
        this.furrows.push({
          lateralFrac: random(-0.8, 0.8),
          t1: random(0.05, 0.35),
          t2: random(0.65, 0.95),
          weight: random(0.8, 2.0),
          noiseSeed: random(10000)
        });
      }
    }

    treeNodes.push(this);
  }

  updateSway(windForce, mouseForce) {
    let leverage = pow((this.depth + 1) / (this.maxDepth + 1), 2.0);
    let target = (windForce + mouseForce) * leverage * 0.4 * params.elasticity;
    let spring = (target - this.swayOffset) * this.stiffness;
    this.angularVelocity += spring;
    this.angularVelocity *= this.damping;
    this.swayOffset += this.angularVelocity;

    // 更新實際位置
    if (this.parent) {
      let curAngle = this.baseAngle + this.swayOffset;
      this.pos = createVector(
        this.parent.pos.x + cos(curAngle) * this.length,
        this.parent.pos.y + sin(curAngle) * this.length
      );
    }

    for (let c of this.children) {
      c.updateSway(windForce, mouseForce);
    }
  }
}

// =============================================================================
// 噪聲點描法渲染核心 (Noise Stippling Renderer)
// =============================================================================

/**
 * 繪製寫實樹幹區段
 * 用多層次疊加短弧線與顆粒表現真實木質紋理
 */
function drawRealisticBranch(n1, n2, r1, r2, growth) {
  if (!n1 || !n2) return;

  let steps = max(3, int(n1.pos.dist(n2.pos) / 6));
  let baseDir = p5.Vector.sub(n2.pos, n1.pos);
  let normal = createVector(-baseDir.y, baseDir.x).normalize();

  // 計算光照方向因子（決定受光面與陰影面的強度）
  let lightFactor = (normal.x * SUN_DIR_X + normal.y * SUN_DIR_Y) * 0.5 + 0.5;

  push();
  strokeCap(ROUND);
  noFill();

  // === 層次 1: 最底部深色輪廓（AO + core shadow）===
  let shadowThick = lerp(r1, r2, 0.5) * 2 + 3;
  stroke(BARK.dark[0], BARK.dark[1], BARK.dark[2]);
  strokeWeight(shadowThick);
  beginShape();
  vertex(n1.pos.x, n1.pos.y);
  let mid = p5.Vector.lerp(n1.pos, n2.pos, 0.5);
  quadraticVertex(mid.x, mid.y, n2.pos.x, n2.pos.y);
  endShape();

  // === 層次 2: 木質固有色（主體）===
  let mainThick = lerp(r1, r2, 0.5) * 2;
  stroke(BARK.base[0], BARK.base[1], BARK.base[2]);
  strokeWeight(mainThick);
  beginShape();
  vertex(n1.pos.x, n1.pos.y);
  quadraticVertex(mid.x, mid.y, n2.pos.x, n2.pos.y);
  endShape();

  // === 層次 3: 受光面淺色（模擬光照圓柱感）===
  if (mainThick > 4) {
    let lightOff = p5.Vector.mult(normal, mainThick * 0.25);
    stroke(BARK.light[0], BARK.light[1], BARK.light[2]);
    strokeWeight(mainThick * 0.4);
    beginShape();
    vertex(n1.pos.x + lightOff.x, n1.pos.y + lightOff.y);
    quadraticVertex(mid.x + lightOff.x, mid.y + lightOff.y, n2.pos.x + lightOff.x, n2.pos.y + lightOff.y);
    endShape();
  }

  // === 層次 4: 太陽輪廓光 (Rim Light) ===
  if (mainThick > 10) {
    let rimOff = p5.Vector.mult(normal, mainThick * 0.41);
    stroke(BARK.glint[0], BARK.glint[1], BARK.glint[2], 200);
    strokeWeight(max(1, mainThick * 0.12));
    beginShape();
    vertex(n1.pos.x + rimOff.x, n1.pos.y + rimOff.y);
    quadraticVertex(mid.x + rimOff.x, mid.y + rimOff.y, n2.pos.x + rimOff.x, n2.pos.y + rimOff.y);
    endShape();
  }

  // === 層次 5: 縱向木紋裂溝（多條不規則短弧線）===
  if (mainThick > 7 && n1.furrows.length > 0) {
    for (let f of n1.furrows) {
      let lateralOff = p5.Vector.mult(normal, f.lateralFrac * mainThick * 0.45);
      let p1 = p5.Vector.lerp(n1.pos, n2.pos, f.t1);
      let p2 = p5.Vector.lerp(n1.pos, n2.pos, f.t2);

      // 深色裂縫主體
      stroke(BARK.dark[0], BARK.dark[1], BARK.dark[2], 210);
      strokeWeight(f.weight);
      line(
        p1.x + lateralOff.x + (noise(f.noiseSeed) - 0.5) * 2,
        p1.y + lateralOff.y,
        p2.x + lateralOff.x + (noise(f.noiseSeed + 0.5) - 0.5) * 2,
        p2.y + lateralOff.y
      );
    }
  }

  pop();
}

/**
 * 核心：噪聲顆粒點描法繪製樹冠葉叢
 * 完全拋棄幾何形狀，用數萬個微小不規則顆粒堆積成有機質感的葉叢
 */
function drawNoiseStippledFoliage(cx, cy, baseRadius, colorBias, sway) {
  push();
  noStroke();

  let r = baseRadius * params.treeHeight;
  // 總顆粒數（粒子越多越真實）
  let numParticles = int(r * r * 0.85 * params.foliageDensity);
  numParticles = min(numParticles, 3200); // 效能上限

  for (let i = 0; i < numParticles; i++) {
    // 用噪聲場取代均勻分佈，形成有機的葉叢邊緣
    let angle = random(TWO_PI);
    let rawDist = random(1.0);

    // 加入噪聲讓邊緣更不規則（關鍵！）
    let noisePush = noise(cx * 0.004 + cos(angle) * 0.8, cy * 0.004 + sin(angle) * 0.8, i * 0.001 + colorBias) * 0.45;
    let dist = pow(rawDist, 0.55) * r * (0.72 + noisePush);

    let px = cx + cos(angle + sway * 0.3) * dist;
    let py = cy + sin(angle) * dist * 0.88; // Y 軸略壓縮，更貼近真實葉冠

    // 根據位置計算光照強度（上方受光，下方陰影）
    let lightY = 1.0 - ((py - cy + r) / (2 * r));  // 0(底部暗) ~ 1(頂部亮)
    let lightX = ((px - cx + r) / (2 * r));         // 0(右陰) ~ 1(左受光)
    let brightness = lightY * 0.65 + lightX * 0.35;

    // 邊緣顆粒較稀，中心較密（濃度梯度）
    let edgeFrac = dist / r;
    if (random() > (1 - edgeFrac * 0.55)) continue;

    // 根據亮度從照片色調中選色
    let colIdx;
    if (brightness > 0.75) {
      colIdx = int(random(3) == 0 ? 0 : (random() > 0.5 ? 1 : 6)); // 亮部：嫩黃綠、草綠、斜光黃
    } else if (brightness > 0.45) {
      colIdx = int(random() > 0.5 ? 2 : 7); // 中調：翠綠、半陰斜光
    } else {
      colIdx = int(random() > 0.5 ? 3 : (random() > 0.5 ? 4 : 5)); // 暗部：深綠、暗墨綠
    }

    let c = LEAF_COLORS[colIdx % LEAF_COLORS.length];

    // 顆粒大小有隨機變化（模擬葉片大小差異）
    let particleSize = random(0.9, 3.8) * (0.6 + brightness * 0.7);

    // 透明度也有變化（邊緣更透）
    let alpha = lerp(180, 255, 1 - edgeFrac * 0.7);

    fill(c[0], c[1], c[2], alpha);

    // 大部分是微小橢圓（模擬葉片截面），少數是更小的點（遠景葉叢）
    if (particleSize > 2.2) {
      let leafAngle = random(TWO_PI);
      let lw = particleSize;
      let lh = particleSize * random(0.45, 0.85);
      push();
      translate(px, py);
      rotate(leafAngle);
      ellipse(0, 0, lw, lh);
      pop();
    } else {
      ellipse(px, py, particleSize, particleSize);
    }
  }

  pop();
}

/**
 * 用同樣的噪聲顆粒法繪製深色背景葉雲（樹冠後部陰影層）
 */
function drawBackCanopyStipple(cx, cy, baseRadius, sway) {
  push();
  noStroke();

  let r = baseRadius * 1.25 * params.treeHeight;
  let numP = int(r * r * 0.5 * params.foliageDensity);
  numP = min(numP, 1600);

  for (let i = 0; i < numP; i++) {
    let angle = random(TWO_PI);
    let noisePush = noise(cx * 0.003 + cos(angle) * 0.7, cy * 0.003 + sin(angle) * 0.7) * 0.5;
    let dist = pow(random(), 0.5) * r * (0.65 + noisePush);

    let px = cx + cos(angle + sway * 0.2) * dist;
    let py = cy + sin(angle) * dist * 0.9;

    let edgeFrac = dist / r;
    if (random() > (1 - edgeFrac * 0.45)) continue;

    // 背景層用更深的顏色
    let c = LEAF_COLORS[int(random() > 0.5 ? 4 : 5)];
    let alpha = lerp(120, 190, 1 - edgeFrac);

    fill(c[0], c[1], c[2], alpha);
    ellipse(px, py, random(1.2, 3.5), random(0.8, 2.5));
  }

  pop();
}

// =============================================================================
// 建構照片對標的老樹骨架拓撲
// =============================================================================

function buildRealisticTreeSkeleton() {
  treeNodes = [];

  let W = width, H = height;
  let baseX = W * 0.47, baseY = H * 0.84;
  let forkX = W * 0.45, forkY = H * 0.56;
  let R = 30 * params.treeHeight; // 主幹基礎半徑

  // 主幹基部節點
  let base = new TreeNode(baseX, baseY, null, R * 1.4, 0, 7);
  let fork = new TreeNode(forkX, forkY, base, R * 1.0, 0, 7);
  base.children.push(fork);

  // 1. 左側橫向巨臂 (Left Sprawling Arch)
  let lMid1 = new TreeNode(W * 0.35, H * 0.50, fork, R * 0.88, 1, 7);
  let lMid2 = new TreeNode(W * 0.26, H * 0.46, lMid1, R * 0.72, 1, 7);
  fork.children.push(lMid1);
  lMid1.children.push(lMid2);

  // 左臂低伸橫枝
  let lLow = new TreeNode(W * 0.14, H * 0.54, lMid2, R * 0.52, 2, 7);
  lMid2.children.push(lLow);
  buildSubBranches(lLow, -PI * 0.82, 90 * params.treeHeight, R * 0.44, 3, 7);

  // 左臂上揚冠枝
  let lUp = new TreeNode(W * 0.22, H * 0.33, lMid2, R * 0.55, 2, 7);
  lMid2.children.push(lUp);
  buildSubBranches(lUp, -PI * 0.65, 100 * params.treeHeight, R * 0.42, 3, 7);

  // 左臂中段上生次枝
  let lMidUp = new TreeNode(W * 0.32, H * 0.36, lMid1, R * 0.46, 2, 7);
  lMid1.children.push(lMidUp);
  buildSubBranches(lMidUp, -PI * 0.72, 88 * params.treeHeight, R * 0.36, 3, 7);

  // 2. 右側斜伸重臂 (Right Heavy Sweep)
  let rMid1 = new TreeNode(W * 0.58, H * 0.47, fork, R * 0.84, 1, 7);
  let rMid2 = new TreeNode(W * 0.70, H * 0.41, rMid1, R * 0.66, 1, 7);
  fork.children.push(rMid1);
  rMid1.children.push(rMid2);

  // 右臂外展主枝
  let rOut = new TreeNode(W * 0.86, H * 0.36, rMid2, R * 0.48, 2, 7);
  rMid2.children.push(rOut);
  buildSubBranches(rOut, -PI * 0.12, 95 * params.treeHeight, R * 0.36, 3, 7);

  // 右臂上揚樹冠
  let rUp = new TreeNode(W * 0.78, H * 0.28, rMid2, R * 0.52, 2, 7);
  rMid2.children.push(rUp);
  buildSubBranches(rUp, -PI * 0.42, 102 * params.treeHeight, R * 0.38, 3, 7);

  // 右臂內側分枝
  let rInner = new TreeNode(W * 0.62, H * 0.34, rMid1, R * 0.44, 2, 7);
  rMid1.children.push(rInner);
  buildSubBranches(rInner, -PI * 0.58, 85 * params.treeHeight, R * 0.34, 3, 7);

  // 3. 中央主冠 (Center Crown)
  let cUp1 = new TreeNode(W * 0.46, H * 0.38, fork, R * 0.72, 1, 7);
  fork.children.push(cUp1);
  buildSubBranches(cUp1, -HALF_PI, 115 * params.treeHeight, R * 0.52, 2, 7);

  return base;
}

function buildSubBranches(parentNode, angle, length, radius, depth, maxDepth) {
  if (depth > maxDepth || radius < 0.7 || length < 8) return;

  let count = depth <= 4 ? (random() > 0.4 ? 2 : 3) : (random() > 0.6 ? 2 : 1);
  let spread = map(depth, 2, maxDepth, 0.7, 0.42) * params.curvature;

  for (let i = 0; i < count; i++) {
    let offset = (count === 1) ? random(-0.22, 0.22) : map(i, 0, count - 1, -spread, spread);
    let nextAngle = angle + offset + random(-0.14, 0.14);
    let nextLen = length * random(0.70, 0.84);
    let nextR = radius * pow(1.0 / count, 1.0 / 2.3) * random(0.86, 1.06);

    let nx = parentNode.pos.x + cos(nextAngle) * nextLen;
    let ny = parentNode.pos.y + sin(nextAngle) * nextLen;

    let child = new TreeNode(nx, ny, parentNode, nextR, depth, maxDepth);
    parentNode.children.push(child);

    buildSubBranches(child, nextAngle, nextLen, nextR, depth + 1, maxDepth);
  }
}

// =============================================================================
// 遞歸渲染排程 (Back-to-Front Painter's Algorithm)
// =============================================================================

// 收集所有需要繪製葉叢的節點（depth 2+）
let foliageNodes = [];

function collectFoliageNodes(node) {
  if (node.depth >= 2) {
    foliageNodes.push(node);
  }
  for (let c of node.children) {
    collectFoliageNodes(c);
  }
}

function renderAllBranches(node) {
  if (node.parent) {
    let r1 = node.parent.radius;
    let r2 = node.radius;
    let progress = constrain(
      map(growthProgress, (node.depth / 7) * 0.78, (node.depth / 7) * 0.78 + 0.28, 0, 1),
      0, 1
    );
    if (progress > 0) {
      // 按生長進度插值末端
      let curEnd = p5.Vector.lerp(node.parent.pos, node.pos, progress);
      let fakeNode = { pos: curEnd, radius: node.radius, furrows: node.furrows, depth: node.depth };
      drawRealisticBranch(node.parent, fakeNode, r1, r2, progress);
    }
  }
  for (let c of node.children) {
    renderAllBranches(c);
  }
}

// =============================================================================
// 常春藤點描法 (Stippled Ivy on Trunk)
// =============================================================================
let ivyParticles = [];

function generateIvyParticles() {
  ivyParticles = [];
  let baseX = width * 0.47;
  let baseY = height * 0.84;
  let topY = height * 0.56;
  let trunkR = 30 * params.treeHeight;

  for (let i = 0; i < 480; i++) {
    let t = random(0.02, 0.98);
    let y = lerp(baseY, topY, t);
    let xOff = (noise(i * 4.1) - 0.52) * trunkR * 1.4;
    let x = baseX + xOff;
    let ivyCol = IVY[int(random(IVY.length))];
    ivyParticles.push({
      x: x, y: y,
      size: random(5, 12) * params.treeHeight,
      rot: random(TWO_PI),
      col: ivyCol,
      alpha: random(160, 240)
    });
  }
}

function renderIvy(growth) {
  if (growth < 0.35) return;
  let g = constrain(map(growth, 0.35, 1.0, 0, 1), 0, 1);

  push();
  noStroke();
  for (let p of ivyParticles) {
    let s = p.size * g;
    fill(p.col[0], p.col[1], p.col[2], p.alpha);
    push();
    translate(p.x, p.y);
    rotate(p.rot);
    // 心形小葉（由三角形 + 兩個圓圓構成更自然的葉形）
    beginShape();
    vertex(0, s * 0.55);
    bezierVertex(-s * 0.55, s * 0.15, -s * 0.55, -s * 0.4, 0, -s * 0.55);
    bezierVertex(s * 0.55, -s * 0.4, s * 0.55, s * 0.15, 0, s * 0.55);
    endShape(CLOSE);
    pop();
  }
  pop();
}

// =============================================================================
// p5.js 生命週期
// =============================================================================

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('canvas-container');
  pixelDensity(window.devicePixelRatio || 1);

  foliageNodes = [];
  generateTree();
  initUIEventListeners();
}

function draw() {
  globalTime += 0.015;

  // ─── 1. 寫實天幕與遠景果園 ─────────────────────────────────
  drawRealisticSky();

  // ─── 2. 草坪與地面樹蔭 ───────────────────────────────────────
  drawRealisticLawn();

  // ─── 3. 物理風力更新 ───────────────────────────────────────────
  let wind = (noise(globalTime * 0.5) - 0.48) * 1.6 * params.windSpeed;
  let mf = calcMouseForce();

  if (isGrowing) {
    let t = constrain((millis() - growthStartTime) / GROWTH_DURATION, 0, 1);
    growthProgress = 1 - pow(1 - t, 3.5);
    if (t >= 1) isGrowing = false;
  }

  if (rootTree) rootTree.updateSway(wind, mf);

  // ─── 4. 背層深色葉雲（樹冠後方厚重底層）─────────────────────
  let bloomG = constrain(map(growthProgress, 0.42, 1.0, 0, 1), 0, 1);
  if (bloomG > 0) {
    for (let n of foliageNodes) {
      if (n.depth <= 4) {
        let sz = map(n.depth, 2, 7, 80, 42) * params.treeHeight * bloomG;
        drawBackCanopyStipple(n.pos.x, n.pos.y, sz, n.swayOffset);
      }
    }
  }

  // ─── 5. 繪製樹幹與所有枝幹 ───────────────────────────────────
  renderAllBranches(rootTree);

  // ─── 6. 繪製樹幹常春藤 ─────────────────────────────────────────
  renderIvy(growthProgress);

  // ─── 7. 前景噪聲點描葉冠（疊加在枝幹上方，形成枝葉掩映）─────
  if (bloomG > 0) {
    for (let n of foliageNodes) {
      let sz = map(n.depth, 2, 7, 68, 32) * params.treeHeight * bloomG;
      // colorBias 用於讓各節點葉色有細微差異，避免所有葉叢顏色完全相同
      let colorBias = noise(n.pos.x * 0.005, n.pos.y * 0.005);
      drawNoiseStippledFoliage(n.pos.x, n.pos.y, sz, colorBias, n.swayOffset);
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  generateTree();
}

// =============================================================================
// 寫實天空與草坪 (Photorealistic Sky & Lawn)
// =============================================================================

function drawRealisticSky() {
  let cTop = color(ENV.skyTop[0], ENV.skyTop[1], ENV.skyTop[2]);
  let cHori = color(ENV.skyGlow[0], ENV.skyGlow[1], ENV.skyGlow[2]);

  // 漸層天色
  for (let y = 0; y < height * 0.73; y += 2) {
    let t = y / (height * 0.73);
    stroke(lerpColor(cTop, cHori, t));
    strokeWeight(2);
    line(0, y, width, y);
  }

  // 遠景果園樹林（帶航空視角藍移模糊）
  push();
  noStroke();
  let horizY = height * 0.73;

  // 最遠層樹林（偏藍綠，更模糊）
  fill(ENV.distFarTree[0], ENV.distFarTree[1], ENV.distFarTree[2], 170);
  beginShape();
  vertex(0, horizY + 30);
  for (let x = 0; x <= width; x += 18) {
    let h = noise(x * 0.006, 0.1) * 55 + 12;
    vertex(x, horizY - h);
  }
  vertex(width, horizY + 30);
  endShape(CLOSE);

  // 中景樹林（較深翠綠）
  fill(ENV.distMidTree[0], ENV.distMidTree[1], ENV.distMidTree[2], 200);
  beginShape();
  vertex(0, horizY + 20);
  for (let x = 0; x <= width; x += 12) {
    let h = noise(x * 0.009, 0.5) * 38 + 8;
    vertex(x, horizY - h);
  }
  vertex(width, horizY + 20);
  endShape(CLOSE);

  // 遠景單棵小樹（增加空間層次感）
  fill(ENV.distMidTree[0] + 10, ENV.distMidTree[1] + 18, ENV.distMidTree[2] + 5, 220);
  for (let i = 0; i < 8; i++) {
    let tx = (i * 0.135 + 0.04) * width;
    let ty = horizY - 10;
    // 樹冠用橢圓（遠景足夠模糊）
    ellipse(tx, ty - 22, 52 + noise(i * 5.1) * 24, 48 + noise(i * 5.1 + 1) * 20);
    stroke(48, 36, 28);
    strokeWeight(3 + noise(i * 2.2) * 2);
    line(tx, ty, tx, ty + 14);
    noStroke();
  }
  pop();
}

function drawRealisticLawn() {
  let horizY = height * 0.73;

  // 三段草坪漸層（從遠到近，由暗到亮，模擬縮短透視與光照）
  let cFar = color(ENV.lawnFar[0], ENV.lawnFar[1], ENV.lawnFar[2]);
  let cMid = color(ENV.lawnMid[0], ENV.lawnMid[1], ENV.lawnMid[2]);
  let cNear = color(ENV.lawnBright[0], ENV.lawnBright[1], ENV.lawnBright[2]);

  for (let y = horizY; y < height; y += 2) {
    let t = (y - horizY) / (height - horizY);
    let c = t < 0.5 ? lerpColor(cFar, cMid, t * 2) : lerpColor(cMid, cNear, (t - 0.5) * 2);
    stroke(c);
    strokeWeight(2);
    line(0, y, width, y);
  }

  // 草地上老樹的自然投影（Cast Shadow）
  push();
  noStroke();

  let baseX = width * 0.47;
  let baseY = height * 0.84;

  // 樹幹根部深黑 AO 圈
  fill(ENV.shadowOnGrass[0], ENV.shadowOnGrass[1], ENV.shadowOnGrass[2], 200);
  ellipse(baseX, baseY + 8, 130 * params.treeHeight, 32 * params.treeHeight);

  // 左側巨臂樹蔭橢圓
  fill(ENV.shadowOnGrass[0], ENV.shadowOnGrass[1], ENV.shadowOnGrass[2], 140);
  push();
  translate(baseX - width * 0.17, baseY + 14);
  rotate(-0.18);
  ellipse(0, 0, 310 * params.treeHeight, 52 * params.treeHeight);
  pop();

  // 右側巨臂樹蔭橢圓
  push();
  translate(baseX + width * 0.13, baseY + 10);
  rotate(0.12);
  ellipse(0, 0, 260 * params.treeHeight, 44 * params.treeHeight);
  pop();

  // 陽光穿透葉隙的光斑（Sunlight Dapples）
  fill(ENV.lawnBright[0], ENV.lawnBright[1], ENV.lawnBright[2], 55);
  for (let i = 0; i < 35; i++) {
    let dx = (noise(i * 14.1 + 0.3) * 0.85 + 0.08) * width;
    let dy = horizY + noise(i * 8.7 + 1.1) * (height - horizY - 20) + 10;
    ellipse(dx, dy, random(8, 28), random(4, 12));
  }

  pop();
}

function calcMouseForce() {
  if (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) {
    let cx = width * 0.47;
    let d = dist(mouseX, mouseY, cx, height * 0.5);
    if (d < width * 0.45) {
      let dir = mouseX > cx ? -1 : 1;
      let f = map(d, 0, width * 0.45, 1.3, 0) * dir;
      mouseWindForce = lerp(mouseWindForce, f, 0.12);
      return mouseWindForce;
    }
  }
  mouseWindForce = lerp(mouseWindForce, 0, 0.08);
  return mouseWindForce;
}

// =============================================================================
// 生成與控制
// =============================================================================

function generateTree() {
  randomSeed(treeSeed);
  noiseSeed(treeSeed);

  treeNodes = [];
  foliageNodes = [];
  rootTree = buildRealisticTreeSkeleton();
  ivyParticles = [];
  generateIvyParticles();

  // 收集所有應長葉子的節點
  collectFoliageNodes(rootTree);
}

function startGrow() {
  isGrowing = true;
  growthStartTime = millis();
  growthProgress = 0;
}

function initUIEventListeners() {
  document.getElementById('btn-regrow').addEventListener('click', () => {
    generateTree();
    startGrow();
  });

  document.getElementById('btn-randomize').addEventListener('click', () => {
    treeSeed = int(random(100000));
    generateTree();
    startGrow();
  });

  bindSlider('param-treeHeight', 'val-treeHeight', val => {
    params.treeHeight = parseFloat(val);
    generateTree();
    return `${parseFloat(val).toFixed(2)}x`;
  });

  bindSlider('param-curvature', 'val-curvature', val => {
    params.curvature = parseFloat(val);
    generateTree();
    return parseFloat(val).toFixed(2);
  });

  bindSlider('param-foliageDensity', 'val-foliageDensity', val => {
    params.foliageDensity = parseFloat(val) / 100;
    return `${val}%`;
  });

  bindSlider('param-windSpeed', 'val-windSpeed', val => {
    params.windSpeed = parseFloat(val);
    let d = val < 0.5 ? '靜風' : (val < 1.2 ? '微風' : '和風');
    return `${d} (${parseFloat(val).toFixed(1)})`;
  });

  bindSlider('param-elasticity', 'val-elasticity', val => {
    params.elasticity = parseFloat(val);
    return parseFloat(val).toFixed(2);
  });

  const panel = document.getElementById('control-panel');
  document.getElementById('btn-toggle-ui').addEventListener('click', () => panel.classList.toggle('collapsed'));
  document.getElementById('btn-close-panel').addEventListener('click', () => panel.classList.add('collapsed'));

  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });

  document.getElementById('btn-export-png').addEventListener('click', () => {
    saveCanvas(`StippledTree_${Date.now()}`, 'png');
  });

  document.querySelectorAll('.theme-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.theme-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      let m = pill.dataset.mode;
      params.foliageDensity = m === 'lush' ? 1.35 : m === 'gnarly' ? 0.7 : 1.0;
      params.curvature = m === 'gnarly' ? 1.4 : 1.0;
      treeSeed = int(random(100000));
      generateTree();
      startGrow();
    });
  });
}

function bindSlider(id, badgeId, cb) {
  let sl = document.getElementById(id);
  let bg = document.getElementById(badgeId);
  if (!sl || !bg) return;
  sl.addEventListener('input', e => { bg.textContent = cb(e.target.value); });
}
