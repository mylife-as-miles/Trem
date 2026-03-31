import * as THREE from 'three';

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

export function mountTremLandingScene(container, options = {}) {
    if (!container) {
        return () => {};
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0.2, 4.7, 5.5);
    camera.lookAt(0, 1.55, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const sceneGroup = new THREE.Group();
    sceneGroup.position.set(-0.2, -0.35, 1.1);
    sceneGroup.rotation.y = -0.35;
    scene.add(sceneGroup);

    const materials = {
        desk: new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.3, metalness: 0.05 }),
        deskDark: new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.32, metalness: 0.12 }),
        screen: new THREE.MeshStandardMaterial({ color: 0x18181f, roughness: 0.1, metalness: 0.45 }),
        screenGlow: new THREE.MeshStandardMaterial({ color: 0x23242a, emissive: 0x273044, emissiveIntensity: 0.2, roughness: 0.1 }),
        skin: new THREE.MeshStandardMaterial({ color: 0xe0b99a, roughness: 0.6 }),
        hair: new THREE.MeshStandardMaterial({ color: 0x5d4c3d, roughness: 0.9 }),
        shirt: new THREE.MeshStandardMaterial({ color: 0xf0ebe4, roughness: 0.65 }),
        pants: new THREE.MeshStandardMaterial({ color: 0x3d3a35, roughness: 0.82 }),
        chair: new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.6 }),
        plant: new THREE.MeshStandardMaterial({ color: 0x6b8f5e, roughness: 0.7 }),
        plantDark: new THREE.MeshStandardMaterial({ color: 0x4a6e3e, roughness: 0.78 }),
        pot: new THREE.MeshStandardMaterial({ color: 0x7a756e, roughness: 0.8 }),
        lamp: new THREE.MeshStandardMaterial({ color: 0xd5d0c8, roughness: 0.3, metalness: 0.2 }),
        platform: new THREE.MeshStandardMaterial({ color: 0xbdb5a7, roughness: 0.45, metalness: 0.06 }),
        platformTop: new THREE.MeshStandardMaterial({ color: 0xcfc6b7, roughness: 0.38, metalness: 0.04 }),
        glow: new THREE.MeshStandardMaterial({
            color: 0xd0c8b8,
            emissive: 0xd0c8b8,
            emissiveIntensity: 0.18,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
        }),
    };

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.92 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    sceneGroup.add(floor);

    const platform = new THREE.Group();
    const platformBase = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.2, 0.28, 64), materials.platform);
    platformBase.position.y = 0.15;
    platformBase.receiveShadow = true;
    platform.add(platformBase);

    const platformTop = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.85, 0.14, 64), materials.platformTop);
    platformTop.position.y = 0.36;
    platformTop.receiveShadow = true;
    platform.add(platformTop);

    const glowRing = new THREE.Mesh(new THREE.RingGeometry(2.66, 2.76, 64), materials.glow);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.31;
    platform.add(glowRing);
    sceneGroup.add(platform);

    const deskGroup = new THREE.Group();
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.08), materials.desk);
    deskTop.position.set(0, 1.3, 0);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    deskGroup.add(deskTop);

    const legGeometry = new THREE.BoxGeometry(0.06, 0.84, 0.06);
    [[-1.14, 0.87, -0.44], [1.14, 0.87, -0.44], [-1.14, 0.87, 0.44], [1.14, 0.87, 0.44]].forEach((position) => {
        const leg = new THREE.Mesh(legGeometry, materials.deskDark);
        leg.position.set(...position);
        leg.castShadow = true;
        deskGroup.add(leg);
    });

    deskGroup.scale.set(1, 1.28, 1);
    sceneGroup.add(deskGroup);

    const keyboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.03, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x45403a, roughness: 0.55 }),
    );
    keyboard.position.set(0.02, 1.34, 0.18);
    keyboard.castShadow = true;
    deskGroup.add(keyboard);

    const mouse = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.035, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xe4ddd2, roughness: 0.35 }),
    );
    mouse.position.set(0.72, 1.34, 0.22);
    mouse.castShadow = true;
    deskGroup.add(mouse);

    const mug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.08, 0.18, 16),
        new THREE.MeshStandardMaterial({ color: 0xf0ebe4, roughness: 0.4 }),
    );
    mug.position.set(0.96, 1.42, 0.18);
    mug.castShadow = true;
    deskGroup.add(mug);

    const monitorGroup = new THREE.Group();
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.72, 0.06), materials.screen);
    monitor.position.set(0, 2.2, -0.28);
    monitor.castShadow = true;
    monitorGroup.add(monitor);

    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.62), materials.screenGlow);
    screenFace.position.set(0, 2.2, -0.245);
    monitorGroup.add(screenFace);

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 768;
    screenCanvas.height = 432;
    const screenContext = screenCanvas.getContext('2d');
    const screenTexture = new THREE.CanvasTexture(screenCanvas);

    const screenPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.02, 0.58),
        new THREE.MeshBasicMaterial({ map: screenTexture }),
    );
    screenPlane.position.set(0, 2.2, -0.238);
    monitorGroup.add(screenPlane);

    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), materials.deskDark);
    stand.position.set(0, 1.74, -0.28);
    monitorGroup.add(stand);

    const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 18), materials.deskDark);
    standBase.position.set(0, 1.56, -0.28);
    monitorGroup.add(standBase);
    sceneGroup.add(monitorGroup);

    const lampGroup = new THREE.Group();
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 18), materials.lamp);
    lampBase.position.set(0.92, 1.66, -0.22);
    lampGroup.add(lampBase);

    const lampArmA = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.48, 10), materials.lamp);
    lampArmA.position.set(0.92, 1.95, -0.22);
    lampArmA.rotation.z = 0.18;
    lampGroup.add(lampArmA);

    const lampArmB = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.38, 10), materials.lamp);
    lampArmB.position.set(0.84, 2.24, -0.18);
    lampArmB.rotation.z = -0.65;
    lampGroup.add(lampArmB);

    const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.16, 16), materials.lamp);
    lampHead.position.set(0.99, 2.37, -0.08);
    lampHead.rotation.set(2.35, 0.2, -2.15);
    lampGroup.add(lampHead);

    const lampBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 12),
        new THREE.MeshStandardMaterial({
            color: 0xffeba6,
            emissive: 0xffcc55,
            emissiveIntensity: 0,
            transparent: true,
            opacity: 0,
        }),
    );
    lampBulb.position.set(0.96, 2.3, -0.02);
    lampGroup.add(lampBulb);
    sceneGroup.add(lampGroup);

    const chairGroup = new THREE.Group();
    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.48), materials.chair);
    chairSeat.position.set(0, 1.08, 0.62);
    chairSeat.castShadow = true;
    chairGroup.add(chairSeat);

    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.08), materials.chair);
    chairBack.position.set(0, 1.45, 0.82);
    chairBack.castShadow = true;
    chairGroup.add(chairBack);

    const chairPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.48, 12),
        new THREE.MeshStandardMaterial({ color: 0x67625d, metalness: 0.35, roughness: 0.35 }),
    );
    chairPole.position.set(0, 0.79, 0.62);
    chairGroup.add(chairPole);
    chairGroup.scale.setScalar(1.15);
    sceneGroup.add(chairGroup);

    const personGroup = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.28), materials.shirt);
    torso.position.set(0, 1.52, 0.54);
    torso.castShadow = true;
    personGroup.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 18), materials.skin);
    head.position.set(0, 1.9, 0.46);
    head.rotation.set(0.7, 0.28, 0);
    head.castShadow = true;
    personGroup.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 18), materials.hair);
    hair.position.set(0, 1.94, 0.49);
    hair.scale.set(1, 1.08, 0.9);
    personGroup.add(hair);

    const leftUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), materials.shirt);
    leftUpperArm.position.set(-0.28, 1.44, 0.43);
    leftUpperArm.rotation.z = -0.12;
    personGroup.add(leftUpperArm);

    const rightUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), materials.shirt);
    rightUpperArm.position.set(0.28, 1.47, 0.44);
    rightUpperArm.rotation.z = 0.1;
    personGroup.add(rightUpperArm);

    const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), materials.skin);
    leftForearm.position.set(-0.27, 1.31, 0.23);
    leftForearm.rotation.x = -1.05;
    personGroup.add(leftForearm);

    const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), materials.skin);
    rightForearm.position.set(0.27, 1.31, 0.21);
    rightForearm.rotation.x = -1.08;
    personGroup.add(rightForearm);

    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), materials.skin);
    leftHand.position.set(-0.25, 1.25, 0.06);
    personGroup.add(leftHand);

    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), materials.skin);
    rightHand.position.set(0.25, 1.24, 0.05);
    personGroup.add(rightHand);

    const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.4), materials.pants);
    leftThigh.position.set(-0.12, 1.1, 0.48);
    personGroup.add(leftThigh);

    const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.4), materials.pants);
    rightThigh.position.set(0.12, 1.1, 0.48);
    personGroup.add(rightThigh);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.13), materials.pants);
    leftLeg.position.set(-0.12, 0.82, 0.31);
    personGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.13), materials.pants);
    rightLeg.position.set(0.12, 0.82, 0.31);
    personGroup.add(rightLeg);
    personGroup.scale.setScalar(1.2);
    sceneGroup.add(personGroup);

    function createPlant(x, z, scale) {
        const group = new THREE.Group();
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.08 * scale, 0.15 * scale, 16), materials.pot);
        pot.position.y = 0.08 * scale;
        group.add(pot);

        for (let i = 0; i < 6; i += 1) {
            const leaf = new THREE.Mesh(
                new THREE.PlaneGeometry(0.16 * scale, 0.38 * scale),
                i % 2 === 0 ? materials.plant : materials.plantDark,
            );
            const angle = (i / 6) * Math.PI * 2;
            leaf.position.set(Math.sin(angle) * 0.05 * scale, 0.3 * scale, Math.cos(angle) * 0.05 * scale);
            leaf.rotation.y = angle;
            leaf.rotation.x = -0.45;
            group.add(leaf);
        }

        group.position.set(x, 0.47, z);
        return group;
    }

    const plants = [
        createPlant(-1.6, 0.32, 1.6),
        createPlant(1.55, 0.5, 1.4),
        createPlant(1.35, -0.48, 0.85),
        createPlant(-0.86, 1.58, 0.5),
    ];
    plants.forEach((plant) => sceneGroup.add(plant));

    const ambient = new THREE.AmbientLight(0xc8c0b0, 0.62);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe8e0d4, 0x8a8378, 0.42);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.8);
    keyLight.position.set(2.2, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 16;
    scene.add(keyLight);

    const screenLight = new THREE.PointLight(0xdce7ff, 1.35, 4.5);
    screenLight.position.set(0, 2.15, 0.05);
    sceneGroup.add(screenLight);

    const fillLight = new THREE.PointLight(0xd8d0c0, 0.52, 8);
    fillLight.position.set(-3, 3, 2);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xd0c8b8, 0.45, 6);
    rimLight.position.set(0, 2, -3);
    scene.add(rimLight);

    const lampLight = new THREE.PointLight(0xffd98f, 0.85, 3.4);
    lampLight.position.set(0.95, 2.25, -0.05);
    sceneGroup.add(lampLight);

    const scrollStates = [
        { x: -0.2, y: -0.35, z: 1.1, rotY: -0.35, camX: 0.2, camY: 4.7, camZ: 5.5, lookY: 1.5 },
        { x: -2.3, y: -0.4, z: 1.2, rotY: -1.7, camX: -2.8, camY: 2.2, camZ: 5.8, lookY: 1.7 },
        { x: 2.8, y: -0.42, z: -0.5, rotY: 1.2, camX: 3.2, camY: 6.3, camZ: 3.4, lookY: 1.1 },
    ];

    const pointer = { x: 0, y: 0 };
    const parallax = { x: 0, y: 0 };

    const handleMouseMove = (event) => {
        const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
        const normalizedY = (event.clientY / window.innerHeight) * 2 - 1;
        pointer.x = -normalizedX * 0.12;
        pointer.y = -normalizedY * 0.05;
    };

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };

    function getScrollProgress() {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) {
            return 0;
        }
        return window.scrollY / docHeight;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function updateScreen(time) {
        if (!screenContext) {
            return;
        }

        const ctx = screenContext;
        const width = screenCanvas.width;
        const height = screenCanvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#0f1117';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#161a24';
        ctx.fillRect(0, 0, width, 54);
        ctx.fillStyle = '#f5f7ff';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillText('Trem Edit', 28, 34);

        ctx.fillStyle = '#8fa0c7';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('Repository / campaign-hero-v2', width - 240, 34);

        drawRoundedRect(ctx, 24, 76, 320, 104, 18);
        ctx.fillStyle = '#121722';
        ctx.fill();
        ctx.fillStyle = '#8594b7';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText('Current brief', 44, 104);
        ctx.fillStyle = '#f0f4ff';
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.fillText('Tighten the opener and', 44, 140);
        ctx.fillText('add rhythmic caption beats.', 44, 172);

        drawRoundedRect(ctx, 366, 76, 378, 104, 18);
        ctx.fillStyle = '#121722';
        ctx.fill();
        ctx.fillStyle = '#8594b7';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText('Execution status', 386, 104);

        const phases = [
            { label: 'Prompt parsed', x: 388 },
            { label: 'Shot logic', x: 502 },
            { label: 'Asset references', x: 604 },
        ];

        phases.forEach((phase, index) => {
            ctx.fillStyle = index < 2 ? '#d9f85f' : '#2d354a';
            ctx.beginPath();
            ctx.arc(phase.x, 138, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = index < 2 ? '#dce6a5' : '#7f89a7';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(phase.label, phase.x + 16, 142);
        });

        drawRoundedRect(ctx, 24, 206, 720, 178, 20);
        ctx.fillStyle = '#121722';
        ctx.fill();
        ctx.fillStyle = '#8594b7';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText('Timeline pass', 44, 236);

        const playhead = 50 + (Math.sin(time * 0.4) * 0.5 + 0.5) * 620;
        ctx.fillStyle = '#232b3d';
        ctx.fillRect(44, 252, 680, 8);
        ctx.fillStyle = '#d9f85f';
        ctx.fillRect(44, 252, 380, 8);
        ctx.fillStyle = '#d9f85f';
        ctx.fillRect(playhead, 242, 3, 30);

        const clips = [
            { x: 44, y: 290, w: 146, label: 'Hook' },
            { x: 200, y: 290, w: 124, label: 'B-roll stack' },
            { x: 334, y: 290, w: 174, label: 'Caption burst' },
            { x: 518, y: 290, w: 126, label: 'Beat sync' },
        ];
        clips.forEach((clip, index) => {
            drawRoundedRect(ctx, clip.x, clip.y, clip.w, 48, 12);
            ctx.fillStyle = index % 2 === 0 ? '#222c41' : '#1c2436';
            ctx.fill();
            ctx.fillStyle = '#eef3ff';
            ctx.font = '13px Inter, sans-serif';
            ctx.fillText(clip.label, clip.x + 16, clip.y + 29);
        });

        ctx.fillStyle = '#8594b7';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('Next move: ease the first transition, then bring captions in 6 frames earlier.', 44, 364);

        screenTexture.needsUpdate = true;
    }

    function applyTheme(mix) {
        const day = {
            ambient: 0.62,
            hemi: 0.42,
            key: 1.8,
            screen: 1.35,
            fill: 0.52,
            rim: 0.45,
            lamp: 0.85,
            glow: 0.18,
            exposure: 1,
        };
        const night = {
            ambient: 0.24,
            hemi: 0.16,
            key: 0.52,
            screen: 2.25,
            fill: 0.18,
            rim: 0.95,
            lamp: 2.1,
            glow: 0.6,
            exposure: 1.03,
        };

        ambient.intensity = lerp(day.ambient, night.ambient, mix);
        hemi.intensity = lerp(day.hemi, night.hemi, mix);
        keyLight.intensity = lerp(day.key, night.key, mix);
        screenLight.intensity = lerp(day.screen, night.screen, mix);
        fillLight.intensity = lerp(day.fill, night.fill, mix);
        rimLight.intensity = lerp(day.rim, night.rim, mix);
        lampLight.intensity = lerp(day.lamp, night.lamp, mix);
        glowRing.material.emissiveIntensity = lerp(day.glow, night.glow, mix);
        lampBulb.material.emissiveIntensity = lerp(0, 2.8, mix);
        lampBulb.material.opacity = lerp(0, 0.95, mix);
        screenFace.material.emissiveIntensity = lerp(0.2, 1.2, mix);
        materials.skin.color.lerpColors(new THREE.Color(0xe0b99a), new THREE.Color(0xb0a8c0), mix * 0.35);
        renderer.toneMappingExposure = lerp(day.exposure, night.exposure, mix);
    }

    let animationFrame = 0;
    const clock = new THREE.Clock();
    let themeMix = 0;

    const animate = () => {
        animationFrame = window.requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();
        const progress = getScrollProgress();

        const sectionProgress = progress * (scrollStates.length - 1);
        const currentIndex = Math.min(Math.floor(sectionProgress), scrollStates.length - 2);
        const localT = sectionProgress - currentIndex;
        const eased = localT < 0.5
            ? 4 * localT * localT * localT
            : 1 - Math.pow(-2 * localT + 2, 3) / 2;

        const from = scrollStates[currentIndex];
        const to = scrollStates[currentIndex + 1];

        sceneGroup.position.x += (lerp(from.x, to.x, eased) - sceneGroup.position.x) * 0.05;
        sceneGroup.position.y += (lerp(from.y, to.y, eased) - sceneGroup.position.y) * 0.05;
        sceneGroup.position.z += (lerp(from.z, to.z, eased) - sceneGroup.position.z) * 0.05;
        sceneGroup.rotation.y += (lerp(from.rotY, to.rotY, eased) - sceneGroup.rotation.y) * 0.05;

        parallax.x += (pointer.x - parallax.x) * 0.08;
        parallax.y += (pointer.y - parallax.y) * 0.08;

        camera.position.x += (lerp(from.camX, to.camX, eased) + parallax.x - camera.position.x) * 0.05;
        camera.position.y += (lerp(from.camY, to.camY, eased) + parallax.y - camera.position.y) * 0.05;
        camera.position.z += (lerp(from.camZ, to.camZ, eased) - camera.position.z) * 0.05;
        camera.lookAt(sceneGroup.position.x * 0.3 + parallax.x * 0.25, lerp(from.lookY, to.lookY, eased), 0);

        torso.position.y = 1.52 + Math.sin(elapsed * 1.5) * 0.006;
        head.position.y = 1.9 + Math.sin(elapsed * 1.5) * 0.006;
        head.rotation.x = 0.7 + Math.sin(elapsed * 0.5) * 0.04;
        head.rotation.y = 0.28 + Math.sin(elapsed * 0.4) * 0.05;

        const typingLeft = Math.sin(elapsed * 8) * 0.018;
        const typingRight = Math.sin(elapsed * 8 + Math.PI) * 0.018;
        leftForearm.position.y = 1.31 + typingLeft;
        rightForearm.position.y = 1.31 + typingRight;
        leftHand.position.y = 1.25 + typingLeft * 1.4;
        rightHand.position.y = 1.24 + typingRight * 1.4;

        plants.forEach((plant, index) => {
            plant.rotation.z = Math.sin(elapsed * 0.5 + index) * 0.02;
        });

        screenLight.intensity += Math.sin(elapsed * 2.5) * 0.015;
        updateScreen(elapsed);

        const targetTheme = options.getNightMode?.() ? 1 : 0;
        themeMix += (targetTheme - themeMix) * 0.06;
        applyTheme(themeMix);

        renderer.render(scene, camera);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);
    animate();

    return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', handleResize);
        container.innerHTML = '';
        renderer.dispose();
        scene.traverse((object) => {
            if (object.isMesh) {
                object.geometry?.dispose?.();
                if (Array.isArray(object.material)) {
                    object.material.forEach((material) => material.dispose?.());
                } else {
                    object.material?.dispose?.();
                }
            }
        });
        screenTexture.dispose();
    };
}
