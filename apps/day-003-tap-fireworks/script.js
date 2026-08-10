/* タップ花火 — Day 003
 * 外部通信なし / 外部ライブラリなし / 永続化なし。
 *
 * 設計メモ:
 *  - 描画はrequestAnimationFrame 1本だけ。半透明の夜空を重ね、前フレームの光を
 *    少しずつ消すことで尾を残す。花火はlighter合成で色を加算して発光させる。
 *  - 粒子は最大3000個の固定プールから借りて再利用する。連打時も上限を超えず、
 *    空きが少ないときは新しい花火の粒子数だけを自動で絞る。
 */
'use strict';

(function () {
  // ---- 定数 ----
  var NIGHT = '#05060a';
  var MAX_PARTICLES = 3000;
  var HOLD_INTERVAL = 250;
  var IDLE_DELAY = 4000;
  var WELCOME_DELAY = 800;
  var AUTO_MIN_INTERVAL = 2500;
  var AUTO_MAX_INTERVAL = 3500;
  var TAU = Math.PI * 2;

  var TYPE_BUTTON = 0;
  var TYPE_KIKU = 1;
  var TYPE_WILLOW = 2;
  var TYPE_BICOLOR = 3;
  var TYPE_RING = 4;
  var TYPE_GLITTER = 5;

  // 重みの累計: 牡丹24 / 菊20 / 柳14 / 二色17 / リング12 / ラメ13
  var TYPE_WEIGHTS = [24, 44, 58, 75, 87, 100];
  var TYPE_COUNTS = [112, 142, 120, 160, 96, 132];

  // ---- DOM ----
  var canvas = document.getElementById('fireworks-canvas');
  var ctx = canvas.getContext('2d', { alpha: false });
  var hintEl = document.getElementById('hint');
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---- 状態 ----
  var width = 1;
  var height = 1;
  var dpr = 1;
  var gravityScale = 1;
  var reducedMotion = motionQuery.matches;
  var particles = [];
  var particlePool = [];
  var rockets = [];
  var flashes = [];
  var pointers = Object.create(null);
  var hasLaunched = false;
  var lastFrame = performance.now();
  var startedAt = lastFrame;
  var lastInteraction = lastFrame;
  var nextAutoTime = lastFrame + IDLE_DELAY;
  var welcomePending = !reducedMotion;

  // 粒子オブジェクトは起動時に一度だけ作り、以後は値を書き換えて使う。
  for (var poolIndex = 0; poolIndex < MAX_PARTICLES; poolIndex++) {
    particlePool.push({
      x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
      gravity: 0, drag: 0, life: 0, maxLife: 0,
      size: 1, color: '#fff', twinkle: false, tail: 1
    });
  }

  // ------------------------------------------------------------------
  // 画面と共通処理
  // ------------------------------------------------------------------
  function resize() {
    var oldWidth = width;
    var oldHeight = height;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    gravityScale = Math.max(.78, Math.min(1.35, height / 800));

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, width, height);

    if (oldWidth <= 1 || oldHeight <= 1) return;
    var scaleX = width / oldWidth;
    var scaleY = height / oldHeight;

    particles.forEach(function (particle) {
      particle.x *= scaleX;
      particle.px *= scaleX;
      particle.y *= scaleY;
      particle.py *= scaleY;
    });
    rockets.forEach(function (rocket) {
      rocket.startX *= scaleX;
      rocket.startY *= scaleY;
      rocket.targetX *= scaleX;
      rocket.targetY *= scaleY;
      rocket.x *= scaleX;
      rocket.y *= scaleY;
      rocket.px *= scaleX;
      rocket.py *= scaleY;
    });
    flashes.forEach(function (flash) {
      flash.x *= scaleX;
      flash.y *= scaleY;
    });
  }

  function colorFor(hue, saturation, lightness) {
    return 'hsl(' + Math.round((hue + 360) % 360) + ' ' + saturation + '% ' + lightness + '%)';
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function hideHint() {
    if (hasLaunched) return;
    hasLaunched = true;
    hintEl.classList.add('is-hidden');
  }

  function noteInteraction(now) {
    lastInteraction = now;
    nextAutoTime = now + IDLE_DELAY + randomBetween(0, 500);
  }

  // ------------------------------------------------------------------
  // 粒子と6種類の開花
  // ------------------------------------------------------------------
  function takeParticle() {
    return particlePool.length ? particlePool.pop() : null;
  }

  function releaseParticle(index) {
    var dead = particles[index];
    particles[index] = particles[particles.length - 1];
    particles.pop();
    particlePool.push(dead);
  }

  function chooseType() {
    var roll = Math.random() * 100;
    for (var i = 0; i < TYPE_WEIGHTS.length; i++) {
      if (roll < TYPE_WEIGHTS[i]) return i;
    }
    return TYPE_GLITTER;
  }

  function addParticle(x, y, vx, vy, gravity, drag, life, size, color, twinkle, tail) {
    var particle = takeParticle();
    if (!particle) return;

    particle.x = x;
    particle.y = y;
    particle.px = x;
    particle.py = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.gravity = gravity;
    particle.drag = drag;
    particle.life = life;
    particle.maxLife = life;
    particle.size = size;
    particle.color = color;
    particle.twinkle = twinkle;
    particle.tail = tail;
    particles.push(particle);
  }

  function burst(x, y) {
    var type = chooseType();
    var baseHue = Math.random() * 360;
    var secondHue = (baseHue + (Math.random() < .5 ? 180 : randomBetween(42, 76))) % 360;
    var wanted = TYPE_COUNTS[type];
    if (reducedMotion) wanted = Math.ceil(wanted / 2);
    var count = Math.min(wanted, particlePool.length);

    flashes.push({ x: x, y: y, life: 12, maxLife: 12 });

    for (var i = 0; i < count; i++) {
      var angle = randomBetween(0, TAU);
      var speed;
      var hue = baseHue;
      var gravity = .055 * gravityScale;
      var drag = .985;
      var life = randomBetween(66, 94);
      var size = randomBetween(1.15, 2.15);
      var tail = 1;
      var twinkle = false;

      if (type === TYPE_BUTTON) {
        // 牡丹: 中心から外周まで密度のある、鮮やかな単色球。
        speed = 2.6 + Math.sqrt(Math.random()) * 4.7;
        drag = .982;
      } else if (type === TYPE_KIKU) {
        // 菊: 高速で大きく開き、太く長い軌跡を残す。
        speed = randomBetween(4.8, 8.1);
        drag = .981;
        life = randomBetween(90, 118);
        size = randomBetween(1.35, 2.35);
        tail = 2.5;
      } else if (type === TYPE_WILLOW) {
        // 柳: 金一色。強い抵抗で横速度を落とし、重力で長く垂れる。
        speed = randomBetween(3.2, 6.5);
        hue = randomBetween(39, 49);
        gravity = .105 * gravityScale;
        drag = randomBetween(.938, .952);
        life = randomBetween(120, 140);
        size = randomBetween(1.05, 1.85);
        tail = 3.2;
      } else if (type === TYPE_BICOLOR) {
        // 二色咲き: 内側は補色、外側は基準色の二重球。
        var outer = (i % 2 === 0);
        speed = outer ? randomBetween(5.6, 7.4) : randomBetween(2.7, 4.2);
        hue = outer ? baseHue : secondHue;
        life = outer ? randomBetween(78, 102) : randomBetween(66, 88);
      } else if (type === TYPE_RING) {
        // リング: 速度をほぼ一定にして、薄い円環だけを描く。
        speed = randomBetween(5.65, 5.95);
        gravity = .026 * gravityScale;
        drag = .988;
        life = randomBetween(70, 84);
        angle = (i / Math.max(1, count)) * TAU + randomBetween(-.012, .012);
        size = randomBetween(1.4, 2.2);
      } else {
        // ラメ: 小ぶりに開き、後半ほど激しく明滅する。
        speed = randomBetween(2.9, 6.2);
        hue = (i % 5 === 0) ? (baseHue + 55) : baseHue;
        drag = .976;
        life = randomBetween(88, 126);
        twinkle = true;
      }

      var spread = (type === TYPE_RING) ? 0 : randomBetween(-.28, .28);
      var vx = Math.cos(angle) * speed + Math.cos(angle + Math.PI / 2) * spread;
      var vy = Math.sin(angle) * speed + Math.sin(angle + Math.PI / 2) * spread;
      var saturation = (type === TYPE_WILLOW) ? 92 : 100;
      var lightness = (type === TYPE_WILLOW) ? 68 : randomBetween(62, 72);

      addParticle(x, y, vx, vy, gravity, drag, life, size,
        colorFor(hue, saturation, lightness), twinkle, tail);
    }
  }

  // ------------------------------------------------------------------
  // ロケット
  // ------------------------------------------------------------------
  function launch(targetX, targetY) {
    // 座標はcanvas内にだけ収め、画面端を含めて入力地点そのものを開花点にする。
    var safeX = Math.max(0, Math.min(width, targetX));
    var safeY = Math.max(0, Math.min(height, targetY));
    var startX = Math.max(10, Math.min(width - 10, safeX + randomBetween(-26, 26)));
    var distance = Math.max(120, height - safeY);
    var duration = Math.max(520, Math.min(1050, 520 + distance * .58));

    rockets.push({
      startX: startX,
      startY: height + 8,
      targetX: safeX,
      targetY: safeY,
      x: startX,
      y: height + 8,
      px: startX,
      py: height + 8,
      age: 0,
      duration: duration,
      sway: randomBetween(5, 13),
      phase: randomBetween(0, TAU)
    });
  }

  function updateRockets(elapsedMs) {
    for (var i = rockets.length - 1; i >= 0; i--) {
      var rocket = rockets[i];
      rocket.age += elapsedMs;
      var t = Math.min(1, rocket.age / rocket.duration);
      var eased = 1 - Math.pow(1 - t, 3);
      rocket.px = rocket.x;
      rocket.py = rocket.y;
      rocket.x = rocket.startX + (rocket.targetX - rocket.startX) * eased +
                 Math.sin(rocket.phase + t * 16) * rocket.sway * Math.sin(Math.PI * t);
      rocket.y = rocket.startY + (rocket.targetY - rocket.startY) * eased;

      // 上昇する光点から短命の火花を2本落とし、ロケット自身の尾を厚くする。
      for (var spark = 0; spark < 2; spark++) {
        addParticle(rocket.x + randomBetween(-1.5, 1.5), rocket.y + 3,
          randomBetween(-.45, .45), randomBetween(.8, 2.1),
          .025 * gravityScale, .965, randomBetween(13, 23), randomBetween(.7, 1.25),
          spark ? '#ffb75e' : '#fff4cf', false, 1.6);
      }

      if (t >= 1) {
        burst(rocket.targetX, rocket.targetY);
        rockets[i] = rockets[rockets.length - 1];
        rockets.pop();
      }
    }
  }

  // ------------------------------------------------------------------
  // 入力・自動打ち上げ
  // ------------------------------------------------------------------
  function pointerPosition(event) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  canvas.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    var point = pointerPosition(event);
    var now = performance.now();
    pointers[event.pointerId] = { x: point.x, y: point.y, nextFire: now + HOLD_INTERVAL };
    canvas.setPointerCapture(event.pointerId);
    noteInteraction(now);
    welcomePending = false;
    hideHint();               // ヒントは本人の初タップまで残す（自動打ち上げでは消さない）
    launch(point.x, point.y);
  });

  canvas.addEventListener('pointermove', function (event) {
    var pointer = pointers[event.pointerId];
    if (!pointer) return;
    var point = pointerPosition(event);
    pointer.x = point.x;
    pointer.y = point.y;
    noteInteraction(performance.now());
  });

  function releasePointer(event) {
    if (!pointers[event.pointerId]) return;
    delete pointers[event.pointerId];
    noteInteraction(performance.now());
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });

  function updateHeldPointers(now) {
    // for-inなら、押されていない大半のフレームで一時配列を作らずに済む。
    for (var pointerId in pointers) {
      var pointer = pointers[pointerId];
      if (now < pointer.nextFire) continue;
      launch(pointer.x, pointer.y);
      pointer.nextFire = now + HOLD_INTERVAL;
      noteInteraction(now);
    }
  }

  function hasActivePointer() {
    for (var pointerId in pointers) return true;
    return false;
  }

  function updateAutoLaunch(now) {
    if (reducedMotion) return;

    if (welcomePending && now - startedAt >= WELCOME_DELAY) {
      welcomePending = false;
      launch(randomBetween(width * .28, width * .72), randomBetween(height * .2, height * .42));
      return;
    }

    if (hasActivePointer() || now - lastInteraction < IDLE_DELAY || now < nextAutoTime) return;
    launch(randomBetween(width * .12, width * .88), randomBetween(height * .14, height * .55));
    nextAutoTime = now + randomBetween(AUTO_MIN_INTERVAL, AUTO_MAX_INTERVAL);
  }

  function handleMotionChange(event) {
    reducedMotion = event.matches;
    if (reducedMotion) {
      welcomePending = false;
    } else {
      lastInteraction = performance.now();
      nextAutoTime = lastInteraction + IDLE_DELAY;
    }
  }

  if (motionQuery.addEventListener) {
    motionQuery.addEventListener('change', handleMotionChange);
  } else if (motionQuery.addListener) {
    motionQuery.addListener(handleMotionChange);
  }

  // ------------------------------------------------------------------
  // 更新と描画
  // ------------------------------------------------------------------
  function updateParticles(step) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var particle = particles[i];
      particle.px = particle.x;
      particle.py = particle.y;
      var dragFactor = Math.pow(particle.drag, step);
      particle.vx *= dragFactor;
      particle.vy = particle.vy * dragFactor + particle.gravity * step;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.life -= step;

      if (particle.life <= 0 || particle.y > height + 60) releaseParticle(i);
    }
  }

  function drawRockets() {
    ctx.lineCap = 'round';
    rockets.forEach(function (rocket) {
      ctx.globalAlpha = .9;
      ctx.strokeStyle = '#fff4cf';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(rocket.px, rocket.py + 7);
      ctx.lineTo(rocket.x, rocket.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rocket.x - 1.5, rocket.y - 1.5, 3, 3);
    });
  }

  function drawFlashes(step) {
    for (var i = flashes.length - 1; i >= 0; i--) {
      var flash = flashes[i];
      flash.life -= step;
      if (flash.life <= 0) {
        flashes[i] = flashes[flashes.length - 1];
        flashes.pop();
        continue;
      }
      var progress = 1 - flash.life / flash.maxLife;
      ctx.globalAlpha = Math.pow(1 - progress, 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, 3 + progress * 19, 0, TAU);
      ctx.fill();
    }
  }

  function drawParticles() {
    ctx.lineCap = 'round';
    for (var i = 0; i < particles.length; i++) {
      var particle = particles[i];
      var ratio = Math.max(0, particle.life / particle.maxLife);
      var alpha = Math.min(1, ratio * 1.65);

      // すべての粒子は末期に微細にちらつく。ラメ型だけはより早く強く点滅する。
      var flickerAt = particle.twinkle ? .62 : .25;
      if (ratio < flickerAt && Math.random() < (particle.twinkle ? .42 : .14)) {
        alpha *= randomBetween(.08, .42);
      }

      ctx.globalAlpha = alpha * .62;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = particle.size * particle.tail;
      ctx.beginPath();
      ctx.moveTo(particle.px, particle.py);
      ctx.lineTo(particle.x, particle.y);
      ctx.stroke();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      var pointSize = Math.max(.75, particle.size * ratio);
      ctx.fillRect(particle.x - pointSize / 2, particle.y - pointSize / 2, pointSize, pointSize);
    }
  }

  function frame(now) {
    var elapsedMs = Math.min(40, Math.max(0, now - lastFrame));
    var step = Math.max(.25, elapsedMs / (1000 / 60));
    lastFrame = now;

    updateHeldPointers(now);
    updateAutoLaunch(now);
    updateRockets(elapsedMs);
    updateParticles(step);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(5, 6, 10, .17)';
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter';
    drawRockets();
    drawFlashes(step);
    drawParticles();

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    window.requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(frame);
})();
