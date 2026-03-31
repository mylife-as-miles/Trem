import * as THREE from 'three';
import { gsap } from 'gsap';

const ACCENT_HEX = 0xd9f85f;
const ACCENT_SOFT_HEX = 0xa4c744;
const COOL_HEX = 0x6c7aff;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function easeInOutCubic(value) {
    return value < 0.5
        ? 4 * value * value * value
        : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function mixStyle(dayHex, nightHex, mix, alpha = 1) {
    const red = Math.round(lerp((dayHex >> 16) & 255, (nightHex >> 16) & 255, mix));
    const green = Math.round(lerp((dayHex >> 8) & 255, (nightHex >> 8) & 255, mix));
    const blue = Math.round(lerp(dayHex & 255, nightHex & 255, mix));
    return alpha >= 1
        ? `rgb(${red}, ${green}, ${blue})`
        : `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
}

function createRoundedRectShape(width, height, radius) {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const safeRadius = Math.min(radius, halfWidth, halfHeight);
    const shape = new THREE.Shape();

    shape.moveTo(-halfWidth + safeRadius, -halfHeight);
    shape.lineTo(halfWidth - safeRadius, -halfHeight);
    shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + safeRadius);
    shape.lineTo(halfWidth, halfHeight - safeRadius);
    shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - safeRadius, halfHeight);
    shape.lineTo(-halfWidth + safeRadius, halfHeight);
    shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - safeRadius);
    shape.lineTo(-halfWidth, -halfHeight + safeRadius);
    shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + safeRadius, -halfHeight);

    return shape;
}

function createRoundedPanelGeometry(width, height, depth = 0.04, radius = 0.14) {
    const geometry = new THREE.ExtrudeGeometry(createRoundedRectShape(width, height, radius), {
        depth,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: radius * 0.12,
        bevelThickness: depth * 0.35,
        curveSegments: 20,
    });

    geometry.center();
    return geometry;
}

function createDiscTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;

    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(255,255,255,0)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = 'rgba(217,248,95,0.09)';
    context.lineWidth = 1;
    const step = 52;
    for (let x = 0; x <= canvas.width; x += step) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvas.height);
        context.stroke();
    }

    for (let y = 0; y <= canvas.height; y += step) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
    }

    context.strokeStyle = 'rgba(255,255,255,0.07)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(canvas.width / 2, canvas.height / 2, 290, Math.PI * 0.18, Math.PI * 0.82);
    context.stroke();

    context.strokeStyle = 'rgba(217,248,95,0.12)';
    context.beginPath();
    context.arc(canvas.width / 2, canvas.height / 2, 390, Math.PI * 0.24, Math.PI * 0.76);
    context.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.2, 1.2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createDisplayTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    return {
        texture,
        render(state) {
            draw(context, width, height, state);
            texture.needsUpdate = true;
        },
    };
}

function drawHeaderChip(context, x, y, label, mix) {
    context.fillStyle = mixStyle(0x1a1d21, 0x0d1118, mix);
    drawRoundedRect(context, x, y, context.measureText(label).width + 28, 28, 14);
    context.fill();

    context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, mix);
    context.beginPath();
    context.arc(x + 15, y + 14, 4, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = mixStyle(0xe7ebf2, 0xf4f8ff, mix);
    context.fillText(label, x + 25, y + 19);
}

function createMonitorUITexture() {
    return createDisplayTexture(1024, 640, (context, width, height, state) => {
        const themeMix = state.themeMix;
        const time = state.time;
        const previewPulse = 0.5 + Math.sin(time * 1.1) * 0.5;
        const playhead = (time * 0.08) % 1;

        context.clearRect(0, 0, width, height);

        const background = context.createLinearGradient(0, 0, width, height);
        background.addColorStop(0, mixStyle(0x0d1015, 0x05070a, themeMix));
        background.addColorStop(1, mixStyle(0x161a22, 0x090d13, themeMix));
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);

        context.fillStyle = mixStyle(0x0f1318, 0x06080c, themeMix);
        context.fillRect(0, 0, width, 52);
        context.fillStyle = mixStyle(0xeceff7, 0xf8fbff, themeMix);
        context.font = '700 18px Inter, sans-serif';
        context.fillText('TREM / EDIT', 28, 32);

        context.font = '500 12px Inter, sans-serif';
        drawHeaderChip(context, 216, 12, 'Cut plan v4', themeMix);
        drawHeaderChip(context, 340, 12, 'Repo synced', themeMix);

        context.fillStyle = mixStyle(0x737c8c, 0x9aa7ba, themeMix);
        context.textAlign = 'right';
        context.fillText('Pass linked to source media', width - 28, 31);
        context.textAlign = 'left';

        context.fillStyle = mixStyle(0x10151a, 0x080b11, themeMix);
        context.fillRect(0, 52, 84, height - 52);
        const navItems = ['ED', 'AI', 'FX', 'AS'];
        navItems.forEach((item, index) => {
            const y = 96 + index * 84;
            context.fillStyle = index === 0
                ? mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix)
                : mixStyle(0x26303b, 0x151c26, themeMix);
            drawRoundedRect(context, 20, y, 44, 44, 12);
            context.fill();
            context.fillStyle = index === 0
                ? mixStyle(0x111113, 0x111113, themeMix)
                : mixStyle(0xb9c2ce, 0xe9eef7, themeMix);
            context.font = '700 14px Inter, sans-serif';
            context.fillText(item, 32, y + 28);
        });

        context.fillStyle = mixStyle(0x161a21, 0x0a0d14, themeMix);
        drawRoundedRect(context, 110, 88, 478, 282, 28);
        context.fill();

        const previewGradient = context.createLinearGradient(110, 88, 588, 370);
        previewGradient.addColorStop(0, mixStyle(0x2e3644, 0x162032, themeMix));
        previewGradient.addColorStop(0.5, mixStyle(0x0d1014, 0x091018, themeMix));
        previewGradient.addColorStop(1, mixStyle(0x171f27, 0x091019, themeMix));
        context.fillStyle = previewGradient;
        drawRoundedRect(context, 128, 106, 442, 246, 22);
        context.fill();

        context.strokeStyle = mixStyle(0x343b47, 0x24324d, themeMix, 0.85);
        context.lineWidth = 1.4;
        context.beginPath();
        context.moveTo(160, 130);
        context.lineTo(278, 310);
        context.lineTo(430, 156);
        context.lineTo(540, 314);
        context.stroke();

        context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix, 0.15 + previewPulse * 0.12);
        drawRoundedRect(context, 200, 164, 164, 94, 24);
        context.fill();

        context.fillStyle = mixStyle(0xf2f6fb, 0xf6fbff, themeMix);
        context.font = '700 28px Inter, sans-serif';
        context.fillText('Edit direction', 148, 145);
        context.font = '500 15px Inter, sans-serif';
        context.fillStyle = mixStyle(0xb7c0cc, 0xc7d4e8, themeMix);
        context.fillText('Auto zoom keyframes staged against clip group A.', 148, 176);
        context.fillText('Trim logic and camera emphasis align to the brief.', 148, 202);

        context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix);
        drawRoundedRect(context, 148, 228, 170, 34, 17);
        context.fill();
        context.fillStyle = mixStyle(0x111113, 0x111113, themeMix);
        context.font = '700 13px Inter, sans-serif';
        context.fillText('Prompt linked to timeline', 168, 249);

        context.fillStyle = mixStyle(0x161a21, 0x0a0d14, themeMix);
        drawRoundedRect(context, 614, 88, 330, 188, 26);
        context.fill();
        context.fillStyle = mixStyle(0xf2f6fb, 0xf6fbff, themeMix);
        context.font = '700 20px Inter, sans-serif';
        context.fillText('Repository signal', 642, 130);
        context.font = '500 14px Inter, sans-serif';
        context.fillStyle = mixStyle(0x9ea8b7, 0xb6c4d9, themeMix);
        context.fillText('28 clips ingested / 6 selects tagged / 4 narrative anchors', 642, 158);

        for (let index = 0; index < 4; index += 1) {
            const blockX = 642 + index * 72;
            const intensity = clamp(0.35 + Math.sin(time * 1.8 + index) * 0.2, 0.1, 0.8);
            context.fillStyle = mixStyle(0x2b313b, 0x1a2434, themeMix);
            drawRoundedRect(context, blockX, 188, 56, 56, 16);
            context.fill();
            context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix, intensity);
            drawRoundedRect(context, blockX + 12, 200, 32, 32, 10);
            context.fill();
        }

        context.fillStyle = mixStyle(0x161a21, 0x0a0d14, themeMix);
        drawRoundedRect(context, 614, 292, 330, 228, 26);
        context.fill();
        context.fillStyle = mixStyle(0xf2f6fb, 0xf6fbff, themeMix);
        context.font = '700 20px Inter, sans-serif';
        context.fillText('Intent stack', 642, 332);

        const intentRows = [
            ['Lead with the close-up', 0.9],
            ['Hold the crowd reaction', 0.63],
            ['Punch the beat on downcut', 0.82],
            ['Keep footage archive-visible', 0.48],
        ];

        intentRows.forEach(([label, amount], index) => {
            const rowY = 364 + index * 40;
            context.fillStyle = mixStyle(0x92a0b1, 0xafc1d8, themeMix);
            context.font = '500 13px Inter, sans-serif';
            context.fillText(label, 642, rowY);

            context.fillStyle = mixStyle(0x212833, 0x111822, themeMix);
            drawRoundedRect(context, 642, rowY + 12, 250, 10, 5);
            context.fill();

            context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix);
            drawRoundedRect(context, 642, rowY + 12, 250 * amount, 10, 5);
            context.fill();
        });

        context.fillStyle = mixStyle(0x161a21, 0x0a0d14, themeMix);
        drawRoundedRect(context, 110, 394, 834, 152, 26);
        context.fill();
        context.fillStyle = mixStyle(0xb9c2ce, 0xe6edf8, themeMix);
        context.font = '600 14px Inter, sans-serif';
        context.fillText('Timeline', 140, 426);

        const trackCount = 3;
        for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
            const trackY = 450 + trackIndex * 28;
            context.fillStyle = mixStyle(0x202733, 0x121926, themeMix);
            drawRoundedRect(context, 140, trackY, 762, 16, 8);
            context.fill();

            for (let clipIndex = 0; clipIndex < 8; clipIndex += 1) {
                const start = 150 + clipIndex * 90 + (trackIndex % 2) * 18;
                const clipWidth = 56 + (clipIndex % 3) * 18;
                const clipMix = 0.18 + Math.max(0, 0.8 - Math.abs(playhead - clipIndex / 7));
                context.fillStyle = clipIndex % 3 === 1
                    ? mixStyle(0x38445a, 0x263c67, themeMix, 0.85)
                    : mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix, clamp(clipMix, 0.18, 1));
                drawRoundedRect(context, start, trackY + 2, clipWidth, 12, 6);
                context.fill();
            }
        }

        const playheadX = 150 + playhead * 730;
        context.strokeStyle = mixStyle(0xf0f5ff, 0xffffff, themeMix, 0.9);
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(playheadX, 438);
        context.lineTo(playheadX, 532);
        context.stroke();

        context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix);
        context.beginPath();
        context.arc(playheadX, 438, 6, 0, Math.PI * 2);
        context.fill();
    });
}

function createWorkspaceTexture(kind) {
    return createDisplayTexture(640, 384, (context, width, height, state) => {
        const themeMix = state.themeMix;
        const time = state.time;
        const sweep = (time * 0.18) % 1;

        context.clearRect(0, 0, width, height);

        const background = context.createLinearGradient(0, 0, width, height);
        background.addColorStop(0, mixStyle(0x0e1116, 0x07090d, themeMix));
        background.addColorStop(1, mixStyle(0x151922, 0x090d13, themeMix));
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);

        context.fillStyle = mixStyle(0xf1f5fb, 0xf8fbff, themeMix);
        context.font = '700 16px Inter, sans-serif';
        context.fillText(kind.toUpperCase(), 34, 42);
        context.font = '500 12px Inter, sans-serif';
        context.fillStyle = mixStyle(0x96a2b0, 0xb1bfd3, themeMix);
        context.fillText('Trem workspace', 34, 66);

        context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix);
        drawRoundedRect(context, width - 132, 24, 96, 28, 14);
        context.fill();
        context.fillStyle = mixStyle(0x111113, 0x111113, themeMix);
        context.font = '700 12px Inter, sans-serif';
        context.fillText('Live', width - 98, 43);

        if (kind === 'edit') {
            context.fillStyle = mixStyle(0x141922, 0x0a0d14, themeMix);
            drawRoundedRect(context, 34, 98, width - 68, 110, 24);
            context.fill();
            context.fillStyle = mixStyle(0xf1f5fb, 0xf8fbff, themeMix);
            context.font = '700 22px Inter, sans-serif';
            context.fillText('Auto zoom pass linked', 58, 138);
            context.font = '500 14px Inter, sans-serif';
            context.fillStyle = mixStyle(0x98a5b4, 0xb4c2d7, themeMix);
            context.fillText('Prompt, reference frame, and cut timing are locked to clip group A.', 58, 168);

            const bars = [0.85, 0.64, 0.92, 0.56];
            bars.forEach((bar, index) => {
                const y = 240 + index * 28;
                context.fillStyle = mixStyle(0x202833, 0x111822, themeMix);
                drawRoundedRect(context, 58, y, 524, 10, 5);
                context.fill();
                context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix);
                drawRoundedRect(context, 58, y, 524 * bar, 10, 5);
                context.fill();
            });
        }

        if (kind === 'create') {
            context.fillStyle = mixStyle(0x141922, 0x0a0d14, themeMix);
            drawRoundedRect(context, 34, 98, width - 68, 242, 24);
            context.fill();

            context.fillStyle = mixStyle(0xf1f5fb, 0xf8fbff, themeMix);
            context.font = '700 22px Inter, sans-serif';
            context.fillText('First-pass structure', 58, 138);
            context.font = '500 14px Inter, sans-serif';
            context.fillStyle = mixStyle(0x98a5b4, 0xb4c2d7, themeMix);
            context.fillText('Collect the opening beat, framing move, and emotional rise.', 58, 168);

            const prompts = ['Open on impact', 'Cut through reaction', 'Hold on release'];
            prompts.forEach((prompt, index) => {
                const x = 58;
                const y = 196 + index * 48;
                context.fillStyle = mixStyle(0x1e2530, 0x131a24, themeMix);
                drawRoundedRect(context, x, y, 264 + index * 44, 34, 17);
                context.fill();
                context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix, index === 1 ? 1 : 0.8);
                context.font = '600 13px Inter, sans-serif';
                context.fillText(prompt, x + 18, y + 22);
            });
        }

        if (kind === 'assets') {
            context.fillStyle = mixStyle(0x141922, 0x0a0d14, themeMix);
            drawRoundedRect(context, 34, 98, width - 68, 242, 24);
            context.fill();

            context.fillStyle = mixStyle(0xf1f5fb, 0xf8fbff, themeMix);
            context.font = '700 22px Inter, sans-serif';
            context.fillText('Source set ready', 58, 138);
            context.font = '500 14px Inter, sans-serif';
            context.fillStyle = mixStyle(0x98a5b4, 0xb4c2d7, themeMix);
            context.fillText('Clips, stills, and audio references staged in one pass.', 58, 168);

            for (let index = 0; index < 6; index += 1) {
                const x = 58 + (index % 3) * 178;
                const y = 194 + Math.floor(index / 3) * 74;
                context.fillStyle = mixStyle(0x202733, 0x111822, themeMix);
                drawRoundedRect(context, x, y, 152, 58, 16);
                context.fill();

                const pulse = 0.28 + Math.max(0, 0.6 - Math.abs(sweep - index / 5));
                context.fillStyle = mixStyle(ACCENT_HEX, ACCENT_HEX, themeMix, clamp(pulse, 0.2, 1));
                drawRoundedRect(context, x + 12, y + 12, 64, 34, 12);
                context.fill();
            }
        }
    });
}

function createConnector(points) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(30));
    const material = new THREE.LineBasicMaterial({
        color: ACCENT_HEX,
        transparent: true,
        opacity: 0.2,
    });

    return new THREE.Line(geometry, material);
}

function createWorkspacePanel(kind, width, height) {
    const shellGeometry = createRoundedPanelGeometry(width, height, 0.055, 0.12);
    const shellMaterial = new THREE.MeshStandardMaterial({
        color: 0x0f1217,
        roughness: 0.18,
        metalness: 0.3,
        emissive: 0x080b10,
        emissiveIntensity: 0.8,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.castShadow = true;
    shell.receiveShadow = true;

    const accentRail = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.34, 0.035, 0.024),
        new THREE.MeshBasicMaterial({
            color: ACCENT_HEX,
            transparent: true,
            opacity: 0.95,
        }),
    );
    accentRail.position.set(-width * 0.19, height * 0.34, 0.05);

    const textureDriver = createWorkspaceTexture(kind);
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.93, height * 0.93),
        new THREE.MeshBasicMaterial({
            map: textureDriver.texture,
            transparent: true,
        }),
    );
    screen.position.z = 0.042;

    const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 1.08, height * 1.08),
        new THREE.MeshBasicMaterial({
            color: ACCENT_HEX,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }),
    );
    glow.position.z = -0.08;

    const frame = new THREE.Group();
    frame.add(glow);
    frame.add(shell);
    frame.add(accentRail);
    frame.add(screen);

    return {
        group: frame,
        screen,
        glow,
        shellMaterial,
        render: textureDriver.render,
    };
}

function getResponsiveOffset(width) {
    if (width < 768) return 0;
    if (width < 1200) return 0.7;
    return 1.25;
}

export function mountTremLandingScene(root, options = {}) {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    root.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        33,
        (root.clientWidth || window.innerWidth) / (root.clientHeight || window.innerHeight),
        0.1,
        60,
    );

    const sceneRig = new THREE.Group();
    scene.add(sceneRig);

    const stageRig = new THREE.Group();
    sceneRig.add(stageRig);

    const desktopOffset = { value: getResponsiveOffset(window.innerWidth) };
    const scrollState = { current: 0, target: 0 };
    const pointerState = {
        currentX: 0,
        currentY: 0,
        targetX: 0,
        targetY: 0,
    };
    const lookTarget = new THREE.Vector3();
    const activeColor = new THREE.Color();

    const motion = {
        panelA: 0,
        panelB: 0,
        panelC: 0,
        pulse: 0.55,
        orbit: 0,
        operatorLean: 0,
        breath: 0,
    };

    const tweens = [
        gsap.to(motion, { panelA: 0.22, duration: 3.1, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
        gsap.to(motion, { panelB: -0.18, duration: 3.8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.4 }),
        gsap.to(motion, { panelC: 0.2, duration: 4.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.2 }),
        gsap.to(motion, { pulse: 1, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
        gsap.to(motion, { orbit: 1, duration: 10, repeat: -1, ease: 'none' }),
        gsap.to(motion, { operatorLean: 1, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
        gsap.to(motion, { breath: 1, duration: 5.2, repeat: -1, yoyo: true, ease: 'sine.inOut' }),
    ];

    const shadowGround = new THREE.Mesh(
        new THREE.CircleGeometry(4.3, 64),
        new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
        }),
    );
    shadowGround.rotation.x = -Math.PI / 2;
    shadowGround.position.y = -1.2;
    shadowGround.scale.set(1.25, 0.8, 1);
    stageRig.add(shadowGround);

    const floorTexture = createFloorTexture();
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshBasicMaterial({
            map: floorTexture,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
        }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    stageRig.add(floor);

    const platformMaterial = new THREE.MeshStandardMaterial({
        color: 0x171a1f,
        roughness: 0.24,
        metalness: 0.55,
        emissive: 0x0b0e12,
        emissiveIntensity: 0.7,
    });
    const platformTrimMaterial = new THREE.MeshStandardMaterial({
        color: 0x1f232b,
        roughness: 0.22,
        metalness: 0.4,
        emissive: 0x13181f,
        emissiveIntensity: 0.75,
    });
    const accentBasicMaterial = new THREE.MeshBasicMaterial({
        color: ACCENT_HEX,
        transparent: true,
        opacity: 0.95,
    });

    const basePlatform = new THREE.Mesh(
        new THREE.CylinderGeometry(2.7, 2.95, 0.42, 64),
        platformMaterial,
    );
    basePlatform.position.y = -1.0;
    basePlatform.receiveShadow = true;
    stageRig.add(basePlatform);

    const topPlatform = new THREE.Mesh(
        new THREE.CylinderGeometry(2.25, 2.4, 0.2, 64),
        platformTrimMaterial,
    );
    topPlatform.position.y = -0.68;
    topPlatform.castShadow = true;
    topPlatform.receiveShadow = true;
    stageRig.add(topPlatform);

    const rimRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.38, 0.028, 12, 120),
        new THREE.MeshBasicMaterial({
            color: ACCENT_HEX,
            transparent: true,
            opacity: 0.75,
        }),
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = -0.57;
    stageRig.add(rimRing);

    const orbitMaterials = [
        new THREE.MeshBasicMaterial({ color: ACCENT_HEX, transparent: true, opacity: 0.22 }),
        new THREE.MeshBasicMaterial({ color: COOL_HEX, transparent: true, opacity: 0.14 }),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 }),
    ];
    const orbitMeshes = [
        new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.016, 10, 140, Math.PI * 1.55), orbitMaterials[0]),
        new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.018, 10, 140, Math.PI * 1.72), orbitMaterials[1]),
        new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.014, 10, 140, Math.PI * 1.4), orbitMaterials[2]),
    ];
    orbitMeshes[0].rotation.set(0.95, 0.15, 0.4);
    orbitMeshes[1].rotation.set(0.42, 0.8, -0.3);
    orbitMeshes[2].rotation.set(1.2, -0.55, 0.2);
    orbitMeshes.forEach((orbit) => {
        orbit.position.y = 0.3;
        stageRig.add(orbit);
    });

    const sweepNode = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 18, 18),
        new THREE.MeshStandardMaterial({
            color: ACCENT_HEX,
            emissive: ACCENT_HEX,
            emissiveIntensity: 1.8,
            roughness: 0.2,
            metalness: 0.05,
        }),
    );
    stageRig.add(sweepNode);

    const deskMaterial = new THREE.MeshStandardMaterial({
        color: 0x12161b,
        roughness: 0.18,
        metalness: 0.42,
        emissive: 0x0d1116,
        emissiveIntensity: 0.65,
    });
    const deskEdgeMaterial = new THREE.MeshStandardMaterial({
        color: 0x1d232b,
        roughness: 0.2,
        metalness: 0.32,
        emissive: 0x11161d,
        emissiveIntensity: 0.7,
    });
    const interfaceMaterial = new THREE.MeshStandardMaterial({
        color: 0x0f1318,
        roughness: 0.15,
        metalness: 0.55,
        emissive: 0x0c1015,
        emissiveIntensity: 0.55,
    });

    const deskGroup = new THREE.Group();
    stageRig.add(deskGroup);

    const deskTop = new THREE.Mesh(createRoundedPanelGeometry(3.25, 1.58, 0.13, 0.18), deskMaterial);
    deskTop.position.set(0, -0.1, 0.08);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    deskGroup.add(deskTop);

    const deskShelf = new THREE.Mesh(createRoundedPanelGeometry(2.4, 0.48, 0.08, 0.14), deskEdgeMaterial);
    deskShelf.position.set(0.16, -0.42, 0.64);
    deskShelf.castShadow = true;
    deskGroup.add(deskShelf);

    const frontAccent = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 0.03, 0.05),
        accentBasicMaterial,
    );
    frontAccent.position.set(0.12, -0.04, 0.84);
    deskGroup.add(frontAccent);

    [-1.18, 1.18].forEach((x) => {
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.11, 1.1, 18),
            deskEdgeMaterial,
        );
        leg.position.set(x, -0.68, 0.1);
        leg.castShadow = true;
        leg.receiveShadow = true;
        deskGroup.add(leg);
    });

    const keyboard = new THREE.Mesh(
        createRoundedPanelGeometry(0.95, 0.28, 0.04, 0.08),
        interfaceMaterial,
    );
    keyboard.position.set(0, 0.04, 0.44);
    keyboard.castShadow = true;
    deskGroup.add(keyboard);

    const trackpad = new THREE.Mesh(
        createRoundedPanelGeometry(0.34, 0.22, 0.03, 0.07),
        interfaceMaterial,
    );
    trackpad.position.set(0.72, 0.02, 0.38);
    deskGroup.add(trackpad);

    const clipBlocks = [];
    for (let index = 0; index < 14; index += 1) {
        const width = 0.09 + (index % 4) * 0.03;
        const clip = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.03, 0.08),
            new THREE.MeshStandardMaterial({
                color: 0x202733,
                roughness: 0.2,
                metalness: 0.35,
                emissive: 0x121822,
                emissiveIntensity: 0.5,
            }),
        );
        clip.position.set(-0.78 + index * 0.125, 0.12, 0.73);
        deskGroup.add(clip);
        clipBlocks.push(clip);
    }

    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(0, 0.7, -0.06);
    stageRig.add(monitorGroup);

    const monitorShell = new THREE.Mesh(
        createRoundedPanelGeometry(1.98, 1.18, 0.12, 0.16),
        interfaceMaterial,
    );
    monitorShell.castShadow = true;
    monitorGroup.add(monitorShell);

    const monitorTexture = createMonitorUITexture();
    const monitorScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.76, 1.0),
        new THREE.MeshBasicMaterial({ map: monitorTexture.texture }),
    );
    monitorScreen.position.z = 0.072;
    monitorGroup.add(monitorScreen);

    const monitorStand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 0.68, 20),
        deskEdgeMaterial,
    );
    monitorStand.position.set(0, -0.74, -0.06);
    monitorStand.castShadow = true;
    monitorGroup.add(monitorStand);

    const standBase = new THREE.Mesh(
        createRoundedPanelGeometry(0.8, 0.24, 0.05, 0.08),
        deskEdgeMaterial,
    );
    standBase.position.set(0, -1.1, 0.08);
    monitorGroup.add(standBase);

    const dataTowers = [];
    for (let index = 0; index < 7; index += 1) {
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.4, 0.08),
            new THREE.MeshStandardMaterial({
                color: 0x1a2029,
                roughness: 0.18,
                metalness: 0.32,
                emissive: 0x111821,
                emissiveIntensity: 0.8,
            }),
        );
        tower.position.set(-0.54 + index * 0.18, -0.16, -0.72);
        tower.castShadow = true;
        stageRig.add(tower);
        dataTowers.push(tower);
    }

    const panelEdit = createWorkspacePanel('edit', 1.52, 0.92);
    panelEdit.group.position.set(-2.08, 1.05, 0.42);
    panelEdit.group.rotation.set(-0.08, 0.55, 0.04);
    stageRig.add(panelEdit.group);

    const panelCreate = createWorkspacePanel('create', 1.38, 0.84);
    panelCreate.group.position.set(0.36, 2.0, -0.48);
    panelCreate.group.rotation.set(-0.36, -0.05, 0.02);
    stageRig.add(panelCreate.group);

    const panelAssets = createWorkspacePanel('assets', 1.48, 0.92);
    panelAssets.group.position.set(2.06, 1.08, 0.18);
    panelAssets.group.rotation.set(-0.1, -0.56, -0.05);
    stageRig.add(panelAssets.group);

    const connectors = [
        createConnector([
            new THREE.Vector3(-0.8, 0.9, 0.05),
            new THREE.Vector3(-1.15, 1.3, 0.15),
            new THREE.Vector3(-1.8, 1.18, 0.32),
        ]),
        createConnector([
            new THREE.Vector3(0.15, 1.18, -0.1),
            new THREE.Vector3(0.2, 1.7, -0.2),
            new THREE.Vector3(0.34, 1.95, -0.42),
        ]),
        createConnector([
            new THREE.Vector3(0.86, 0.85, -0.02),
            new THREE.Vector3(1.4, 1.15, 0.08),
            new THREE.Vector3(1.85, 1.08, 0.16),
        ]),
    ];
    connectors.forEach((connector) => stageRig.add(connector));

    const chairMaterial = new THREE.MeshStandardMaterial({
        color: 0x12161c,
        roughness: 0.55,
        metalness: 0.18,
        emissive: 0x0a0c10,
        emissiveIntensity: 0.45,
    });
    const operatorMaterial = new THREE.MeshStandardMaterial({
        color: 0x1d2229,
        roughness: 0.58,
        metalness: 0.05,
    });
    const operatorAccentMaterial = new THREE.MeshStandardMaterial({
        color: ACCENT_HEX,
        emissive: ACCENT_HEX,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.04,
    });

    const operatorGroup = new THREE.Group();
    operatorGroup.position.set(0.04, -0.06, 0.86);
    stageRig.add(operatorGroup);

    const chairSeat = new THREE.Mesh(createRoundedPanelGeometry(0.72, 0.54, 0.12, 0.1), chairMaterial);
    chairSeat.position.set(0, -0.5, 0);
    operatorGroup.add(chairSeat);

    const chairBack = new THREE.Mesh(createRoundedPanelGeometry(0.68, 0.84, 0.1, 0.12), chairMaterial);
    chairBack.position.set(0, 0.02, -0.26);
    chairBack.rotation.x = -0.08;
    operatorGroup.add(chairBack);

    const operatorTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.46, 8, 16), operatorMaterial);
    operatorTorso.position.set(0, 0.14, 0.02);
    operatorTorso.rotation.x = -0.12;
    operatorGroup.add(operatorTorso);

    const operatorHead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 18), operatorMaterial);
    operatorHead.position.set(0, 0.62, -0.04);
    operatorGroup.add(operatorHead);

    const visor = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.012, 10, 48),
        operatorAccentMaterial,
    );
    visor.position.set(0, 0.62, -0.19);
    visor.rotation.x = Math.PI / 2;
    operatorGroup.add(visor);

    const upperArmGeometry = new THREE.CapsuleGeometry(0.06, 0.26, 6, 12);
    const forearmGeometry = new THREE.CapsuleGeometry(0.05, 0.22, 6, 12);

    const leftUpperArm = new THREE.Mesh(upperArmGeometry, operatorMaterial);
    leftUpperArm.position.set(-0.24, 0.14, 0.02);
    leftUpperArm.rotation.z = 0.8;
    leftUpperArm.rotation.x = -0.12;
    operatorGroup.add(leftUpperArm);

    const rightUpperArm = new THREE.Mesh(upperArmGeometry, operatorMaterial);
    rightUpperArm.position.set(0.24, 0.14, 0.02);
    rightUpperArm.rotation.z = -0.8;
    rightUpperArm.rotation.x = -0.12;
    operatorGroup.add(rightUpperArm);

    const leftForearm = new THREE.Mesh(forearmGeometry, operatorMaterial);
    leftForearm.position.set(-0.42, -0.04, 0.1);
    leftForearm.rotation.z = 1.24;
    leftForearm.rotation.x = -0.24;
    operatorGroup.add(leftForearm);

    const rightForearm = new THREE.Mesh(forearmGeometry, operatorMaterial);
    rightForearm.position.set(0.42, -0.04, 0.1);
    rightForearm.rotation.z = -1.24;
    rightForearm.rotation.x = -0.24;
    operatorGroup.add(rightForearm);

    const legGeometry = new THREE.CapsuleGeometry(0.07, 0.34, 6, 12);
    const leftLeg = new THREE.Mesh(legGeometry, operatorMaterial);
    leftLeg.position.set(-0.12, -0.74, 0.1);
    leftLeg.rotation.x = 1.35;
    leftLeg.rotation.z = 0.18;
    operatorGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, operatorMaterial);
    rightLeg.position.set(0.12, -0.74, 0.1);
    rightLeg.rotation.x = 1.35;
    rightLeg.rotation.z = -0.18;
    operatorGroup.add(rightLeg);

    const discTexture = createDiscTexture();
    const warmHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: discTexture,
            color: 0xffc77a,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }),
    );
    warmHalo.position.set(-0.55, 1.4, -1.35);
    warmHalo.scale.set(3.4, 3.4, 1);
    stageRig.add(warmHalo);

    const accentHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: discTexture,
            color: ACCENT_HEX,
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }),
    );
    accentHalo.position.set(1.35, 1.1, -0.8);
    accentHalo.scale.set(4.2, 4.2, 1);
    stageRig.add(accentHalo);

    const particleCount = 180;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSeeds = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
        const i3 = index * 3;
        particlePositions[i3] = (Math.random() - 0.5) * 6.4;
        particlePositions[i3 + 1] = -0.45 + Math.random() * 3.2;
        particlePositions[i3 + 2] = -2.8 + Math.random() * 4.8;
        particleSeeds[i3] = Math.random() * Math.PI * 2;
        particleSeeds[i3 + 1] = 0.2 + Math.random() * 0.5;
        particleSeeds[i3 + 2] = 0.05 + Math.random() * 0.12;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        map: discTexture,
        color: 0xf9fbff,
        size: 0.07,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    stageRig.add(particles);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.05);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfaf0d8, 2.6);
    keyLight.position.set(4.2, 5.8, 3.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.camera.near = 0.4;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.normalBias = 0.03;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(ACCENT_HEX, 2.4, 8.5);
    rimLight.position.set(2.1, 2.9, 2.2);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xaec5ff, 0.8, 8);
    fillLight.position.set(-3.4, 2.2, 1.8);
    scene.add(fillLight);

    const monitorLight = new THREE.SpotLight(0xcfe2ff, 3.2, 8, Math.PI / 5, 0.7, 1.6);
    monitorLight.position.set(0, 1.85, 1.2);
    monitorLight.target.position.set(0, 0.42, 0);
    stageRig.add(monitorLight);
    stageRig.add(monitorLight.target);

    const accentLight = new THREE.PointLight(ACCENT_HEX, 1.2, 7.5);
    accentLight.position.set(0, 0.4, 1.4);
    stageRig.add(accentLight);

    const sectionStates = [
        {
            rig: { x: desktopOffset.value, y: -0.12, z: 0.1, rx: 0.03, ry: -0.52 },
            camera: { x: -0.5, y: 1.95, z: 6.75 },
            look: { x: desktopOffset.value * 0.72, y: 0.42, z: 0.1 },
        },
        {
            rig: { x: desktopOffset.value * 0.34, y: -0.02, z: -0.12, rx: 0.02, ry: -0.08 },
            camera: { x: -0.08, y: 2.18, z: 6.12 },
            look: { x: 0.2, y: 0.56, z: 0.04 },
        },
        {
            rig: { x: -desktopOffset.value * 0.06, y: -0.22, z: 0.32, rx: 0.08, ry: 0.34 },
            camera: { x: 0.42, y: 1.88, z: 5.62 },
            look: { x: -0.08, y: 0.46, z: 0.24 },
        },
    ];

    function updateSectionStates() {
        const offset = getResponsiveOffset(window.innerWidth);
        desktopOffset.value = offset;
        sectionStates[0].rig.x = offset;
        sectionStates[0].look.x = offset * 0.72;
        sectionStates[1].rig.x = offset * 0.34;
    }

    function applyTheme(mix) {
        ambientLight.intensity = lerp(1.05, 0.74, mix);
        keyLight.color.set(mixStyle(0xf5ebd0, 0x8ea7ff, mix));
        keyLight.intensity = lerp(2.6, 1.25, mix);
        rimLight.intensity = lerp(2.4, 3.4, mix);
        fillLight.intensity = lerp(0.8, 1.05, mix);
        monitorLight.intensity = lerp(3.2, 4.6, mix);
        accentLight.intensity = lerp(1.2, 2.6, mix);
        renderer.toneMappingExposure = lerp(1.15, 1.02, mix);

        platformMaterial.color.set(mixStyle(0x171a1f, 0x10131a, mix));
        platformMaterial.emissive.set(mixStyle(0x0b0e12, 0x121622, mix));
        platformTrimMaterial.color.set(mixStyle(0x1f232b, 0x141a24, mix));
        deskMaterial.color.set(mixStyle(0x12161b, 0x0f1217, mix));
        deskEdgeMaterial.color.set(mixStyle(0x1d232b, 0x141b24, mix));
        interfaceMaterial.color.set(mixStyle(0x0f1318, 0x0b0f14, mix));
        chairMaterial.color.set(mixStyle(0x12161c, 0x0d1015, mix));
        operatorMaterial.color.set(mixStyle(0x1d2229, 0x161b22, mix));
        operatorAccentMaterial.emissiveIntensity = lerp(0.8, 1.4, mix);
        particleMaterial.opacity = lerp(0.35, 0.58, mix);
        particleMaterial.color.set(mixStyle(0xf9fbff, 0xc7d4ff, mix));
        warmHalo.material.opacity = lerp(0.08, 0.02, mix);
        accentHalo.material.opacity = lerp(0.16, 0.28, mix);
        orbitMaterials[0].opacity = lerp(0.22, 0.36, mix);
        orbitMaterials[1].opacity = lerp(0.14, 0.22, mix);
        orbitMaterials[2].opacity = lerp(0.07, 0.1, mix);
    }

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let themeMix = options.getNightMode?.() ? 1 : 0;

    function animate() {
        animationFrame = window.requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();

        scrollState.current += (scrollState.target - scrollState.current) * 0.075;
        pointerState.currentX += (pointerState.targetX - pointerState.currentX) * 0.06;
        pointerState.currentY += (pointerState.targetY - pointerState.currentY) * 0.06;

        const themeTarget = options.getNightMode?.() ? 1 : 0;
        themeMix += (themeTarget - themeMix) * 0.06;
        applyTheme(themeMix);

        const segmentProgress = scrollState.current * (sectionStates.length - 1);
        const sectionIndex = Math.min(Math.floor(segmentProgress), sectionStates.length - 2);
        const localProgress = easeInOutCubic(segmentProgress - sectionIndex);
        const from = sectionStates[sectionIndex];
        const to = sectionStates[sectionIndex + 1];

        const rigTargetX = lerp(from.rig.x, to.rig.x, localProgress);
        const rigTargetY = lerp(from.rig.y, to.rig.y, localProgress);
        const rigTargetZ = lerp(from.rig.z, to.rig.z, localProgress);
        const rigTargetRX = lerp(from.rig.rx, to.rig.rx, localProgress);
        const rigTargetRY = lerp(from.rig.ry, to.rig.ry, localProgress);

        stageRig.position.x += (rigTargetX - stageRig.position.x) * 0.06;
        stageRig.position.y += (rigTargetY - stageRig.position.y) * 0.06;
        stageRig.position.z += (rigTargetZ - stageRig.position.z) * 0.06;
        stageRig.rotation.x += (rigTargetRX - stageRig.rotation.x) * 0.05;
        stageRig.rotation.y += (rigTargetRY - stageRig.rotation.y) * 0.05;

        const cameraTargetX = lerp(from.camera.x, to.camera.x, localProgress) + pointerState.currentX * 0.45;
        const cameraTargetY = lerp(from.camera.y, to.camera.y, localProgress) - pointerState.currentY * 0.18 + motion.breath * 0.06;
        const cameraTargetZ = lerp(from.camera.z, to.camera.z, localProgress);

        camera.position.x += (cameraTargetX - camera.position.x) * 0.06;
        camera.position.y += (cameraTargetY - camera.position.y) * 0.06;
        camera.position.z += (cameraTargetZ - camera.position.z) * 0.06;

        lookTarget.set(
            lerp(from.look.x, to.look.x, localProgress) + pointerState.currentX * 0.12,
            lerp(from.look.y, to.look.y, localProgress) + pointerState.currentY * 0.05,
            lerp(from.look.z, to.look.z, localProgress),
        );
        camera.lookAt(lookTarget);

        orbitMeshes[0].rotation.y += 0.0035;
        orbitMeshes[1].rotation.x += 0.0022;
        orbitMeshes[2].rotation.z += 0.0014;
        rimRing.material.opacity = 0.45 + motion.pulse * 0.3;
        frontAccent.material.opacity = 0.55 + motion.pulse * 0.3;

        const orbitAngle = motion.orbit * Math.PI * 2;
        sweepNode.position.set(
            Math.cos(orbitAngle) * 2.56,
            -0.06 + Math.sin(orbitAngle * 1.7) * 0.22,
            Math.sin(orbitAngle) * 1.45,
        );

        panelEdit.group.position.y = 1.05 + motion.panelA * 0.38;
        panelEdit.group.rotation.z = 0.04 + motion.panelA * 0.1;
        panelCreate.group.position.y = 2 + motion.panelC * 0.28;
        panelCreate.group.rotation.y = motion.panelC * 0.08;
        panelAssets.group.position.y = 1.08 + motion.panelB * 0.34;
        panelAssets.group.rotation.z = -0.05 + motion.panelB * 0.08;

        panelEdit.glow.material.opacity = 0.06 + motion.pulse * 0.08;
        panelCreate.glow.material.opacity = 0.05 + motion.pulse * 0.06;
        panelAssets.glow.material.opacity = 0.05 + motion.pulse * 0.08;

        monitorGroup.rotation.y = Math.sin(elapsed * 0.4) * 0.03;
        monitorGroup.rotation.x = Math.sin(elapsed * 0.28) * 0.02;
        operatorGroup.rotation.y = -0.06 + motion.operatorLean * 0.12;
        operatorHead.rotation.x = -0.04 + motion.operatorLean * 0.08;
        visor.rotation.z = motion.operatorLean * 0.06;

        dataTowers.forEach((tower, index) => {
            const intensity = 0.45 + Math.sin(elapsed * 1.9 + index * 0.5) * 0.25 + motion.pulse * 0.2;
            tower.scale.y = 0.8 + Math.max(0.15, intensity);
            tower.position.y = -0.2 + tower.scale.y * 0.15;
            tower.material.emissiveIntensity = 0.4 + intensity * 0.4;
            activeColor.setHex(index % 2 === 0 ? ACCENT_HEX : ACCENT_SOFT_HEX);
            tower.material.emissive.copy(activeColor);
        });

        clipBlocks.forEach((clip, index) => {
            const progress = index / Math.max(1, clipBlocks.length - 1);
            const distance = Math.abs(progress - motion.orbit);
            const glow = Math.max(0, 1 - distance * 3.2);
            clip.material.emissive.setHex(glow > 0.24 ? ACCENT_HEX : 0x121822);
            clip.material.emissiveIntensity = 0.35 + glow * 1.2;
            clip.scale.y = 1 + glow * 0.65;
        });

        const positions = particleGeometry.attributes.position.array;
        for (let index = 0; index < particleCount; index += 1) {
            const i3 = index * 3;
            positions[i3] += Math.sin(elapsed * particleSeeds[i3 + 1] + particleSeeds[i3]) * 0.0008;
            positions[i3 + 1] += Math.cos(elapsed * particleSeeds[i3 + 2] + particleSeeds[i3]) * 0.0009;
            positions[i3 + 2] += Math.sin(elapsed * particleSeeds[i3 + 2] * 1.6 + particleSeeds[i3]) * 0.0007;
        }
        particleGeometry.attributes.position.needsUpdate = true;

        accentHalo.scale.setScalar(4.1 + motion.pulse * 0.32);
        warmHalo.scale.setScalar(3.3 + Math.sin(elapsed * 0.6) * 0.12);

        monitorTexture.render({ time: elapsed, themeMix });
        panelEdit.render({ time: elapsed, themeMix });
        panelCreate.render({ time: elapsed, themeMix });
        panelAssets.render({ time: elapsed, themeMix });

        renderer.render(scene, camera);
    }

    function updateScrollTarget() {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        scrollState.target = clamp(window.scrollY / maxScroll, 0, 1);
    }

    function handlePointerMove(event) {
        pointerState.targetX = ((event.clientX / window.innerWidth) * 2 - 1) * 0.55;
        pointerState.targetY = ((event.clientY / window.innerHeight) * 2 - 1) * 0.3;
    }

    function handleResize() {
        updateSectionStates();
        const width = root.clientWidth || window.innerWidth;
        const height = root.clientHeight || window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
        updateScrollTarget();
    }

    updateSectionStates();
    updateScrollTarget();
    handleResize();
    animate();

    window.addEventListener('scroll', updateScrollTarget, { passive: true });
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handlePointerMove);

    return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener('scroll', updateScrollTarget);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handlePointerMove);

        tweens.forEach((tween) => tween.kill());

        scene.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }

            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach((material) => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

        discTexture.dispose();
        floorTexture.dispose();
        monitorTexture.texture.dispose();
        panelEdit.screen.material.map.dispose();
        panelCreate.screen.material.map.dispose();
        panelAssets.screen.material.map.dispose();
        renderer.dispose();
        root.replaceChildren();
    };
}
