(() => {
  "use strict";

  const canvas = document.querySelector("#demo-canvas");
  if (!canvas) return;

  const context = canvas.getContext("2d", { alpha: false });
  const stage = canvas.closest(".demo-stage");
  const intro = document.querySelector("[data-demo-intro]");
  const result = document.querySelector("[data-demo-result]");
  const startButton = document.querySelector("[data-demo-start]");
  const replayButton = document.querySelector("[data-demo-replay]");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const soundButton = document.querySelector("[data-sound]");
  const announcer = document.querySelector("[data-demo-announcer]");
  const timeLabel = document.querySelector("[data-demo-time]");
  const healthLabel = document.querySelector("[data-demo-health]");
  const bloodLabel = document.querySelector("[data-demo-blood]");
  const alertLabel = document.querySelector("[data-demo-alert]");
  const healthMeter = document.querySelector("[data-health-meter]");
  const bloodMeter = document.querySelector("[data-blood-meter]");
  const resultKicker = document.querySelector("[data-result-kicker]");
  const resultTitle = document.querySelector("[data-result-title]");
  const resultCopy = document.querySelector("[data-result-copy]");

  const WIDTH = 960;
  const HEIGHT = 540;
  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const colors = {
    ink: "#091016",
    panel: "#14212a",
    line: "#334750",
    mint: "#7cffbf",
    cyan: "#86e7ff",
    coral: "#ff5d42",
    amber: "#ffb35c",
    paper: "#f3ede4",
    skin: "#ad7765",
    skinLight: "#d39a83"
  };

  const obstacles = [
    { type: "rect", x: 112, y: 92, w: 250, h: 80, r: 10, label: "BOOK / COVER", tone: "#283640" },
    { type: "circle", x: 395, y: 366, radius: 72, label: "MUG / COVER", tone: "#34454e" },
    { type: "rect", x: 565, y: 83, w: 168, h: 116, r: 16, label: "PLANTER / COVER", tone: "#24323a" },
    { type: "rect", x: 80, y: 447, w: 300, h: 54, r: 7, label: "COUNTER EDGE", tone: "#1d2931" }
  ];

  const input = {
    keys: new Set(),
    pointerActive: false,
    pointerX: WIDTH / 2,
    pointerY: HEIGHT / 2,
    pointerFeed: false,
    joystickX: 0,
    joystickY: 0,
    touchFeed: false
  };

  const game = {
    state: "attract",
    mode: "blood",
    paused: false,
    inView: false,
    elapsed: 0,
    stateTime: 0,
    countdown: 3,
    duration: 20,
    timeLeft: 20,
    health: 17,
    blood: 0,
    feedProgress: 0,
    feedTarget: { x: 782, y: 352 },
    hunterAlert: 0,
    hunterNextAttack: 1.8,
    attackNumber: 0,
    attack: null,
    armPresence: 0,
    message: "HUNTER ABSENT",
    messageTime: 0,
    shake: 0,
    effects: [],
    particles: [],
    player: {
      x: 265,
      y: 282,
      vx: 0,
      vy: 0,
      z: 0.72,
      angle: 0,
      hidden: false,
      feeding: false
    }
  };

  const view = { scale: 1, offsetX: 0, offsetY: 0 };
  let previousTime = performance.now();
  let audioContext = null;
  let buzzOscillator = null;
  let buzzGain = null;
  let soundEnabled = false;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function easeOutCubic(value) {
    const inverse = 1 - value;
    return 1 - inverse * inverse * inverse;
  }

  function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
    view.scale = Math.min(canvas.width / WIDTH, canvas.height / HEIGHT);
    view.offsetX = (canvas.width - WIDTH * view.scale) / 2;
    view.offsetY = (canvas.height - HEIGHT * view.scale) / 2;
  }

  function pointerToWorld(event) {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: clamp((px - view.offsetX) / view.scale, 0, WIDTH),
      y: clamp((py - view.offsetY) / view.scale, 0, HEIGHT)
    };
  }

  function isControlKey(code) {
    return [
      "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "KeyF", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Escape"
    ].includes(code);
  }

  function resetPlayer() {
    Object.assign(game.player, {
      x: 265,
      y: 282,
      vx: 0,
      vy: 0,
      z: 0.72,
      angle: 0,
      hidden: false,
      feeding: false
    });
  }

  function resetSimulation() {
    game.elapsed = 0;
    game.stateTime = 0;
    game.countdown = 3;
    game.duration = 20;
    game.timeLeft = game.duration;
    game.health = 17;
    game.blood = 0;
    game.feedProgress = 0;
    game.feedTarget = { x: 782, y: 352 };
    game.hunterAlert = 0;
    game.hunterNextAttack = 1.7;
    game.attackNumber = 0;
    game.attack = null;
    game.armPresence = 0;
    game.message = "HUNTER ABSENT";
    game.messageTime = 0;
    game.shake = 0;
    game.effects.length = 0;
    game.particles.length = 0;
    input.pointerActive = false;
    input.pointerFeed = false;
    input.keys.clear();
    resetPlayer();
    updateHud();
  }

  function startRound() {
    resetSimulation();
    game.state = "countdown";
    game.paused = false;
    intro.classList.add("is-hidden");
    result.hidden = true;
    stage.focus({ preventScroll: true });
    announcer.textContent = "Field test countdown started. The hunter is absent for three seconds.";
    if (soundEnabled) {
      ensureAudio();
      playTone(310, 0.08, "square", 0.035);
    }
  }

  function returnToIntro() {
    resetSimulation();
    game.state = "attract";
    game.paused = false;
    intro.classList.remove("is-hidden");
    result.hidden = true;
    updateIntroCopy();
  }

  function activateHunter() {
    game.state = "active";
    game.stateTime = 0;
    game.armPresence = 0;
    game.message = "HUNTER ENTERED";
    game.messageTime = 1.5;
    announcer.textContent = "Go. The hunter has entered the field test.";
    playTone(155, 0.18, "sawtooth", 0.045);
  }

  function finishRound(success, reason) {
    if (game.state === "result") return;
    game.state = "result";
    game.paused = false;
    game.player.feeding = false;
    game.attack = null;
    result.hidden = false;

    if (success) {
      resultKicker.textContent = game.mode === "blood" ? "BLOOD HUNT SAMPLE COMPLETE" : "SURVIVAL SAMPLE COMPLETE";
      resultTitle.textContent = game.mode === "blood" ? "Reservoir filled." : "You lived.";
      resultCopy.textContent = game.mode === "blood"
        ? "Two blood units secured. In the full game, each integrated unit buys thirty more seconds."
        : "Twenty seconds down. The full round has another two minutes and forty seconds to go.";
      announcer.textContent = "Field test complete. Success.";
      playTone(680, 0.11, "sine", 0.04);
      window.setTimeout(() => playTone(910, 0.15, "sine", 0.035), 100);
    } else {
      resultKicker.textContent = reason === "blood" ? "RESERVOIR INCOMPLETE" : "FIELD UNIT LOST";
      resultTitle.textContent = reason === "blood" ? "Still hungry." : "Flattened.";
      resultCopy.textContent = reason === "blood"
        ? "You survived, but failed to collect two units before the sample window closed."
        : "The warning circle is a promise. Break line of sight or leave it before the hand arrives.";
      announcer.textContent = "Field test ended. Try again.";
      playTone(92, 0.34, "sawtooth", 0.06);
    }

    updateHud();
  }

  function updateIntroCopy() {
    const heading = intro.querySelector("h3");
    const copy = intro.querySelector("p");
    if (game.mode === "survival") {
      heading.textContent = "Vanishing is winning.";
      copy.innerHTML = "Survive twenty seconds. Drop low behind clutter to break tracking before the hunter commits to a swat.";
      bloodLabel.textContent = "DISABLED";
    } else {
      heading.textContent = "Blood is time.";
      copy.innerHTML = "Click the red pulse, or enter it and hold <kbd>SPACE</kbd> or <kbd>F</kbd>, to fill two blood units.";
      bloodLabel.textContent = "0 / 2";
    }
  }

  function announceMessage(text, seconds = 1.2) {
    game.message = text;
    game.messageTime = seconds;
  }

  function playerInCover() {
    if (game.player.z > 0.42) return false;
    const x = game.player.x;
    const y = game.player.y;

    return obstacles.some((obstacle) => {
      if (obstacle.type === "circle") {
        return distance(x, y, obstacle.x, obstacle.y) < obstacle.radius + 28;
      }
      return x > obstacle.x - 28 && x < obstacle.x + obstacle.w + 28 && y > obstacle.y - 24 && y < obstacle.y + obstacle.h + 30;
    });
  }

  function feedHeld() {
    return input.keys.has("Space") || input.keys.has("KeyF") || input.pointerFeed || input.touchFeed;
  }

  function updatePlayer(delta) {
    const player = game.player;
    let moveX = 0;
    let moveY = 0;

    if (input.keys.has("KeyA") || input.keys.has("ArrowLeft")) moveX -= 1;
    if (input.keys.has("KeyD") || input.keys.has("ArrowRight")) moveX += 1;
    if (input.keys.has("KeyW") || input.keys.has("ArrowUp")) moveY -= 1;
    if (input.keys.has("KeyS") || input.keys.has("ArrowDown")) moveY += 1;

    moveX += input.joystickX;
    moveY += input.joystickY;
    let magnitude = Math.hypot(moveX, moveY);

    if (magnitude < 0.08 && input.pointerActive) {
      const dx = input.pointerX - player.x;
      const dy = input.pointerY - player.y;
      const pointerDistance = Math.hypot(dx, dy);
      if (pointerDistance > 9) {
        moveX = dx / pointerDistance;
        moveY = dy / pointerDistance;
        magnitude = 1;
      }
    }

    if (magnitude > 1) {
      moveX /= magnitude;
      moveY /= magnitude;
    }

    const boosting = input.keys.has("ShiftLeft") || input.keys.has("ShiftRight");
    const braking = input.keys.has("ControlLeft") || input.keys.has("ControlRight");
    const speed = boosting ? 300 : braking ? 88 : 190;
    const targetVX = moveX * speed;
    const targetVY = moveY * speed;
    const response = 1 - Math.exp(-delta * (braking ? 12 : 8));

    player.vx = lerp(player.vx, targetVX, response);
    player.vy = lerp(player.vy, targetVY, response);

    if (player.feeding) {
      player.vx *= Math.pow(0.02, delta);
      player.vy *= Math.pow(0.02, delta);
    }

    player.x = clamp(player.x + player.vx * delta, 24, WIDTH - 24);
    player.y = clamp(player.y + player.vy * delta, 28, HEIGHT - 26);

    if (Math.hypot(player.vx, player.vy) > 8) {
      player.angle = Math.atan2(player.vy, player.vx);
    }

    const nearFeedTarget = game.mode === "blood" && distance(player.x, player.y, game.feedTarget.x, game.feedTarget.y) < 110;
    const landing = braking || (feedHeld() && nearFeedTarget) || player.feeding;
    const targetAltitude = landing ? 0.16 : boosting ? 0.86 : 0.68;
    player.z = lerp(player.z, targetAltitude, 1 - Math.exp(-delta * (landing ? 8 : 3.5)));
    player.hidden = playerInCover();

    if (boosting && Math.random() < delta * 18) {
      spawnParticle(player.x - Math.cos(player.angle) * 13, player.y - Math.sin(player.angle) * 13, colors.cyan, 0.32, 1.3);
    }
  }

  function updateFeeding(delta) {
    if (game.mode !== "blood" || game.state !== "active") {
      game.player.feeding = false;
      game.feedProgress = Math.max(0, game.feedProgress - delta * 1.6);
      return;
    }

    const nearTarget = distance(game.player.x, game.player.y, game.feedTarget.x, game.feedTarget.y) < 82;
    const attempting = feedHeld();
    game.player.feeding = nearTarget && attempting;

    if (game.player.feeding) {
      const lock = 1 - Math.exp(-delta * 10);
      game.player.x = lerp(game.player.x, game.feedTarget.x, lock);
      game.player.y = lerp(game.player.y, game.feedTarget.y, lock);
      game.player.vx *= Math.pow(0.008, delta);
      game.player.vy *= Math.pow(0.008, delta);
      game.feedProgress += delta / 3;
      game.hunterAlert = clamp(game.hunterAlert + delta * 0.45, 0, 1);
      if (Math.random() < delta * 15) {
        spawnParticle(game.feedTarget.x + (Math.random() - .5) * 22, game.feedTarget.y + (Math.random() - .5) * 12, colors.coral, 0.55, 1.7);
      }

      if (game.feedProgress >= 1) {
        game.feedProgress = 0;
        game.blood += 1;
        input.pointerFeed = false;
        game.feedTarget.y = game.feedTarget.y === 352 ? 374 : 352;
        announceMessage(`BLOOD UNIT ${game.blood} SECURED`, 1.4);
        for (let i = 0; i < 22; i += 1) {
          spawnParticle(game.player.x, game.player.y, colors.coral, .7 + Math.random() * .5, 2.8);
        }
        playTone(430, .13, "triangle", .04);
        if (game.blood >= 2) {
          window.setTimeout(() => finishRound(true), 280);
        }
      }
    } else {
      if (attempting && game.messageTime <= 0.08) announceMessage("FOLLOW THE RED PULSE", 0.75);
      game.feedProgress = Math.max(0, game.feedProgress - delta * 0.55);
    }
  }

  function scheduleAttack() {
    game.attackNumber += 1;
    const charged = game.attackNumber % 4 === 0 || Math.random() < 0.18;
    game.attack = {
      type: charged ? "charged" : "quick",
      x: game.player.x + game.player.vx * (charged ? .42 : .22),
      y: game.player.y + game.player.vy * (charged ? .42 : .22),
      age: 0,
      warning: charged ? 1.08 : .54,
      radius: charged ? 105 : 48,
      resolved: false
    };
    announceMessage(charged ? "CHARGED SWAT INCOMING" : "QUICK SWAT LOCKED", charged ? 1.2 : .72);
    playTone(charged ? 108 : 190, charged ? .18 : .07, "square", charged ? .035 : .022);
  }

  function resolveAttack(attack) {
    attack.resolved = true;
    attack.age = attack.warning;
    game.effects.push({ type: "swat", x: attack.x, y: attack.y, radius: attack.radius, age: 0, life: .38, charged: attack.type === "charged" });
    const hitDistance = distance(game.player.x, game.player.y, attack.x, attack.y);
    const hit = hitDistance < attack.radius * .83 && !game.player.hidden;

    if (hit) {
      const damage = attack.type === "charged" ? 5 : 1;
      game.health = Math.max(0, game.health - damage);
      game.shake = attack.type === "charged" ? 13 : 6;
      const dx = game.player.x - attack.x || 1;
      const dy = game.player.y - attack.y;
      const length = Math.hypot(dx, dy) || 1;
      game.player.vx += (dx / length) * (attack.type === "charged" ? 290 : 150);
      game.player.vy += (dy / length) * (attack.type === "charged" ? 290 : 150);
      stage.classList.remove("is-hit");
      void stage.offsetWidth;
      stage.classList.add("is-hit");
      window.setTimeout(() => stage.classList.remove("is-hit"), 300);
      announceMessage(attack.type === "charged" ? "HEAVY HIT / -5" : "QUICK HIT / -1", 1.1);
      playTone(attack.type === "charged" ? 70 : 115, attack.type === "charged" ? .28 : .13, "sawtooth", .065);
      for (let i = 0; i < 16; i += 1) spawnParticle(game.player.x, game.player.y, colors.coral, .55, 3);
      if (game.health <= 0) {
        window.setTimeout(() => finishRound(false, "health"), 250);
      }
    } else {
      announceMessage(game.player.hidden ? "SIGNAL LOST / COVER" : "NEAR MISS", .8);
      playTone(250, .06, "triangle", .018);
    }
  }

  function updateHunter(delta) {
    if (game.state !== "active") return;

    game.armPresence = lerp(game.armPresence, 1, 1 - Math.exp(-delta * 3.3));
    const hidden = game.player.hidden;
    game.hunterAlert = clamp(game.hunterAlert + delta * (hidden ? -.75 : .24), 0, 1);

    if (game.attack) {
      game.attack.age += delta;
      if (!game.attack.resolved && game.attack.age >= game.attack.warning) resolveAttack(game.attack);
      if (game.attack.resolved && game.attack.age >= game.attack.warning + .4) {
        const charged = game.attack.type === "charged";
        game.attack = null;
        game.hunterNextAttack = charged ? 2.15 : 1.1 + Math.random() * .65;
      }
      return;
    }

    game.hunterNextAttack -= delta;
    if (game.hunterNextAttack <= 0) {
      if (hidden) {
        game.hunterNextAttack = .72;
        announceMessage("HUNTER LOST THE BUZZ", .7);
      } else {
        scheduleAttack();
      }
    }
  }

  function spawnParticle(x, y, color, life = .5, speed = 1) {
    if (game.particles.length > 120) game.particles.shift();
    const angle = Math.random() * TAU;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * (18 + Math.random() * 50) * speed,
      vy: Math.sin(angle) * (18 + Math.random() * 50) * speed,
      color,
      age: 0,
      life,
      size: 1 + Math.random() * 2.4
    });
  }

  function updateEffects(delta) {
    for (const particle of game.particles) {
      particle.age += delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.pow(.1, delta);
      particle.vy *= Math.pow(.1, delta);
    }
    game.particles = game.particles.filter((particle) => particle.age < particle.life);

    for (const effect of game.effects) effect.age += delta;
    game.effects = game.effects.filter((effect) => effect.age < effect.life);
    game.shake = Math.max(0, game.shake - delta * 38);
    game.messageTime = Math.max(0, game.messageTime - delta);
  }

  function update(delta) {
    game.elapsed += delta;
    game.stateTime += delta;

    if (game.state === "attract") {
      game.player.x = 260 + Math.sin(game.elapsed * .72) * 105;
      game.player.y = 285 + Math.sin(game.elapsed * 1.14) * 76;
      game.player.z = .62 + Math.sin(game.elapsed * .8) * .2;
      game.player.angle = Math.atan2(Math.cos(game.elapsed * 1.14) * 86, Math.cos(game.elapsed * .72) * 75);
      game.armPresence = 0;
    } else if (game.state === "countdown") {
      updatePlayer(delta);
      game.countdown -= delta;
      game.message = "HUNTER ABSENT";
      game.messageTime = 1;
      if (game.countdown <= 0) activateHunter();
    } else if (game.state === "active") {
      updatePlayer(delta);
      updateFeeding(delta);
      updateHunter(delta);
      game.timeLeft = Math.max(0, game.timeLeft - delta);
      if (game.timeLeft <= 0) {
        if (game.mode === "survival") finishRound(true);
        else finishRound(game.blood >= 2, "blood");
      }
    }

    updateEffects(delta);
    updateAudio();
    updateHud();
  }

  function drawArena(ctx) {
    const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, "#18252d");
    background.addColorStop(.5, "#101a21");
    background.addColorStop(1, "#0b1218");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalAlpha = .22;
    ctx.strokeStyle = "#50616a";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(134, 231, 255, .055)";
    ctx.font = "900 88px Bahnschrift Condensed, Arial Narrow, sans-serif";
    ctx.fillText("FIELD / 03", 30, 320);

    ctx.fillStyle = "#71818a";
    ctx.font = "700 8px Cascadia Mono, monospace";
    ctx.fillText("TOP-DOWN TELEMETRY // NOT FINAL GAMEPLAY", 25, 27);
    ctx.textAlign = "right";
    ctx.fillText(game.mode === "blood" ? "RULESET / BLOOD HUNT" : "RULESET / SURVIVAL", WIDTH - 25, 27);
    ctx.textAlign = "left";
  }

  function drawArm(ctx) {
    if (game.armPresence < .015 || game.state === "countdown" || game.state === "attract") return;
    const slide = easeOutCubic(game.armPresence);
    ctx.save();
    ctx.translate(1000 - slide * 245, 344);
    ctx.rotate(-.075);
    ctx.shadowColor = "rgba(0, 0, 0, .55)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 18;
    const armGradient = ctx.createLinearGradient(0, 0, 360, 0);
    armGradient.addColorStop(0, colors.skinLight);
    armGradient.addColorStop(1, colors.skin);
    ctx.fillStyle = armGradient;
    roundedRectPath(ctx, -40, -45, 390, 90, 45);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255, 255, 255, .16)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacles(ctx) {
    for (const obstacle of obstacles) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, .65)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 18;
      ctx.shadowOffsetY = 22;
      ctx.fillStyle = obstacle.tone;
      if (obstacle.type === "circle") {
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, TAU);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "#5a6870";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.radius * .63, 0, TAU);
        ctx.strokeStyle = "#18242b";
        ctx.lineWidth = 12;
        ctx.stroke();
      } else {
        roundedRectPath(ctx, obstacle.x, obstacle.y, obstacle.w, obstacle.h, obstacle.r);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "#4b5a63";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "rgba(134, 231, 255, .08)";
        ctx.fillRect(obstacle.x + 10, obstacle.y + 12, Math.max(20, obstacle.w - 20), 3);
      }
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#829097";
      ctx.font = "700 7px Cascadia Mono, monospace";
      if (obstacle.type === "circle") ctx.fillText(obstacle.label, obstacle.x - 42, obstacle.y + 4);
      else ctx.fillText(obstacle.label, obstacle.x + 12, obstacle.y + obstacle.h - 12);
      ctx.restore();
    }
  }

  function drawBiteZone(ctx) {
    if (game.mode !== "blood" || game.state !== "active") return;
    const pulse = .5 + Math.sin(game.elapsed * 5) * .5;
    const target = game.feedTarget;

    ctx.save();
    ctx.globalAlpha = .5 + pulse * .35;
    ctx.strokeStyle = colors.coral;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 42 + pulse * 8, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([4, 5]);
    ctx.globalAlpha = .35;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 68, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = .22;
    ctx.fillStyle = colors.coral;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 25, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffd1c9";
    ctx.font = "700 7px Cascadia Mono, monospace";
    ctx.textAlign = "center";
    const inRange = distance(game.player.x, game.player.y, target.x, target.y) < 82;
    const feedLabel = game.player.feeding ? `FEEDING ${Math.round(game.feedProgress * 100)}%` : inRange ? "CLICK OR HOLD SPACE / F" : "CLICK TO FEED";
    ctx.fillText(feedLabel, target.x, target.y - 55);

    if (game.feedProgress > 0) {
      ctx.strokeStyle = colors.paper;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 54, -Math.PI / 2, -Math.PI / 2 + TAU * game.feedProgress);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "800 8px Cascadia Mono, monospace";
      ctx.fillText(`${Math.round(game.feedProgress * 100)}%`, target.x, target.y + 3);
    }
    ctx.restore();
  }

  function drawAttack(ctx) {
    const attack = game.attack;
    if (!attack) return;

    const warningProgress = clamp(attack.age / attack.warning, 0, 1);
    if (!attack.resolved) {
      const blink = .55 + Math.sin(game.elapsed * (attack.type === "charged" ? 15 : 25)) * .25;
      ctx.save();
      ctx.strokeStyle = attack.type === "charged" ? colors.coral : colors.amber;
      ctx.fillStyle = attack.type === "charged" ? "rgba(255, 93, 66, .12)" : "rgba(255, 179, 92, .1)";
      ctx.lineWidth = attack.type === "charged" ? 5 : 3;
      ctx.globalAlpha = blink;
      ctx.beginPath();
      ctx.arc(attack.x, attack.y, attack.radius * lerp(1.25, 1, warningProgress), 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(attack.x - attack.radius - 12, attack.y);
      ctx.lineTo(attack.x + attack.radius + 12, attack.y);
      ctx.moveTo(attack.x, attack.y - attack.radius - 12);
      ctx.lineTo(attack.x, attack.y + attack.radius + 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = attack.type === "charged" ? colors.coral : colors.amber;
      ctx.font = "800 9px Cascadia Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(attack.type === "charged" ? "CHARGED SWAT" : "QUICK SWAT", attack.x, attack.y - attack.radius - 18);
      ctx.restore();
    }
  }

  function drawEffects(ctx) {
    for (const effect of game.effects) {
      const progress = effect.age / effect.life;
      const opacity = 1 - progress;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.rotate(-.25 + progress * .22);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = effect.charged ? colors.skinLight : colors.skin;
      ctx.shadowColor = colors.coral;
      ctx.shadowBlur = effect.charged ? 30 : 12;
      roundedRectPath(ctx, -effect.radius * 1.15, -effect.radius * .36, effect.radius * 2.3, effect.radius * .72, effect.radius * .34);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(255, 255, 255, .38)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    for (const particle of game.particles) {
      const opacity = 1 - particle.age / particle.life;
      context.globalAlpha = opacity;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * opacity, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawMosquito(ctx) {
    const player = game.player;
    const scale = .78 + player.z * .33;
    const wing = Math.sin(game.elapsed * 38) * .38;

    ctx.save();
    ctx.globalAlpha = .18 + (1 - player.z) * .2;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(player.x + 5, player.y + 10 + player.z * 17, 15 * scale, 7 * scale, player.angle, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (player.hidden) {
      ctx.save();
      ctx.strokeStyle = colors.mint;
      ctx.globalAlpha = .65;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(player.x, player.y, 27, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(134, 231, 255, .58)";
    ctx.strokeStyle = "rgba(185, 244, 255, .85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-2, -9, 14, 5 + Math.abs(wing) * 3, -.45 - wing, 0, TAU);
    ctx.ellipse(-2, 9, 14, 5 + Math.abs(wing) * 3, .45 + wing, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#141414";
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 2, side * 4);
        ctx.lineTo(-7 + i * 5, side * 14);
        ctx.lineTo(-13 + i * 4, side * 18);
        ctx.stroke();
      }
    }

    const bodyGradient = ctx.createLinearGradient(-15, 0, 15, 0);
    bodyGradient.addColorStop(0, "#5c1415");
    bodyGradient.addColorStop(.55, colors.coral);
    bodyGradient.addColorStop(1, "#1b1213");
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(-4, 0, 13, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#171a1c";
    ctx.beginPath();
    ctx.arc(10, 0, 5.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#d7dde0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    ctx.restore();

    const flightStatus = player.feeding ? "FEEDING" : player.hidden ? "HIDDEN" : player.z < 0.36 ? "LANDED" : "FLYING";
    ctx.fillStyle = player.feeding ? colors.coral : player.hidden ? colors.cyan : colors.mint;
    ctx.font = "700 7px Cascadia Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(flightStatus, player.x, player.y - 27 - player.z * 7);

    if (player.feeding) {
      ctx.save();
      ctx.strokeStyle = colors.coral;
      ctx.lineWidth = 2;
      ctx.globalAlpha = .65 + Math.sin(game.elapsed * 14) * .25;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(game.feedTarget.x, game.feedTarget.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGameOverlay(ctx) {
    ctx.textAlign = "left";
    if (game.messageTime > 0) {
      ctx.fillStyle = game.message.includes("HIT") || game.message.includes("SWAT") ? colors.coral : colors.mint;
      ctx.font = "800 11px Cascadia Mono, monospace";
      ctx.fillText(game.message, 25, 52);
    }

    if (game.state === "countdown") {
      const number = Math.max(1, Math.ceil(game.countdown));
      ctx.save();
      ctx.fillStyle = "rgba(9, 12, 15, .46)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      ctx.fillStyle = colors.mint;
      ctx.font = "900 145px/1 Bahnschrift Condensed, Arial Narrow, sans-serif";
      ctx.fillText(String(number), WIDTH / 2, HEIGHT / 2 + 38);
      ctx.fillStyle = "#fff";
      ctx.font = "800 11px Cascadia Mono, monospace";
      ctx.fillText("HUNTER NOT IN ARENA", WIDTH / 2, HEIGHT / 2 + 75);
      ctx.restore();
    }

    if (game.paused && (game.state === "active" || game.state === "countdown")) {
      ctx.save();
      ctx.fillStyle = "rgba(9, 12, 15, .78)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "900 72px Bahnschrift Condensed, Arial Narrow, sans-serif";
      ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2);
      ctx.fillStyle = colors.mint;
      ctx.font = "800 9px Cascadia Mono, monospace";
      ctx.fillText("TAP OR PRESS ESC TO RESUME", WIDTH / 2, HEIGHT / 2 + 34);
      ctx.restore();
    }
  }

  function render() {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#05080a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

    const shakeX = game.shake > 0 ? (Math.random() - .5) * game.shake : 0;
    const shakeY = game.shake > 0 ? (Math.random() - .5) * game.shake : 0;
    context.save();
    context.translate(shakeX, shakeY);
    drawArena(context);
    drawArm(context);
    drawObstacles(context);
    drawBiteZone(context);
    drawAttack(context);
    drawEffects(context);
    drawMosquito(context);
    drawGameOverlay(context);
    context.restore();
  }

  function formatTime(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    return `00:${String(whole).padStart(2, "0")}`;
  }

  function updateHud() {
    timeLabel.textContent = formatTime(game.timeLeft);
    healthLabel.textContent = `${game.health} / 17`;
    healthMeter.style.transform = `scaleX(${game.health / 17})`;
    bloodLabel.textContent = game.mode === "blood" ? `${game.blood} / 2` : "DISABLED";
    bloodMeter.style.width = `${game.mode === "blood" ? clamp((game.blood + game.feedProgress) / 2, 0, 1) * 100 : 0}%`;

    if (game.state === "attract" || game.state === "countdown") {
      alertLabel.textContent = "ABSENT";
      alertLabel.style.color = colors.mint;
    } else if (game.player.hidden) {
      alertLabel.textContent = "SIGNAL LOST";
      alertLabel.style.color = colors.cyan;
    } else if (game.attack) {
      alertLabel.textContent = game.attack.type === "charged" ? "CHARGING" : "LOCKED";
      alertLabel.style.color = colors.coral;
    } else {
      alertLabel.textContent = game.hunterAlert > .66 ? "TRACKING" : "SEARCHING";
      alertLabel.style.color = game.hunterAlert > .66 ? colors.amber : "#ffffff";
    }
  }

  function ensureAudio() {
    if (audioContext) {
      if (audioContext.state === "suspended") audioContext.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext = new AudioCtor();
    buzzOscillator = audioContext.createOscillator();
    buzzGain = audioContext.createGain();
    buzzOscillator.type = "sawtooth";
    buzzOscillator.frequency.value = 430;
    buzzGain.gain.value = 0;
    buzzOscillator.connect(buzzGain).connect(audioContext.destination);
    buzzOscillator.start();
  }

  function playTone(frequency, duration, type = "sine", volume = .03) {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function updateAudio() {
    if (!buzzGain || !audioContext) return;
    const active = soundEnabled && !game.paused && !document.hidden && (game.state === "active" || game.state === "countdown");
    const targetGain = active ? (game.player.feeding ? .006 : .011) : 0;
    const frequency = game.player.feeding ? 170 : 400 + game.player.z * 120;
    buzzGain.gain.setTargetAtTime(targetGain, audioContext.currentTime, .05);
    buzzOscillator.frequency.setTargetAtTime(frequency, audioContext.currentTime, .04);
  }

  function setSound(enabled) {
    soundEnabled = enabled;
    soundButton.setAttribute("aria-pressed", String(enabled));
    soundButton.setAttribute("aria-label", enabled ? "Turn demo sound off" : "Turn demo sound on");
    soundButton.querySelector("span").textContent = enabled ? "SOUND / ON" : "SOUND / OFF";
    if (enabled) {
      ensureAudio();
      playTone(430, .08, "triangle", .025);
    }
    updateAudio();
  }

  function frame(now) {
    const rawDelta = (now - previousTime) / 1000;
    previousTime = now;
    const delta = clamp(rawDelta, 0, .04);
    if (game.inView) {
      if (!game.paused && !document.hidden) update(delta);
      render();
    }
    window.requestAnimationFrame(frame);
  }

  function clearInput() {
    input.keys.clear();
    input.pointerFeed = false;
    input.joystickX = 0;
    input.joystickY = 0;
    input.touchFeed = false;
  }

  function setPaused(paused, message = paused ? "Field test paused." : "Field test resumed.") {
    game.paused = paused;
    clearInput();
    announcer.textContent = message;
    updateAudio();
  }

  startButton.addEventListener("click", startRound);
  replayButton.addEventListener("click", startRound);
  soundButton.addEventListener("click", () => setSound(!soundEnabled));

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      game.mode = button.dataset.mode;
      modeButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      returnToIntro();
    });
  }

  function applyStagePointer(event) {
    if (game.state !== "active" && game.state !== "countdown") return;
    stage.focus({ preventScroll: true });
    if (game.paused) {
      setPaused(false);
      return;
    }
    const point = pointerToWorld(event);
    input.pointerX = point.x;
    input.pointerY = point.y;
    const canvasInput = !event.target.closest?.(".touch-controls");
    input.pointerActive = canvasInput;
    input.pointerFeed = canvasInput && game.mode === "blood" && distance(point.x, point.y, game.feedTarget.x, game.feedTarget.y) < 105;
    if (input.pointerFeed) announcer.textContent = "Bite zone selected. Approaching to feed.";
  }

  stage.addEventListener("pointerdown", applyStagePointer);
  stage.addEventListener("click", applyStagePointer);

  stage.addEventListener("pointermove", (event) => {
    if (game.state !== "active" && game.state !== "countdown") return;
    if (event.pointerType === "touch") return;
    const point = pointerToWorld(event);
    input.pointerX = point.x;
    input.pointerY = point.y;
    input.pointerActive = true;
  });

  stage.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch" && !input.pointerFeed) input.pointerActive = false;
  });

  window.addEventListener("keydown", (event) => {
    if (!isControlKey(event.code)) return;
    if (event.code === "Escape" && (game.state === "active" || game.state === "countdown")) {
      event.preventDefault();
      setPaused(!game.paused);
      return;
    }
    if (document.activeElement !== stage) return;
    event.preventDefault();
    input.keys.add(event.code);
    input.pointerActive = false;
  });

  window.addEventListener("keyup", (event) => {
    input.keys.delete(event.code);
  });

  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => {
    clearInput();
    if (document.hidden && (game.state === "active" || game.state === "countdown")) {
      setPaused(true, "Field test paused while this tab was hidden. Tap the arena or press Escape to resume.");
    } else {
      updateAudio();
    }
    previousTime = performance.now();
  });

  const stick = document.querySelector("[data-stick]");
  const stickKnob = document.querySelector("[data-stick-knob]");
  let stickPointer = null;

  function updateStick(event) {
    const rect = stick.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const radius = rect.width * .34;
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    input.joystickX = x / radius;
    input.joystickY = y / radius;
    stickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  stick.addEventListener("pointerdown", (event) => {
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateStick(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickPointer) updateStick(event);
  });

  function releaseStick(event) {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    input.joystickX = 0;
    input.joystickY = 0;
    stickKnob.style.transform = "translate(-50%, -50%)";
  }
  stick.addEventListener("pointerup", releaseStick);
  stick.addEventListener("pointercancel", releaseStick);

  for (const button of document.querySelectorAll("[data-touch-action]")) {
    const setAction = (value) => {
      input.touchFeed = value;
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setAction(true);
    });
    button.addEventListener("pointerup", () => setAction(false));
    button.addEventListener("pointercancel", () => setAction(false));
  }

  if ("ResizeObserver" in window) new ResizeObserver(resizeCanvas).observe(stage);
  else window.addEventListener("resize", resizeCanvas);

  updateIntroCopy();
  resizeCanvas();
  resetSimulation();
  if (reducedMotion) game.player.z = .7;

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      game.inView = entry.isIntersecting;
      if (!game.inView && !game.paused && (game.state === "active" || game.state === "countdown")) {
        setPaused(true, "Field test paused while the arena is offscreen. Tap the arena or press Escape to resume.");
      }
      previousTime = performance.now();
    }, { rootMargin: "120px 0px", threshold: 0 }).observe(stage);
  } else {
    game.inView = true;
  }

  window.requestAnimationFrame(frame);
})();
