// Free-pose editor: one VNCCS MakeHuman mannequin. Editing uses a free orbit view;
// the output is the VNCCS capture from the shot set in 拍摄镜头（默认正面 yaw 0 / pitch 0，
// 白底 + 平面白光），which is what the VNCCS_QI2_PoseStudio LoRA was trained on.
import { PoseViewerCore } from '../vnccs/vnccs_pose_studio_core.mjs';
import { loadMorphPack, solveMorph, buildStaticModelData } from '../vnccs/vnccs_pose_morph_runtime.mjs';
import { HAND_PRESETS } from '../vnccs/vnccs_hand_presets.mjs';
import { readSkeletonImage } from './pose-import.mjs';
import { liftOpenPose, WORLD_KEYPOINT_NAMES } from './openpose-lift.mjs';
// 常用姿势（与上游 Fisher-Pose 同源）：写的是肢体方向而不是固定坐标，任何体型都能套
import { COMMON_POSES, directionKeypoints } from './common-poses.mjs';

const $ = selector => document.querySelector(selector);
const embedded = new URLSearchParams(location.search).has('embedded');
const INSTRUCTION = 'Draw character from image2';
// 拍摄镜头：相机绕人物转，人本身不转身。yaw 正 = 看到人物左侧，pitch 正 = 俯拍
const DEFAULT_CAMERA = { yaw: 0, pitch: 0 };
const cameraOf = () => doc.camera || DEFAULT_CAMERA;
// viewer 的 pitchDeg 正数其实是仰拍，界面这里正数取俯拍，所以传参取反
const shotArgs = (width = doc.width, height = doc.height) => {
    const cam = cameraOf();
    return [width, height, 1, 0, 0, cam.yaw, -cam.pitch];
};
const CAPTURE_BACKGROUND = [255, 255, 255];
const CAPTURE_LIGHTS = [{ type: 'ambient', color: '#ffffff', intensity: 1.0 }];
const DEFAULT_MESH = { age: 25, gender: 0.5, weight: 0.5, muscle: 0.5, height: 0.5, breast_size: 0, firmness: 0.5, show_genitals: false };
const BODY_SLIDERS = [
    ['gender', '性别（女 ← → 男）', 0, 1, 0.01], ['age', '年龄', 1, 90, 1], ['height', '身高', 0, 1, 0.01],
    ['weight', '体重', 0, 1, 0.01], ['muscle', '肌肉', 0, 1, 0.01],
];
const NEUTRAL_TRANSFORM = { x: 0, y: 0, z: 0, zoom: 1 };
// Head / neck / torso / limb proportions as scale factors (1 = MakeHuman default).
const PROPORTIONS = [
    ['head', '头部大小', 0.75, 1.3], ['neck', '脖子长度', 0.5, 2],
    ['shoulder', '肩宽', 0.7, 1.4], ['spine', '躯干长度', 0.7, 1.4],
    ['upper_arm', '上臂长度', 0.6, 1.6], ['forearm', '小臂长度', 0.6, 1.6],
    ['thigh', '大腿长度', 0.6, 1.6], ['shin', '小腿长度', 0.6, 1.6],
];
const DEFAULT_PROPORTIONS = Object.fromEntries(PROPORTIONS.map(([key]) => [key, 1]));
// VNCCS bone-length groups (both sides together); the core maps a group value v to scale 0.5 + v.
const PROPORTION_GROUPS = {
    shoulder: ['shoulder_l', 'shoulder_r'], spine: ['spine'],
    upper_arm: ['upper_arm_l', 'upper_arm_r'], forearm: ['forearm_l', 'forearm_r'],
    thigh: ['thigh_l', 'thigh_r'], shin: ['shin_l', 'shin_r'],
};
// Our 2D joint names → MakeHuman bones whose head sits on that joint.
const JOINT_BONES = { ls: 'upperarm_l', le: 'lowerarm_l', lw: 'hand_l', rs: 'upperarm_r', re: 'lowerarm_r', rw: 'hand_r', lh: 'thigh_l', lk: 'calf_l', la: 'foot_l', rh: 'thigh_r', rk: 'calf_r', ra: 'foot_r' };
// The MakeHuman body pack ships uncompressed: cloud drives (网盘) delete archive files such as the
// upstream .bin.gz, which left the editor stuck on loading. The .gz is only a fallback for old copies;
// the VNCCS loader accepts both (it checks the gzip magic bytes).
const BODY_PACK_URLS = ['pose_studio_makehuman.v2.bin', 'pose_studio_makehuman.v2.bin.gz'].map(name => new URL(`../vnccs/assets/${name}`, import.meta.url));

async function loadBodyPack() {
    for (const url of BODY_PACK_URLS) {
        try { return await loadMorphPack(url); } catch { /* missing or truncated: try the next copy */ }
    }
    throw new Error('人体数据文件缺失或不完整（web/vnccs/assets/pose_studio_makehuman.v2.bin，约 86MB）。可能被网盘删除或没下载完整，请从 GitHub 重新下载插件：github.com/Work-Fisher/ComfyUI-Fisher-Pose');
}

let doc = { mesh: { ...DEFAULT_MESH }, proportions: { ...DEFAULT_PROPORTIONS }, pose: null, transform: { ...NEUTRAL_TRANSFORM }, width: 1024, height: 1024, openpose: null, camera: { ...DEFAULT_CAMERA } };
let extraPrompt = '';
let pack = null;
let ready = false;
let selectedBoneName = null;
let previewTimer = null;
let morphTimer = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round16 = value => clamp(Math.round(value / 16) * 16, 64, 4096);
const promptText = () => [INSTRUCTION, ...extraPrompt.split('\n').map(line => line.trim())].filter(Boolean).join('\n');

function toast(text) {
    const element = $('#toast');
    element.textContent = text;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 2400);
}

const canvas = $('#viewport-canvas');
const stage = $('#stage');
canvas.width = stage.clientWidth || 800;
canvas.height = stage.clientHeight || 600;

// ===== 橙框（输出画面）里的「叠加图」：图1 或手动选的背景图，只用于对位 =====
// 做法：贴一张图在输出画面那个平面（core 的 captureFrame，位置按橙框缩放）上，再把它整体推到
// 人偶之后（见 overlayPlaneTarget）。放进 three 的 layer 1：编辑视角相机开了 layer 1 → 橙框里看得见；
// 出图用的 captureCamera 没开 → 人偶图里没有它（保持白底）。
const OVERLAY_LAYER = 1;
const overlay = { url: '', kind: '', image1Url: '', opacity: 0.45, plane: null, token: 0, on: false };
try {
    const saved = Number(localStorage.getItem('freepose.overlayOpacity'));
    if (saved > 0.05 && saved <= 1) overlay.opacity = saved;
} catch { /* 隐私模式下读不到 */ }

const viewer = new PoseViewerCore(canvas, {
    skinMode: 'naked',
    enableTextureSkinning: true,
    showSkeletonHelper: true,
    showCaptureFrame: true,
    syncMode: 'end',
    useHandControlPopover: false,
    captureHistoryContext: () => ({ transform: { ...doc.transform } }),
    onHistoryRestore: pose => {
        if (pose.editorState) {
            doc.transform = { ...pose.editorState.transform };
            viewer.setActiveCharacterAppearance({ transform: doc.transform });
            updateCamera(false);
        }
        refreshControls();
    },
    onBoneSelectionChange: ({ boneName }) => { selectedBoneName = boneName; refreshBoneSliders(); },
    onPoseChange: () => { refreshControls(); schedulePreview(); },
    // 橙框/机位一变（含动画过渡的每一帧），叠加图跟着走
    onViewportRender: () => syncOverlayFrame(),
});
viewer.maxHistory = 60; // match the studio editor; VNCCS keeps only 10

function modelData(morph, staticData) {
    const bones = staticData.bones.map((bone, index) => {
        const headPos = Array.from(morph.bonePositions.subarray(index * 6, index * 6 + 3));
        const tailPos = Array.from(morph.bonePositions.subarray(index * 6 + 3, index * 6 + 6));
        return { name: bone.name, parent: bone.parent || null, headPos, tailPos, length: Math.hypot(...tailPos.map((v, i) => v - headPos[i])) };
    });
    return {
        vertices: morph.vertices, uvs: staticData.uvs, indices: staticData.indices, bones,
        skinIndices: staticData.skinIndices, skinWeights: staticData.skinWeights,
        landmarks: morph.landmarks || {}, landmark_indices: morph.landmarkIndices || {},
    };
}

// Absolute IK positions depend on bone lengths, so a body-shape change keeps only rotations.
function rotationsOnly(pose) {
    const { bonePositions, ikEffectorPositions, poleTargetPositions, hipBonePosition, camera, cameraParams, ...rest } = pose || {};
    return rest;
}

function savedPose() {
    const { camera, cameraParams, ...pose } = viewer.getPose();
    return pose;
}

// The core has no neck group, so the neck scales the head bone's offset from neck_01
// the same way its limb groups scale child offsets, and caches it as the new rest.
function applyNeck() {
    viewer._setBoneOffsetScale('head', doc.proportions.neck);
    for (const bone of viewer.boneList) bone.updateMatrixWorld(true);
    viewer.skeleton?.update();
    viewer._cacheShapedRestBonePositions(['head']);
    viewer.updateIKEffectorPositions?.();
    viewer.requestRender();
}

function setProportion(key, value) {
    doc.proportions = { ...doc.proportions, [key]: value };
    if (key === 'head') viewer.updateHeadScale(value);
    else if (key === 'neck') applyNeck();
    else for (const group of PROPORTION_GROUPS[key]) viewer.updateBoneLengthScale(group, value - 0.5);
    // 比例被改过（手动拖或摆姿时自动匹配）就不再等于存下来的那份身材，去掉高亮
    if (activeShapeName) { activeShapeName = null; renderShapes(); }
}

// resetPose() restores the core's own groups but not our neck offset.
function resetPose() {
    viewer.resetPose();
    applyNeck();
}

function loadModel(pose) {
    const morph = solveMorph(pack, doc.mesh);
    viewer.setSkinMode('naked');
    // loadData() applies these cached scales while it builds the new rig.
    viewer.headScale = doc.proportions.head;
    viewer.boneLengthParams = {
        ...viewer.boneLengthParams,
        ...Object.fromEntries(Object.entries(PROPORTION_GROUPS).flatMap(([key, groups]) => groups.map(group => [group, doc.proportions[key] - 0.5]))),
    };
    viewer.loadData(modelData(morph, buildStaticModelData(pack, morph.includeGenitals)), true);
    applyNeck();
    viewer.updateLights(CAPTURE_LIGHTS);
    if (pose) viewer.setPose(pose, true);
    viewer.setActiveCharacterAppearance({ color: '#ffffff', transform: doc.transform });
}

// The capture camera is the shot: `snap` also brings the free editing view back to it.
function updateCamera(snap) {
    const args = shotArgs();
    if (snap) viewer.snapToCaptureCamera(...args);
    else viewer.updateCaptureCamera(...args);
    syncOverlayFrame(); // 橙框动过 → 叠加图跟着走
    refreshControls();
    schedulePreview();
}

// ===== 橙框里的叠加图（只用于对位，不进人偶图）=====
function ensureOverlayPlane() {
    const THREE = viewer.THREE;
    if (!THREE || !viewer.scene || !viewer.camera) return null;
    if (!overlay.plane) {
        const mesh = new THREE.Mesh(
            // captureFrame 是 (-1,-1)~(1,1) 的单位框，等比缩放后就是橙框本身
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: overlay.opacity, depthWrite: false, side: THREE.DoubleSide }),
        );
        mesh.renderOrder = -1;              // 透明队列里排在最前（天幕是 -1000，在它之前）
        mesh.layers.set(OVERLAY_LAYER);     // 只有编辑视角相机看得到（captureCamera 看不到）
        mesh.visible = false;
        viewer.camera.layers.enable(OVERLAY_LAYER);
        viewer.scene.add(mesh);
        overlay.plane = mesh;
    }
    return overlay.plane;
}

// 叠加图平面该落在哪：橙框那个平面沿视线推到「整个人偶之后」。
// 原因：平面是透明材质，透明队列永远排在所有不透明物体（人偶）之后绘制，而橙框平面正好切在
// 人偶身上 —— 靠后的那半边人偶会被照片盖住（看着"人偶不全"）。推到人偶之后，人偶写好的深度
// 就会把照片挡回去，人偶始终完整；照片只在人偶轮廓之外可见，对位照样准。
// 投影不变：绕相机做等比缩放（沿相机→橙框中心的射线平移 dist→dist+push，同时把平面放大同倍）。
const overlayTargets = { position: null, scale: null, boneTemp: null, dir: null, toFrame: null };
function overlayPlaneTarget() {
    const THREE = viewer.THREE;
    const cam = viewer.camera;
    const frame = viewer.captureFrame;
    if (!THREE || !cam || !frame) return null;
    if (!overlayTargets.position) {
        overlayTargets.position = new THREE.Vector3();
        overlayTargets.scale = new THREE.Vector3();
        overlayTargets.boneTemp = new THREE.Vector3();
        overlayTargets.dir = new THREE.Vector3();
        overlayTargets.toFrame = new THREE.Vector3();
    }
    const { position, scale, boneTemp, dir, toFrame } = overlayTargets;
    toFrame.copy(frame.position).sub(cam.position);
    const dist = toFrame.length() || 1;
    dir.copy(toFrame).divideScalar(dist); // 相机 → 橙框中心 的单位方向
    // 沿视线最靠后的骨节：骨节在皮下，再留 1.5 就足以盖住整个人偶
    let maxD = dist;
    for (const bone of viewer.boneList || []) {
        if (!bone) continue;
        boneTemp.setFromMatrixPosition(bone.matrixWorld).sub(cam.position);
        maxD = Math.max(maxD, boneTemp.dot(dir));
    }
    const push = clamp(maxD + 1.5 - dist, 0.5, 500);
    const far = dist + push;
    position.copy(cam.position).addScaledVector(dir, far);
    scale.copy(frame.scale).multiplyScalar(far / dist);
    return overlayTargets;
}

function syncOverlayFrame() {
    const plane = overlay.plane;
    const frame = viewer.captureFrame;
    if (!plane || !frame) return;
    viewer.camera?.layers?.enable(OVERLAY_LAYER); // 相机若被重建也要保持可见（幂等）
    const target = overlayPlaneTarget();
    if (!target) return;
    const moved = plane.position.distanceToSquared(target.position) > 1e-8
        || Math.abs(plane.quaternion.dot(frame.quaternion)) < 0.999999
        || Math.abs(plane.scale.x - target.scale.x) > 1e-6
        || Math.abs(plane.scale.y - target.scale.y) > 1e-6;
    plane.position.copy(target.position);
    plane.quaternion.copy(frame.quaternion);
    plane.scale.copy(target.scale);
    const visible = overlay.on && !!plane.material.map;
    const visibleChanged = plane.visible !== visible;
    plane.visible = visible;
    // onViewportRender 是先渲染后回调：这一帧变了就再画一帧，免得叠加图比人偶慢一拍
    if (overlay.on && (moved || visibleChanged)) viewer.requestRender();
}

function refreshOverlayUI() {
    const button = $('#overlay-image1');
    if (button) {
        button.hidden = !overlay.image1Url && overlay.kind !== 'image1';
        button.classList.toggle('fp-chip-on', overlay.on && overlay.kind === 'image1');
        button.title = overlay.image1Url
            ? '把节点上的图1 半透明叠在橙框里，方便对着真人调姿势与位置（只用于对位，不会进人偶图）'
            : '节点上还没有拿到图1（图1 为空或未绑定）';
    }
    const clear = $('#overlay-clear');
    if (clear) clear.hidden = !overlay.on;
    const opacity = $('#overlay-opacity');
    if (opacity && Math.abs(Number(opacity.value) - overlay.opacity) > 0.001) opacity.value = String(overlay.opacity);
    const label = $('.stage-label');
    if (label) label.innerHTML = overlay.on
        ? `<i></i>橙框 = 输出画面 · 叠加图只用于对位，不进人偶图`
        : `<i></i>橙框 = 输出画面`;
}

// 换叠加图：url 为空 = 关掉。kind: 'image1'（节点图1）/ 'file'（手动选的背景图）
function setOverlaySource(url, kind) {
    const previous = overlay.url;
    if (previous && previous.startsWith('blob:') && previous !== url) {
        try { URL.revokeObjectURL(previous); } catch { /* 已失效 */ }
    }
    overlay.url = url || '';
    overlay.kind = overlay.url ? (kind || 'file') : '';
    overlay.on = !!overlay.url;
    const plane = ensureOverlayPlane();
    if (!overlay.on) {
        overlay.token += 1; // 作废还在加载中的那张
        if (plane) {
            plane.visible = false;
            plane.material.map?.dispose();
            plane.material.map = null;
            plane.material.needsUpdate = true;
        }
        refreshOverlayUI();
        viewer.requestRender();
        return;
    }
    if (!plane) { refreshOverlayUI(); return; }
    const THREE = viewer.THREE;
    const token = ++overlay.token;
    new THREE.TextureLoader().load(overlay.url, texture => {
        if (token !== overlay.token || !overlay.plane) { texture.dispose(); return; }
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
        overlay.plane.material.map?.dispose();
        overlay.plane.material.map = texture;
        overlay.plane.material.opacity = overlay.opacity;
        overlay.plane.material.needsUpdate = true;
        syncOverlayFrame();
        viewer.requestRender();
    }, undefined, () => toast('叠加图读取失败'));
    refreshOverlayUI();
}

function fitFrame(snap = false) {
    viewer.setActiveCharacterAppearance({ transform: NEUTRAL_TRANSFORM });
    const cam = cameraOf();
    const framing = viewer.computeModelFitFraming(doc.width, doc.height, cam.yaw, -cam.pitch, 0.08);
    const pivot = viewer.sceneCameraTarget;
    if (framing && pivot) {
        const zoom = framing.zoom;
        doc.transform = {
            x: clamp((1 - zoom) * pivot.x + zoom * framing.offsetX, -50, 50),
            y: clamp((1 - zoom) * pivot.y + zoom * framing.offsetY, -50, 50),
            z: clamp((1 - zoom) * pivot.z, -40, 40),
            zoom,
        };
    }
    viewer.setActiveCharacterAppearance({ transform: doc.transform });
    updateCamera(snap);
}

function capture(width, height) {
    viewer.updateLights(CAPTURE_LIGHTS);
    const cam = cameraOf();
    return viewer.capture(width, height, 1, CAPTURE_BACKGROUND, 0, 0, cam.yaw, -cam.pitch);
}

function schedulePreview() {
    if (!ready) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
        await viewer.waitForCaptureReady();
        const scale = Math.min(1, 480 / Math.max(doc.width, doc.height));
        const url = capture(Math.round(doc.width * scale), Math.round(doc.height * scale));
        if (url) { $('#capture-preview').src = url; $('#inset-preview').src = url; }
    }, 300);
}

// --- OpenPose one-click posing ---------------------------------------------

const worldOf = name => viewer.bones[name].getWorldPosition(new viewer.THREE.Vector3()).toArray();

function restJoints() {
    const rest = Object.fromEntries(Object.entries(JOINT_BONES).map(([key, bone]) => [key, worldOf(bone)]));
    rest.neck = rest.ls.map((v, i) => (v + rest.rs[i]) / 2);
    rest.hipMid = rest.lh.map((v, i) => (v + rest.rh[i]) / 2);
    return { rest, head: worldOf('head'), pelvis: worldOf('pelvis') };
}

// 回到中立构图与站姿，再把人偶 IK 到 build(rest, head) 返回的关键点（相对髋中点）。
// 骨架图导入和常用姿势共用这一段；返回 build 带出来的额外信息（如 facingAway）。
function importKeypoints(build) {
    viewer.recordState();
    doc.transform = { ...NEUTRAL_TRANSFORM };
    viewer.setActiveCharacterAppearance({ transform: doc.transform });
    resetPose();
    viewer.skinnedMesh.updateMatrixWorld(true);
    const { rest, head, pelvis } = restJoints();
    const { kps, ...extra } = build(rest, head);
    const THREE = viewer.THREE;
    const worldKps = Object.fromEntries(Object.entries(WORLD_KEYPOINT_NAMES).map(([key, name]) => [name, new THREE.Vector3(...kps[key].map((v, i) => v + pelvis[i]))]));
    // Hip sockets, head, hands and feet have no reliable 2D source; keep the mannequin's own.
    viewer.applyWorldKeypointImport(worldKps, { drawFigure: false, placeHipRoots: false, alignHead: false, alignHands: false, alignFeet: false, dispatchPoseChange: false });
    return extra;
}

function applyOpenPose() {
    const { points, flips } = doc.openpose;
    const { facingAway } = importKeypoints((rest, head) => {
        const lifted = liftOpenPose(points, rest, flips);
        // The spine IK target is the head bone origin, not the nose: keep the nose direction at head-bone distance.
        const headDistance = Math.hypot(...head.map((v, i) => v - rest.neck[i]));
        const direction = lifted.kps.head.map((v, i) => v - lifted.kps.neck[i]);
        const norm = Math.hypot(...direction) || 1;
        lifted.kps.head = lifted.kps.neck.map((v, i) => v + direction[i] / norm * headDistance);
        return lifted;
    });
    fitFrame(true);
    refreshFlips(facingAway);
    // 头部朝向上一次，且必须在脊柱 IK 之后：它要按摆完的脖子姿态补差值
    applyHeadOrientation(facingAway);
    return facingAway;
}

// 常用姿势：只写了肢体方向，靠当前人偶的骨长解算，所以什么身材/比例都能套上去
function applyCommonPose(entry) {
    const status = $('#import-status');
    try {
        importKeypoints((rest, head) => ({ kps: directionKeypoints(entry.spec, rest, head) }));
        // 部分常用姿势带转身（如侧身站 / 背面站立）：转的是人偶本身，和右侧「整体转身」一致
        if (entry.spec.turn) viewer.setModelRotation(0, entry.spec.turn, 0);
        doc.openpose = null; // 不是骨架图来的：深度修正与头部朝向无从谈起
        refreshFlips();
        fitFrame(true);
        refreshControls();
        schedulePreview();
        for (const button of document.querySelectorAll('.fp-thumb')) button.classList.toggle('active', button.dataset.key === entry.key);
        status.textContent = `已摆成「${entry.name}」，可再拖关节微调。`;
        toast(`已按「${entry.name}」摆好姿势`);
    } catch (error) {
        entry.failed = true;
        document.querySelector(`.fp-thumb[data-key="${CSS.escape(entry.key)}"]`)?.classList.add('failed');
        status.textContent = `「${entry.name}」摆不出来：${error.message}`;
        toast(`「${entry.name}」摆不出来：${error.message}`);
    }
}

// 头部朝向：编辑器只从骨架图里认 14 个体点，鼻/眼/耳不在其中（画了会被判「彩色标记过密」），
// 所以朝向由宿主以数据形式传进来（doc.openpose.head）。2D 只能得到左右转与侧倾，俯仰看不出。
function applyHeadOrientation(facingAway = false) {
    headApplied = null;
    const hp = doc.openpose?.head;
    const head = viewer?.bones?.head;
    const THREE = viewer?.THREE;
    if (!head || !THREE) return false;
    const span = (a, b) => (a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0);
    const middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const minSpan = Math.max(4, doc.width * 0.02);
    // 耳朵离头的旋转轴远、对转头最敏感；被头发挡住时退回眼睛（眼距小，换算系数不同）
    const ref = hp ? (span(hp.lEar, hp.rEar) > minSpan
        ? { axis: middle(hp.lEar, hp.rEar), width: span(hp.lEar, hp.rEar), factor: 0.71 }
        : (span(hp.lEye, hp.rEye) > minSpan
            ? { axis: middle(hp.lEye, hp.rEye), width: span(hp.lEye, hp.rEye), factor: 1.77 }
            : null)) : null;
    const hasFace = Boolean(ref && hp.nose);
    let yaw = 0;
    let roll = 0;
    let source = hasFace ? (ref.factor < 1 ? '耳朵' : '眼睛') : '无脸部数据';
    if (hasFace) {
        const clampSin = value => clamp(value, -1, 1);
        // 鼻子相对「眼/耳中点」的横向偏移 ≈ 鼻前伸半径 × sin(左右转角)；投影宽度已被 cos 压掉，迭代一次
        const offset = hp.nose[0] - ref.axis[0];
        const radius = Math.max(1, ref.factor * ref.width);
        yaw = Math.asin(clampSin(offset / radius));
        yaw = Math.asin(clampSin(offset * Math.cos(yaw) / radius));
        // 眼睛连线（按图像 x 排序，避免左右命名相反）相对水平线的倾角 = 头侧倾
        if (hp.lEye && hp.rEye) {
            const [eyeA, eyeB] = hp.lEye[0] <= hp.rEye[0] ? [hp.lEye, hp.rEye] : [hp.rEye, hp.lEye];
            roll = Math.atan2(-(eyeB[1] - eyeA[1]), eyeB[0] - eyeA[0]);
        }
        if (facingAway) { yaw = -yaw; roll = -roll; } // 背面照左右是镜像的
        yaw = clamp(yaw, -0.7, 0.7);  // ±40°
        roll = clamp(roll, -0.44, 0.44); // ±25°
    } else if (facingAway) {
        // 背面照又没脸部数据：朝向无从判断，不强扭（免得把头转 180° 变“猫头鹰”）
        return false;
    }
    // 没脸部数据时目标就是「正脸朝前、不侧倾」：yaw = roll = 0
    // 人偶当前朝向用模型自己的眼点算，只补差值，免得把脖子已有的转动再加一遍
    const step = () => {
        let dYaw = yaw;
        let dRoll = roll;
        try {
            const face = viewer._getCurrentMHFaceLandmarkPoints?.();
            if (face?.left && face?.right) {
                const pivot = head.getWorldPosition(new THREE.Vector3());
                const mid = face.left.clone().add(face.right).multiplyScalar(0.5).sub(pivot);
                dYaw = yaw - Math.atan2(mid.x, Math.max(1e-4, mid.z));
                const [mA, mB] = face.left.x <= face.right.x ? [face.left, face.right] : [face.right, face.left];
                dRoll = roll - Math.atan2(-(mB.y - mA.y), mB.x - mA.x);
            }
        } catch { /* 取不到模型眼点就整量应用 */ }
        const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dYaw)
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), dRoll));
        const ok = Boolean(viewer._applyBoneWorldDelta?.(head, delta));
        if (ok) {
            viewer.skinnedMesh.updateMatrixWorld(true);
            viewer.skeleton?.update();
            viewer.updateMarkers?.();
        }
        return { ok, dYaw, dRoll };
    };
    const first = step();
    let applied = first.ok;
    // 没有脸部数据时多收敛两轮：骨约束下一次往往转不到位
    if (applied && !hasFace) {
        for (let i = 0; i < 2; i += 1) {
            const next = step();
            if (!next.ok) break;
            if (Math.abs(next.dYaw) < 0.02 && Math.abs(next.dRoll) < 0.02) break;
        }
    }
    if (applied) headApplied = { yaw: yaw * 180 / Math.PI, roll: roll * 180 / Math.PI, source };
    return applied;
}

// --- 按真人匹配身材（身高 · 骨长比例 · 图中位置）----------------------------
// 2D 骨架只能量长度、量不出围度，所以这里对齐的是骨长与身高/位置。
// 成对肢体取较长的一侧（短的那侧多半是透视压缩），整体取中位数当「像素→世界」的尺子。
// 顺带解决 lift 的老问题：比例对不上时，比例差会被当成投影缩短，误判成转身。
const FIT_SEGMENTS = {
    shoulder: [['ls', 'rs']],
    spine: [['neck', 'hipMid']],
    upper_arm: [['ls', 'le'], ['rs', 're']],
    forearm: [['le', 'lw'], ['re', 'rw']],
    thigh: [['lh', 'lk'], ['rh', 'rk']],
    shin: [['lk', 'la'], ['rk', 'ra']],
};
// 变窄只改一部分：真人转身也会让这一段变短，全改就等于把转身信息抹掉
// 头部不参与：真人的「鼻子→脖子」与人偶的 head 骨不是同一标志点，硬套会把头撑大，留给手动
const FIT_SHRINK_DAMP = { shoulder: 0.5, spine: 0.8, upper_arm: 0.7, forearm: 0.7, thigh: 0.8, shin: 0.8 };
const PROPORTION_RANGE = Object.fromEntries(PROPORTIONS.map(([key, , min, max]) => [key, [min, max]]));
const PROPORTION_LABELS = Object.fromEntries(PROPORTIONS.map(([key, label]) => [key, label]));
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let fitPersonOn = true;
try { fitPersonOn = localStorage.getItem('freepose.fitPerson') !== '0'; } catch { /* 隐私模式下记不住 */ }
// 宿主传来的 SDPose 鼻/双眼/双耳（画布像素），只用于头部朝向
let sdposeHead = null;
let headApplied = null; // 最近一次实际应用的头朝向，只用于状态栏显示

function syncBoneMatrices() {
    viewer.skinnedMesh.updateMatrixWorld(true);
    for (const bone of viewer.boneList) bone.updateMatrixWorld(true);
}

// 骨架图与输出画布尺寸可能因 16 对齐略有出入，统一换算到输出画布像素
function measurePerson(points, image) {
    const sx = doc.width / (image?.naturalWidth || doc.width);
    const sy = doc.height / (image?.naturalHeight || doc.height);
    const p = Object.fromEntries(Object.entries(points).map(([key, [x, y]]) => [key, [x * sx, y * sy]]));
    p.hipMid = [(p.lh[0] + p.rh[0]) / 2, (p.lh[1] + p.rh[1]) / 2];
    return {
        hipMid: p.hipMid,
        lengths: Object.fromEntries(Object.entries(FIT_SEGMENTS).map(([key, pairs]) =>
            [key, Math.max(...pairs.map(([a, b]) => dist2(p[a], p[b])))])),
    };
}

function measureRest() {
    const { rest } = restJoints();
    return {
        lengths: {
            shoulder: dist3(rest.ls, rest.rs),
            spine: dist3(rest.neck, rest.hipMid),
            upper_arm: dist3(rest.ls, rest.le),
            forearm: dist3(rest.le, rest.lw),
            thigh: dist3(rest.lh, rest.lk),
            shin: dist3(rest.lk, rest.la),
        },
    };
}

// factor = 目标骨长 / 当前骨长
function adjustProportion(key, factor) {
    const [min, max] = PROPORTION_RANGE[key];
    const current = doc.proportions[key];
    let value = clamp(current * factor, min, max);
    value = clamp(value, current * 0.8, current * 1.25); // 单次别改太猛
    if (value < current) value = current + (value - current) * (FIT_SHRINK_DAMP[key] ?? 0.8);
    if (Math.abs(value - current) < 0.005) return false;
    setProportion(key, value);
    return true;
}

// 必须在摆姿前跑：lift 用的是当前 rest。返回真人的「世界单位 / 像素」尺子与改动过的项
function fitProportionsToPerson(person) {
    let scale = 0;
    const before = { ...doc.proportions };
    for (let pass = 0; pass < 3; pass++) {
        // 必须回到站姿再量：肩宽/躯干长会随当前姿势变，量错了就会把人偶比例改歪
        resetPose();
        syncBoneMatrices();
        const rest = measureRest();
        const ratios = Object.keys(FIT_SEGMENTS).map(key => rest.lengths[key] / Math.max(1e-6, person.lengths[key]));
        const median = ratios.slice().sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
        if (!(median > 0)) break;
        scale = median;
        for (const key of Object.keys(FIT_SEGMENTS)) {
            const ratio = rest.lengths[key] / Math.max(1e-6, person.lengths[key]);
            // 与中位数差一倍以上 = 这一段多半被遮挡或截断，别拿它改人偶
            if (ratio > median * 2 || ratio < median * 0.5) continue;
            adjustProportion(key, person.lengths[key] * median / rest.lengths[key]);
        }
    }
    const changed = Object.keys(doc.proportions).filter(key => Math.abs(doc.proportions[key] - before[key]) > 0.01);
    return { scale, changed };
}

// 相机在人物所在深度处的「世界单位 / 输出像素」（与核心 computeModelFitFraming 同一套算法：距离固定 45）
function worldPerPixel() {
    const camera = viewer.captureCamera;
    if (!camera || !viewer.THREE) return 0;
    const pelvis = viewer.bones.pelvis.getWorldPosition(new viewer.THREE.Vector3());
    const distance = camera.position.distanceTo(pelvis);
    return 2 * distance * Math.tan(viewer.THREE.MathUtils.degToRad(camera.fov) / 2) / (doc.height * (camera.zoom || 1));
}

// 摆姿后调用：把人偶缩到与真人同高，并挪到真人在图里的位置（髋部对齐）
function fitScaleAndPositionToPerson(person, scale) {
    if (!(scale > 0)) return;
    const THREE = viewer.THREE;
    const applyTransform = () => {
        viewer.setActiveCharacterAppearance({ transform: doc.transform });
        syncBoneMatrices();
    };
    // 骨长已按 scale 对齐真人像素；只要相机这边的世界/像素比也等于 scale，渲染出来就是同样大小
    const step0 = worldPerPixel();
    if (!(step0 > 0)) return;
    doc.transform = { ...doc.transform, zoom: clamp(doc.transform.zoom * step0 / scale, 0.1, 7) };
    applyTransform();
    for (let pass = 0; pass < 3; pass++) {
        const camera = viewer.captureCamera;
        const step = worldPerPixel();
        if (!(step > 0)) return;
        const pelvis = viewer.bones.pelvis.getWorldPosition(new THREE.Vector3());
        const ndc = pelvis.clone().project(camera);
        const here = [(ndc.x + 1) / 2 * doc.width, (1 - ndc.y) / 2 * doc.height];
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const delta = right.multiplyScalar((person.hipMid[0] - here[0]) * step)
            .add(up.multiplyScalar(-(person.hipMid[1] - here[1]) * step));
        if (Math.abs(delta.x) < 1e-4 && Math.abs(delta.y) < 1e-4) break;
        doc.transform = {
            ...doc.transform,
            x: clamp(doc.transform.x + delta.x, -50, 50),
            y: clamp(doc.transform.y + delta.y, -50, 50),
        };
        applyTransform();
    }
}

async function importEntry(entry) {
    const status = $('#import-status');
    for (const button of document.querySelectorAll('.fp-thumb')) button.classList.toggle('active', button.dataset.key === entry.key);
    const label = entry.name;
    try {
        const image = new Image();
        image.src = entry.url;
        await image.decode();
        const people = readSkeletonImage(image);
        // Single-person editor: take the tallest skeleton.
        const height = person => Math.max(...Object.values(person).map(p => p[1])) - Math.min(...Object.values(person).map(p => p[1]));
        const person = people.slice().sort((a, b) => height(b) - height(a))[0];
        doc.openpose = { key: entry.key, name: label, points: person, flips: {}, head: sdposeHead ? { ...sdposeHead } : null };
        // 身材匹配只跟着 SDPose 从图1 真人识别出来的骨架走（key 形如 sdpose:<node>）。
        // 图库/导入的骨架图只是别人的姿势，拿它去改自己人偶的骨长比例会把身材改歪：
        // 原来的小彩蛋与导入骨架图同样只摆姿、不改比例。
        const fromSdpose = String(entry.key || '').startsWith('sdpose:');
        // 先按真人调骨长比例：lift 用当前 rest，比例不对就会把比例差误判成转身
        const measured = fitPersonOn && fromSdpose ? measurePerson(person, image) : null;
        let fit = null;
        if (measured) {
            try { fit = fitProportionsToPerson(measured); }
            catch (error) { console.warn('[Fisher] 身材匹配失败', error); }
        }
        const facingAway = applyOpenPose();
        // 身高与图中位置要在摆姿之后（摆姿末尾的 fitFrame 会重置 transform）
        if (fit?.scale > 0) {
            try { fitScaleAndPositionToPerson(measured, fit.scale); }
            catch (error) { console.warn('[Fisher] 身高/位置匹配失败', error); }
            refreshControls();
            schedulePreview();
        }
        const notes = [facingAway ? '识别为背面' : '识别为正面'];
        if (fit?.changed?.length) {
            notes.push(`身材已按真人匹配：${fit.changed.map(key => `${PROPORTION_LABELS[key]} ${Math.round(doc.proportions[key] * 100)}%`).join('、')}`);
        }
        if (headApplied) {
            const deg = value => Math.round(value);
            notes.push(headApplied.source === '无脸部数据'
                ? '骨架图没有脸部数据，头部已摆正朝前（俯仰/侧倾需手动微调）'
                : `头部按${headApplied.source}对齐：左右转 ${deg(headApplied.yaw)}°、侧倾 ${deg(headApplied.roll)}°（俯仰看不出，需手动）`);
        }
        if (people.length > 1) notes.push(`图中 ${people.length} 人，已取最大的一个`);
        if (people.warnings?.length) notes.push('遮挡关节已近似补全');
        status.textContent = `已按「${label}」摆好：${notes.join('，')}。前后不对可用下方深度修正。`;
        toast(`已按「${label}」摆好姿势`);
    } catch (error) {
        entry.failed = true;
        document.querySelector(`.fp-thumb[data-key="${CSS.escape(entry.key)}"]`)?.classList.add('failed');
        status.textContent = `「${label}」无法识别：${error.message}`;
        toast(`「${label}」无法识别：${error.message}`);
    }
}

function refreshFlips(facingAway) {
    $('#depth-section').hidden = !doc.openpose;
    const flips = doc.openpose?.flips || {};
    for (const button of document.querySelectorAll('[data-flip]')) button.classList.toggle('on', Boolean(flips[button.dataset.flip]));
    if (facingAway !== undefined) $('[data-flip=body]').textContent = facingAway ? '背面 → 改正面' : '正面 → 改背面';
}

for (const button of document.querySelectorAll('[data-flip]')) {
    button.onclick = () => {
        if (!doc.openpose) return;
        const key = button.dataset.flip;
        doc.openpose.flips = { ...doc.openpose.flips, [key]: !doc.openpose.flips[key] };
        applyOpenPose();
    };
}

// Two sources: 常用姿势（内置） and the user's library in input/fisher_openpose
// (see openpose_library.py), which survives reopening the editor.
// （原来的 FISHER小彩蛋 / builtin_poses 一份已移除）
// Standalone (no ComfyUI server) the library only lasts for this page.
const LIBRARY_URL = '/fisher_pose/openpose_library';
const SOURCE_NAMES = { common: '常用姿势', library: '我的图库' };
const galleries = {
    // 常用姿势：缩略图是 common-poses/<id>.webp，摆姿时按 spec 在当前体型上解算
    common: COMMON_POSES.map(spec => ({
        key: 'common:' + spec.id,
        name: spec.name,
        url: new URL(`common-poses/${spec.id}.webp`, import.meta.url).href,
        spec,
    })),
    library: [],
};
let gallerySource = 'common';
let libraryAvailable = false;
const byName = (a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true });
const entryLabel = entry => entry.name.replace(/_bone_structure|\.(png|jpe?g|webp)$/gi, '');

function renderGallery() {
    const gallery = galleries[gallerySource];
    const filter = $('#gallery-filter').value.trim().toLowerCase();
    const shown = gallery.filter(entry => entry.name.toLowerCase().includes(filter));
    const container = $('#gallery');
    container.replaceChildren(...shown.map(entry => {
        const button = document.createElement('button');
        button.className = 'fp-thumb' + (entry.failed ? ' failed' : '') + (doc.openpose?.key === entry.key ? ' active' : '');
        button.dataset.key = entry.key;
        button.title = entry.name;
        // 图库里的图（自己导入的）右上角给个 ×，常用姿势是内置的，不给删
        const deletable = entry.key.startsWith('library:');
        button.innerHTML = `<img loading="lazy" alt=""><span></span>` + (deletable ? '<i class="fp-delete" title="从图库删除">×</i>' : '');
        button.querySelector('img').src = entry.url;
        button.querySelector('span').textContent = entryLabel(entry);
        // 常用姿势走方向解算，骨架图 / 图库走图片识别
        button.onclick = event => {
            if (deletable && event.target.closest('.fp-delete')) { void deleteLibraryEntry(entry); return; }
            entry.spec ? applyCommonPose(entry) : importEntry(entry);
        };
        return button;
    }));
    for (const button of document.querySelectorAll('#gallery-source button')) {
        button.classList.toggle('active', button.dataset.source === gallerySource);
        button.textContent = `${SOURCE_NAMES[button.dataset.source]} ${galleries[button.dataset.source].length || ''}`.trim();
    }
    $('#gallery-count').textContent = gallery.length && filter ? `${shown.length} / ${gallery.length}` : '';
    $('#gallery-filter').hidden = gallery.length < 2;
    $('#clear-gallery').hidden = gallerySource !== 'library' || !libraryAvailable || !gallery.length;
    if (!gallery.length) container.innerHTML = '<p class="muted">选 OpenPose 骨架图（黑底彩色），点缩略图即摆好姿势。也可把图片拖到这里。选过的图会存入图库，下次打开自动载入。</p>';
}

for (const button of document.querySelectorAll('#gallery-source button')) {
    button.onclick = () => { gallerySource = button.dataset.source; renderGallery(); };
}

// --- 宿主节点（PZ 姿势节点）传入的 SDPose 骨架图：随时可点按钮按它摆姿 ---
let sdposeEntry = null;

function refreshSdposeButton() {
    const button = $('#apply-sdpose');
    if (!button) return;
    button.hidden = !sdposeEntry;
    if (sdposeEntry) button.textContent = `按「${sdposeEntry.name}」摆姿`;
    // 骨架卡片：先让人看清这次收到的骨架（图铺满卡片宽），点图摆姿，等价于下面的按钮
    const box = $('#sdpose-preview');
    if (!box) return;
    box.hidden = !sdposeEntry;
    if (!sdposeEntry) return;
    const thumb = $('#sdpose-thumb');
    thumb.src = sdposeEntry.url;
    thumb.onclick = () => { if (sdposeEntry) void importEntry(sdposeEntry); };
    thumb.title = `点这张骨架图即可摆姿（${sdposeEntry.name}）`;
    // 只在图下方留一行骨架名（图可点、下面还有按钮，不再额外写提示文字）
    $('#sdpose-name').textContent = sdposeEntry.name;
}
$('#apply-sdpose').onclick = () => { if (sdposeEntry) void importEntry(sdposeEntry); };

// 一键人脸朝前：把 head 骨的旋转直接还原成初始值，也就是模型自带的「正脸朝前」。
// 之前是拿「当前脸实际朝哪」做相对修正（_applyBoneWorldDelta），连点会一次次叠加、
// 越点越歪；改成绝对复位后，点一次和点十次结果完全一样。
function faceHeadForward() {
    const head = viewer?.bones?.head;
    if (!ready || !head) return false;
    viewer.recordState();
    head.rotation.set(0, 0, 0);
    head.updateMatrixWorld(true);
    viewer.skinnedMesh?.updateMatrixWorld?.(true);
    viewer.skeleton?.update();
    viewer.updateIKEffectorPositions?.();
    viewer.updateMarkers?.();
    viewer.requestRender?.();
    return true;
}

$('#face-front').onclick = () => {
    const status = $('#import-status');
    if (!faceHeadForward()) {
        status.textContent = '还没准备好（人偶模型未加载完），稍后再试。';
        toast('头部没能摆正');
        return;
    }
    refreshControls();
    schedulePreview();
    status.textContent = '人脸已朝前：头部回到初始朝向（正脸、不侧倾）。想微调就拖动头部骨节，或按 Ctrl+Z 撤销。';
    toast('人脸已朝前');
};

// --- 一键转人偶：编辑器里直接让宿主节点跑 SDPose 识别，拿回骨架后就地摆姿 ---
// 两个入口：①「一键图1转人偶」用节点上的图1；②「导入图转人偶」选本地任意一张图（宿主会先导入成图1）。
// 关键：还没生成过骨架图时（sdposeEntry 为空、上面的按钮都藏着），这两个按钮依然可点。
// 摆完不回传节点、不关编辑器：留在页面上等手动微调，由用户自己点「应用到节点」。
const onekeyDoll = $('#onekey-doll');
const onekeyUpload = $('#onekey-upload');
const pickDollImage = $('#pick-doll-image');
const onekeyButtons = [onekeyDoll, onekeyUpload].filter(Boolean);
const onekeyLabels = new Map(onekeyButtons.map(button => [button, button.textContent]));
let onekeyTimer = 0;
let onekeyFromImport = false; // 这次一键是不是「导入图」发起的（只影响回执文案）
function resetOnekeyDoll() {
    clearTimeout(onekeyTimer);
    onekeyButtons.forEach(button => {
        button.disabled = false;
        button.textContent = onekeyLabels.get(button) || '';
    });
}
function requestDoll(file) {
    if (!onekeyButtons.length) return;
    onekeyFromImport = !!file;
    onekeyButtons.forEach(button => { button.disabled = true; button.textContent = '识别中…'; });
    const status = $('#import-status');
    if (status) status.textContent = file
        ? `已把「${file.name}」交给节点：只借它的姿势与身材数据（临时识别，不改图1 / 图2），回来后自动摆姿…`
        : '已让节点用 SDPose 从图1 识别骨架，回来后自动摆姿（摆完停在编辑器里，可继续微调）…';
    parent.postMessage({ type: 'fisher-request-doll', file: file || null }, location.origin);
    // 宿主没回应（旧版节点 / 异常）时留个重试机会，别让按钮一直卡住。
    // 正常识别（上传 + SDPose）可能要几十秒，给足时间；失败时宿会主动回 fisher-doll-failed，不用等超时
    onekeyTimer = setTimeout(resetOnekeyDoll, 120000);
}
if (onekeyDoll) {
    onekeyDoll.hidden = !embedded; // 独立打开时没有宿主可请求
    onekeyDoll.onclick = () => { if (!onekeyDoll.disabled) requestDoll(null); };
}
if (onekeyUpload) {
    onekeyUpload.hidden = !embedded;
    onekeyUpload.onclick = () => { if (!onekeyUpload.disabled && pickDollImage) pickDollImage.click(); };
    if (pickDollImage) pickDollImage.onchange = () => {
        const file = pickDollImage.files?.[0];
        pickDollImage.value = ''; // 清空才能重复选同一个文件
        if (file) requestDoll(file);
    };
}

async function loadLibrary() {
    try {
        const response = await fetch(LIBRARY_URL, { cache: 'no-store' });
        if (!response.ok) return;
        const { subfolder, files } = await response.json();
        libraryAvailable = true;
        galleries.library = files.map(name => ({ key: 'library:' + name, name, url: '/view?' + new URLSearchParams({ filename: name, subfolder, type: 'input' }) })).sort(byName);
        renderGallery();
    } catch { /* standalone preview without the ComfyUI server */ }
}

async function uploadToLibrary(images) {
    const status = $('#import-status');
    let done = 0, failed = 0;
    const queue = images.slice();
    const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
            const form = new FormData();
            form.append('image', file, file.name);
            form.append('subfolder', 'fisher_openpose');
            form.append('type', 'input');
            form.append('overwrite', 'true');
            try { if (!(await fetch('/upload/image', { method: 'POST', body: form })).ok) failed++; }
            catch { failed++; }
            status.textContent = `正在存入图库 ${++done} / ${images.length}…`;
        }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    await loadLibrary();
    status.textContent = failed ? `${failed} 张未能存入图库` : '';
    toast(`已存入我的图库 ${images.length - failed} 张，下次打开无需重新选择`);
}

// 删掉图库里的一张：服务器在的话删 input/fisher_openpose 里的副本（下次打开也不会再出现），
// 独立打开（没有 ComfyUI）时只从当前页面的列表里去掉
async function deleteLibraryEntry(entry) {
    const label = entryLabel(entry);
    if (!confirm(`从我的图库删除「${label}」？\n（只删 ComfyUI/input/fisher_openpose 里的副本，你原来的图片文件不受影响）`)) return;
    if (!libraryAvailable) {
        if (entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url);
        galleries.library = galleries.library.filter(item => item.key !== entry.key);
        renderGallery();
        toast(`已移除「${label}」`);
        return;
    }
    try {
        const response = await fetch('/pz_easyuse/fisher-openpose-library/delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: entry.name }),
        });
        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            toast(`删除失败：${detail.error || response.status}`);
            return;
        }
        await loadLibrary();
        toast(`已从图库删除「${label}」`);
    } catch { toast('删除失败：连不上 ComfyUI'); }
}

async function addFiles(files) {
    const images = [...files].filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name));
    if (!images.length) { toast('没有找到图片'); return; }
    gallerySource = 'library';
    if (libraryAvailable) { await uploadToLibrary(images); return; }
    for (const entry of galleries.library) URL.revokeObjectURL(entry.url);
    galleries.library = images.map(file => ({ key: 'library:' + file.name, name: file.name, url: URL.createObjectURL(file) })).sort(byName);
    renderGallery();
    toast(`已载入 ${galleries.library.length} 张骨架图，点缩略图即可摆姿`);
}

$('#clear-gallery').onclick = async () => {
    if (!libraryAvailable || !confirm(`清空我的图库中的 ${galleries.library.length} 张骨架图？\n（删除 ComfyUI/input/fisher_openpose 里的副本，常用姿势不受影响）`)) return;
    await fetch(LIBRARY_URL + '/clear', { method: 'POST' });
    await loadLibrary();
    toast('我的图库已清空');
};

for (const id of ['#pick-folder', '#pick-files']) {
    const input = $(id);
    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    // Inside the ComfyUI modal, let the host page open the picker (same as the studio editor).
    input.addEventListener('click', event => {
        const chooseInHost = window.frameElement?.fisherChooseFiles;
        if (!chooseInHost) return;
        event.preventDefault();
        try { chooseInHost(addFiles, { directory: id === '#pick-folder' }); }
        catch { toast('文件窗口未能打开，请把图片拖到左侧'); }
    });
}
$('#gallery-filter').addEventListener('input', renderGallery);
const galleryBox = $('#gallery');
galleryBox.addEventListener('dragover', event => { event.preventDefault(); galleryBox.classList.add('drag'); });
galleryBox.addEventListener('dragleave', () => galleryBox.classList.remove('drag'));
galleryBox.addEventListener('drop', event => { event.preventDefault(); galleryBox.classList.remove('drag'); addFiles(event.dataTransfer.files); });

// --- 我的姿势: whole editor states saved on the server (see saved_poses.py) ---

const SAVED_URL = '/fisher_pose/saved_poses';
// 默认只存姿势（像「常用姿势」：载入时套到当前人偶的身材上）；勾上才把体型/比例一起存
const SAVE_SHAPE_KEY = 'freepose.saveShape';
const saveShapeOn = () => Boolean($('#save-pose-shape')?.checked);
let savedPoses = [];
let savedAvailable = false;
let activeSavedName = null;

function renderSaved() {
    const container = $('#saved-poses');
    $('#save-pose').disabled = !savedAvailable;
    $('#saved-count').textContent = savedPoses.length ? `${savedPoses.length} 个` : '';
    if (!savedAvailable) { container.innerHTML = '<p class="muted">在 ComfyUI 中打开编辑器才能保存姿势。</p>'; return; }
    if (!savedPoses.length) { container.innerHTML = '<p class="muted">摆好的姿势点上面的按钮存下来，下次打开点缩略图就能恢复，换工作流也能用。默认只存姿势，载入时套到当前人偶的身材上。</p>'; return; }
    container.replaceChildren(...savedPoses.map(entry => {
        const button = document.createElement('button');
        button.className = 'fp-thumb' + (entry.name === activeSavedName ? ' active' : '');
        button.title = `${entry.name}\n点击载入`;
        button.innerHTML = '<img alt=""><span></span><i class="fp-delete" title="删除">×</i>';
        button.querySelector('img').src = entry.thumbnail;
        button.querySelector('span').textContent = entry.name;
        button.onclick = event => (event.target.closest('.fp-delete') ? deleteSavedPose(entry) : loadSavedPose(entry));
        return button;
    }));
}

async function loadSavedList() {
    try {
        const response = await fetch(SAVED_URL, { cache: 'no-store' });
        if (response.ok) {
            savedPoses = (await response.json()).poses;
            savedAvailable = true;
        }
    } catch { /* standalone preview without the ComfyUI server */ }
    renderSaved();
}

// Named after the OpenPose image it came from when there is one, else 姿势 N; never an existing name.
function defaultPoseName() {
    const taken = new Set(savedPoses.map(entry => entry.name));
    const base = doc.openpose?.name ? doc.openpose.name.replace(/[\\/:*?"<>|]/g, ' ').trim() : '姿势';
    if (doc.openpose?.name && !taken.has(base)) return base;
    for (let n = savedPoses.length + 1; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

const postPose = (name, record, overwrite) => fetch(SAVED_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, record, overwrite }),
});

async function saveCurrentPose(presetName) {
    if (!savedAvailable || !ready) return;
    const name = (typeof presetName === 'string' ? presetName : prompt('给这个姿势起个名字', defaultPoseName()))?.trim();
    if (!name) return;
    await viewer.waitForCaptureReady();
    const scale = 256 / Math.max(doc.width, doc.height);
    const thumbnail = capture(Math.round(doc.width * scale), Math.round(doc.height * scale));
    updateCamera(false);
    const withShape = saveShapeOn();
    const pose = savedPose();
    const docPart = { ...doc, pose: withShape ? pose : rotationsOnly(pose) };
    if (!withShape) { delete docPart.mesh; delete docPart.proportions; } // 只存姿势：不带体型与比例
    const record = {
        version: 1, thumbnail,
        doc: docPart,
        grips: { l: Number($('#grip-l').value), r: Number($('#grip-r').value) },
    };
    try {
        let response = await postPose(name, record, false);
        if (response.status === 409) {
            if (!confirm(`已有名为「${name}」的姿势，要覆盖吗？`)) return;
            response = await postPose(name, record, true);
        }
        const result = await response.json();
        if (!response.ok) { toast(result.error || '保存失败'); return; }
        activeSavedName = result.name;
        await loadSavedList();
        toast(`已保存「${result.name}」`);
    } catch { toast('保存失败：连不上 ComfyUI'); }
}

async function loadSavedPose(entry) {
    try {
        const response = await fetch(`${SAVED_URL}/${encodeURIComponent(entry.name)}`, { cache: 'no-store' });
        if (!response.ok) { toast('这个姿势已经不存在了'); await loadSavedList(); return; }
        const record = await response.json();
        const savedDoc = record.doc || {};
        // 开关没勾（默认）：即使旧记录里带了身材，也一并忽略，沿用当前人偶的体型与比例，
        // 只把姿势套上去（同「常用姿势」）；勾上才按记录里的身材重建骨架。
        const withShape = saveShapeOn() && Boolean(savedDoc.mesh || savedDoc.proportions);
        viewer.recordState();
        doc = docFrom(withShape ? savedDoc : { ...savedDoc, mesh: doc.mesh, proportions: doc.proportions, transform: doc.transform });
        if (withShape) {
            loadModel(doc.pose);
        } else {
            // 不动骨架：绝对 IK 位置依赖骨长，换身材会歪，这里只应用关节旋转
            viewer.setPose(rotationsOnly(doc.pose), true);
            viewer.updateIKEffectorPositions?.();
            viewer.updateMarkers?.();
            viewer.skinnedMesh?.updateMatrixWorld?.(true);
            viewer.skeleton?.update();
        }
        for (const side of ['l', 'r']) $(`#grip-${side}`).value = record.grips?.[side] ?? 0;
        updateCamera(true);
        refreshFlips();
        activeSavedName = entry.name;
        for (const button of document.querySelectorAll('#gallery .fp-thumb')) button.classList.toggle('active', button.dataset.key === doc.openpose?.key);
        renderSaved();
        $('#import-status').textContent = `已载入「${entry.name}」${withShape ? '（含身材）' : '（只套姿势，未改身材）'}。`;
    } catch (error) { toast(`载入失败：${error.message}`); }
}

async function deleteSavedPose(entry, skipConfirm = false) {
    if (!skipConfirm && !confirm(`删除姿势「${entry.name}」？`)) return;
    try {
        await fetch(`${SAVED_URL}/${encodeURIComponent(entry.name)}/delete`, { method: 'POST' });
        if (activeSavedName === entry.name) activeSavedName = null;
        await loadSavedList();
        toast(`已删除「${entry.name}」`);
    } catch { toast('删除失败：连不上 ComfyUI'); }
}

$('#save-pose').onclick = () => saveCurrentPose();
// 默认不勾：姿势与身材分开存，载入时套到当前人偶上，跟「常用姿势」一致
$('#save-pose-shape').onchange = event => {
    try { localStorage.setItem(SAVE_SHAPE_KEY, event.target.checked ? '1' : '0'); } catch { /* 隐私模式下记不住 */ }
};
try { $('#save-pose-shape').checked = localStorage.getItem(SAVE_SHAPE_KEY) === '1'; } catch { /* 隐私模式下读不到 */ }

// --- 我的身材: 体型（doc.mesh）+ 比例（doc.proportions）存浏览器本地 -----------
// 姿势存在服务器上（换工作流也能用），身材只需要在本机复用，所以走 localStorage：
// 不依赖后端、不用重启 ComfyUI。存的是"身材"本身，不含姿势/位置/朝向。

const SHAPE_KEY = 'freepose.shapes';
const MAX_SHAPES = 30;
let savedShapes = [];
let activeShapeName = null;

function renderShapes() {
    const container = $('#saved-shapes');
    if (!container) return;
    $('#shape-count').textContent = savedShapes.length ? `${savedShapes.length} 份` : '';
    if (!savedShapes.length) {
        container.innerHTML = '<p class="muted">把调好的体型与比例存下来，换图、换节点、下次打开都能一键套用（只存身材，不存姿势）。保存时可以用当前人偶截图做图标，也可以从本地选一张图片。</p>';
        return;
    }
    container.replaceChildren(...savedShapes.map(entry => {
        const button = document.createElement('button');
        button.className = 'fp-thumb' + (entry.name === activeShapeName ? ' active' : '');
        button.title = `${entry.name}\n点击套用（体型 + 比例）`;
        button.innerHTML = '<img alt=""><span></span><i class="fp-delete" title="删除">×</i>';
        const img = button.querySelector('img');
        if (entry.thumb) img.src = entry.thumb; else img.remove();
        button.querySelector('span').textContent = entry.name;
        button.onclick = event => (event.target.closest('.fp-delete') ? deleteShape(entry) : applyShape(entry));
        return button;
    }));
}

function loadShapes() {
    try {
        const list = JSON.parse(localStorage.getItem(SHAPE_KEY) || '[]');
        savedShapes = Array.isArray(list) ? list.filter(item => item?.mesh && item?.proportions) : [];
    } catch { savedShapes = []; }
    renderShapes();
}

function persistShapes() {
    // 本地存储默认 5MB：满了就从最老的一份开始丢预览图，身材数据本身（很小）保留
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            localStorage.setItem(SHAPE_KEY, JSON.stringify(savedShapes));
            return true;
        } catch { /* 继续丢预览图重试 */ }
        const oldest = savedShapes.find(item => item.thumb);
        if (!oldest) break;
        delete oldest.thumb;
        renderShapes();
    }
    toast('保存失败：浏览器本地存储已满，先删掉几份身材再试');
    return false;
}

function defaultShapeName() {
    const taken = new Set(savedShapes.map(entry => entry.name));
    const base = doc.openpose?.name ? doc.openpose.name.replace(/[\\/:*?"<>|]/g, ' ').trim() : '身材';
    if (doc.openpose?.name && !taken.has(base)) return base;
    for (let n = savedShapes.length + 1; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

// 图标除了当前人偶截图，也可以从本地选一张图片。本地存储只有 5MB，统一压成长边 200px 的 JPEG
const ICON_MAX = 200;

function fileToIcon(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读不出这张图片'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('这张图片打不开'));
            image.onload = () => {
                const scale = Math.min(1, ICON_MAX / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(64, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(64, Math.round(image.naturalHeight * scale));
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function pickIconFile() {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.hidden = true;
        document.body.append(input);
        const finish = file => { input.remove(); resolve(file || null); };
        input.addEventListener('change', () => finish(input.files?.[0]));
        input.addEventListener('cancel', () => finish(null)); // 直接关掉选图窗口
        input.click();
    });
}

async function saveCurrentShape(presetName) {
    if (!ready) return;
    const name = (typeof presetName === 'string' ? presetName : prompt('给这份身材起个名字', defaultShapeName()))?.trim();
    if (!name) return;
    await viewer.waitForCaptureReady();
    const scale = 200 / Math.max(doc.width, doc.height);
    let thumb = capture(Math.max(64, Math.round(doc.width * scale)), Math.max(64, Math.round(doc.height * scale)));
    updateCamera(false);
    // 图标来源：确定 = 从本地选一张图片，取消 = 用上面的当前人偶截图
    if (confirm(`给「${name}」选个图标：\n\n「确定」= 从本地选一张图片\n「取消」= 用当前人偶截图`)) {
        const file = await pickIconFile();
        if (file) {
            try { thumb = await fileToIcon(file); }
            catch (error) { toast(`图标没用上（${error.message}），先用当前人偶截图`); }
        }
    }
    const record = { name, mesh: { ...doc.mesh }, proportions: { ...doc.proportions }, thumb, at: Date.now() };
    const index = savedShapes.findIndex(entry => entry.name === name);
    if (index >= 0) {
        if (!confirm(`已有名为「${name}」的身材，要覆盖吗？`)) return;
        savedShapes[index] = record;
    } else {
        savedShapes.push(record);
    }
    if (savedShapes.length > MAX_SHAPES) savedShapes.splice(0, savedShapes.length - MAX_SHAPES);
    if (!persistShapes()) return;
    activeShapeName = name;
    renderShapes();
    toast(`已保存身材「${name}」（体型 + 比例）`);
}

function applyShape(entry) {
    // 换体型/比例要重建骨架，只保留关节旋转（IK 绝对位置依赖骨长，见 rotationsOnly）
    viewer.recordState();
    doc.mesh = { ...DEFAULT_MESH, ...entry.mesh };
    doc.proportions = { ...doc.proportions, ...entry.proportions };
    loadModel(rotationsOnly(viewer.getPose()));
    updateCamera(false);
    refreshControls();
    schedulePreview();
    activeShapeName = entry.name;
    renderShapes();
    toast(`已套用身材「${entry.name}」`);
}

function deleteShape(entry) {
    if (!confirm(`删除身材「${entry.name}」？`)) return;
    savedShapes = savedShapes.filter(item => item !== entry);
    if (activeShapeName === entry.name) activeShapeName = null;
    persistShapes();
    renderShapes();
    toast(`已删除身材「${entry.name}」`);
}

$('#save-shape')?.addEventListener('click', () => void saveCurrentShape());

// --- Viewport interaction: our editor's feel on top of the VNCCS core -------

function setupInteraction() {
    const THREE = viewer.THREE;
    viewer.orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    // Shift+drag moves the person inside the front frame; it must pre-empt orbit and bone picking.
    canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.shiftKey || !ready) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        viewer.recordState();
        const camera = viewer.camera;
        const distance = camera.position.distanceTo(viewer.orbit.target);
        const perPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (canvas.clientHeight * camera.zoom);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const start = { x: event.clientX, y: event.clientY, transform: { ...doc.transform } };
        const move = moveEvent => {
            const delta = right.clone().multiplyScalar((moveEvent.clientX - start.x) * perPixel)
                .add(up.clone().multiplyScalar(-(moveEvent.clientY - start.y) * perPixel));
            doc.transform = { ...start.transform, x: clamp(start.transform.x + delta.x, -50, 50), y: clamp(start.transform.y + delta.y, -50, 50) };
            viewer.setActiveCharacterAppearance({ transform: doc.transform });
            refreshControls();
        };
        const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); schedulePreview(); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
    }, { capture: true });
    // Runs after the core's own handler: if it grabbed a joint, the drag must not also orbit.
    canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        if (viewer.directDrag?.active || viewer.selectedBone || viewer.selectedIKEffector || viewer.selectedPoleTarget || viewer.transform?.dragging) {
            viewer.orbit.enabled = false;
            window.addEventListener('pointerup', () => { viewer.orbit.enabled = true; }, { once: true });
        }
    });
}

// --- Controls ---------------------------------------------------------------

const setOutput = (id, text) => { $(`#${id}-value`).textContent = text; };

function refreshBoneSliders() {
    const bone = selectedBoneName && viewer.bones?.[selectedBoneName];
    $('#bone-name').textContent = bone ? selectedBoneName : '未选择';
    $('#bone-sliders').classList.toggle('fp-disabled', !bone);
    for (const axis of ['x', 'y', 'z']) {
        const degrees = bone ? Math.round(bone.rotation[axis] * 180 / Math.PI) : 0;
        $(`#r${axis}`).value = degrees;
        setOutput(`r${axis}`, bone ? `${degrees}°` : '—');
    }
}

function refreshControls() {
    $('#zoom').value = doc.transform.zoom; setOutput('zoom', doc.transform.zoom.toFixed(2));
    $('#tx').value = doc.transform.x; setOutput('tx', doc.transform.x.toFixed(1));
    $('#ty').value = doc.transform.y; setOutput('ty', doc.transform.y.toFixed(1));
    const turn = Math.round(viewer.modelRotation?.y || 0);
    $('#turn').value = turn; setOutput('turn', `${turn}°`);
    const cam = cameraOf();
    $('#angle-yaw').value = cam.yaw; setOutput('angle-yaw', `${Math.round(cam.yaw)}°`);
    $('#angle-pitch').value = cam.pitch; setOutput('angle-pitch', `${Math.round(cam.pitch)}°`);
    $('#output-width').value = doc.width;
    $('#output-height').value = doc.height;
    $('#preview-size').textContent = `${doc.width}×${doc.height}`;
    for (const button of document.querySelectorAll('#ratios button')) {
        const [a, b] = button.dataset.ratio.split(':').map(Number);
        button.classList.toggle('active', Math.abs(doc.width / doc.height - a / b) < 0.02);
    }
    for (const [key] of BODY_SLIDERS) {
        const input = $(`#body-${key}`);
        if (input) { input.value = doc.mesh[key]; setOutput(`body-${key}`, key === 'age' ? String(doc.mesh[key]) : Number(doc.mesh[key]).toFixed(2)); }
    }
    for (const side of ['l', 'r']) setOutput(`grip-${side}`, Number($(`#grip-${side}`).value).toFixed(2));
    for (const [key] of PROPORTIONS) {
        const input = $(`#prop-${key}`);
        if (input) { input.value = doc.proportions[key]; setOutput(`prop-${key}`, `${Math.round(doc.proportions[key] * 100)}%`); }
    }
    $('#description').textContent = promptText();
    refreshBoneSliders();
}

// One undo entry per slider gesture: record before the first input event.
function bindSlider(input, onValue) {
    let gesture = false;
    input.addEventListener('input', () => {
        if (!gesture && ready) { viewer.recordState(); gesture = true; }
        onValue(Number(input.value));
    });
    input.addEventListener('change', () => { gesture = false; });
}

for (const [id, key] of [['zoom', 'zoom'], ['tx', 'x'], ['ty', 'y']]) {
    bindSlider($(`#${id}`), value => {
        doc.transform = { ...doc.transform, [key]: value };
        viewer.setActiveCharacterAppearance({ transform: doc.transform });
        refreshControls(); schedulePreview();
    });
}
const turnTo = value => { viewer.setModelRotation(0, value, 0); refreshControls(); schedulePreview(); };
bindSlider($('#turn'), turnTo);
for (const button of document.querySelectorAll('[data-turn]')) button.onclick = () => { viewer.recordState(); turnTo(Number(button.dataset.turn)); };
// --- 拍摄镜头：镜头绕人物转，人物本身不转身 ---
function setCamera(values) {
    const cam = cameraOf();
    doc.camera = {
        yaw: clamp(Number(values.yaw ?? cam.yaw) || 0, -180, 180),
        pitch: clamp(Number(values.pitch ?? cam.pitch) || 0, -60, 60),
    };
    refreshControls();
    updateCamera(true); // 视角一起跟过去，直接看到成片机位
}
bindSlider($('#angle-yaw'), value => setCamera({ yaw: value }));
bindSlider($('#angle-pitch'), value => setCamera({ pitch: value }));
for (const button of document.querySelectorAll('[data-angle-yaw]')) {
    button.onclick = () => { viewer.recordState(); setCamera({ yaw: Number(button.dataset.angleYaw) }); };
}
$('#reset-camera').onclick = () => { viewer.recordState(); setCamera({ yaw: 0, pitch: 0 }); };
// 把当前观察视角（自由转到的角度）直接定成拍摄机位
$('#angle-from-view').onclick = () => {
    const THREE = viewer.THREE;
    const pivot = viewer.sceneCameraTarget || viewer.orbit.target;
    const d = viewer.camera.position.clone().sub(pivot);
    viewer.recordState();
    setCamera({
        yaw: THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)),
        pitch: THREE.MathUtils.radToDeg(Math.atan2(d.y, Math.hypot(d.x, d.z))),
    });
};
for (const axis of ['x', 'y', 'z']) {
    bindSlider($(`#r${axis}`), value => {
        const bone = viewer.bones?.[selectedBoneName];
        if (!bone) return;
        bone.rotation[axis] = value * Math.PI / 180;
        bone.updateMatrixWorld(true);
        viewer.updateIKEffectorPositions?.();
        viewer.updateMarkers?.();
        viewer.requestRender();
        setOutput(`r${axis}`, `${value}°`);
        schedulePreview();
    });
}
for (const button of document.querySelectorAll('[data-preset]')) {
    button.onclick = () => {
        viewer.applyHandPreset(button.dataset.hand, HAND_PRESETS[button.dataset.preset]);
        $(`#grip-${button.dataset.hand}`).value = button.dataset.preset === 'FIST' ? 1 : 0;
        refreshControls(); schedulePreview();
    };
}
for (const side of ['l', 'r']) {
    bindSlider($(`#grip-${side}`), value => {
        viewer.interpolateHandPose(HAND_PRESETS.OPEN, HAND_PRESETS.FIST, value, side);
        refreshControls(); schedulePreview();
    });
}
$('#snap-view').onclick = () => updateCamera(true);
$('#fit-frame').onclick = $('#fit-frame-2').onclick = () => { viewer.recordState(); fitFrame(); };
// 橙框里的叠加图：图1 开关 / 手动选背景图 / 透明度 / 去掉
$('#overlay-image1').onclick = () => {
    if (overlay.on && overlay.kind === 'image1') { setOverlaySource('', ''); return; }
    if (!overlay.image1Url) { toast('节点上还没有图1，可改用手动选背景图'); return; }
    setOverlaySource(overlay.image1Url, 'image1');
};
$('#overlay-file').onchange = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setOverlaySource(URL.createObjectURL(file), 'file');
};
$('#overlay-opacity').value = String(overlay.opacity);
$('#overlay-opacity').oninput = event => {
    overlay.opacity = clamp(Number(event.target.value) || 0.45, 0.1, 1);
    try { localStorage.setItem('freepose.overlayOpacity', String(overlay.opacity)); } catch { /* 隐私模式下记不住 */ }
    if (overlay.plane) { overlay.plane.material.opacity = overlay.opacity; viewer.requestRender(); }
};
$('#overlay-clear').onclick = () => setOverlaySource('', '');
refreshOverlayUI();

// ===== 🧍 人偶图 ⇄ 🦴 骨骼图：把节点上的「骨架编辑器」搬进本页 =====
// 「骨骼图」= SDPose 识别出来的 COCO-18 关键点，交给 js/openpose_editor（二维骨架编辑器）
// 在本页内嵌着编辑；编辑完点右上角「应用到节点」，黑底骨架图就作为图2 写回节点。
// 节点那边的骨架编辑器入口（HIDE_SKELETON_UI）已隐藏，这里就是它的替身。
// v= 是缓存标识：改了 js/openpose_editor/index.html 后同步抬版本号，否则浏览器还用旧的
const SKELETON_EDITOR_URL = new URL('../../openpose_editor/index.html', import.meta.url).href + '?v=20261011-11';
let skeletonMode = false;   // 当前是不是骨骼图模式
let skeletonReady = false;  // 内嵌编辑器已回 openpose-ready
let openposeJson = null;    // { width, height, people }：SDPose / 上次编辑的骨架关键点
// 节点上的 SDPose 设置（宿主随 fisher-load 发来；编辑器里「⚙ 设置」改完也会同步回来）
let sdposeSettings = null;
const sdposeKeepBg = () => !!(sdposeSettings && sdposeSettings.keep_background);

// pose_json 里存的关键点（节点 onSdposeExecuted 写的 poseOpenpose）→ 编辑器要的 {width,height,people}
function openposeFromSaved(saved) {
    const op = saved?.poseOpenpose;
    if (!op || !op.people?.length) return null;
    return {
        width: Number(op.canvas_width || op.width) || 0,
        height: Number(op.canvas_height || op.height) || 0,
        people: op.people,
    };
}

function refreshSkeletonChip() {
    const chip = $('#view-mode');
    if (!chip) return;
    const has = !!openposeJson;
    chip.disabled = !has;                       // 没有 SDPose 骨架时不可点
    if (!has && skeletonMode) { setSkeletonMode(false); return; } // 骨架没了就退回人偶图，别卡在骨骼图里
    chip.textContent = skeletonMode ? '🦴 骨骼图' : '🧍 人偶图';
    chip.classList.toggle('fp-chip-on', skeletonMode);
    chip.title = !has
        ? '还没有 SDPose 骨架：先点左侧「⚡ 一键图1转人偶」或「🖼 导入图转人偶」识别一次，识别后这个按钮才能用'
        : skeletonMode
            ? '当前是「骨骼图」：正在编辑 SDPose 骨架。点一下回到 3D 人偶图（人偶姿势不会丢）'
            : '点一下切到「骨骼图」：编辑 SDPose 骨架图，可直接「应用到节点」当作图2';
    const applyButton = $('#apply-editor');
    if (applyButton && !applyButton.disabled) applyButton.textContent = skeletonMode ? '应用到节点（骨骼图）' : '应用到节点';
}

// 把关键点 + 图1（半透明垫底对照）喂给内嵌编辑器
function loadSkeletonEditor() {
    const frame = $('#skeleton-frame');
    if (!frame?.contentWindow || !openposeJson) return;
    frame.contentWindow.postMessage({
        type: 'openpose-load',
        payload: {
            pose_json: JSON.stringify({
                width: openposeJson.width || doc.width,
                height: openposeJson.height || doc.height,
                people: openposeJson.people || [],
            }),
            bg: overlay.image1Url || '', // 图1 只作对照，导出时按「保留图1 背景」决定去留
            keepBg: sdposeKeepBg(),      // 默认 false → 黑底纯骨架图，与 SDPoseDrawKeypoints 一致
        },
    }, location.origin);
}

function setSkeletonMode(on) {
    const want = !!on && !!openposeJson;
    if (want === skeletonMode) { refreshSkeletonChip(); return; }
    skeletonMode = want;
    const frame = $('#skeleton-frame');
    if (frame) {
        frame.hidden = !want;
        if (want && !frame.src) frame.src = SKELETON_EDITOR_URL;         // 首次才加载（等 openpose-ready）
        else if (want && skeletonReady) loadSkeletonEditor();            // 已加载：重新灌一次最新关键点
    }
    refreshSkeletonChip();
    if (!want) viewer.requestRender();
}

// 骨架编辑器出图回传 → 原样转发给节点（走的还是 fisher-apply，节点照人偶图那套写回图2）
function applySkeletonResult(payload) {
    const skeleton = payload?.skeleton;
    if (typeof skeleton !== 'string' || !skeleton.startsWith('data:image/')) { toast('骨架编辑器没有出图，再点一次试试'); return; }
    let edited = null;
    try {
        const parsed = JSON.parse(payload.pose_json || '{}');
        if (parsed.people?.length) {
            edited = { canvas_width: Number(parsed.width) || 0, canvas_height: Number(parsed.height) || 0, people: parsed.people };
            openposeJson = { width: edited.canvas_width, height: edited.canvas_height, people: edited.people };
        }
    } catch { /* 关键点留用上一次的 */ }
    // 人偶姿势原样带回去：切回「人偶图」时姿势还在，只是图2 这张换成了骨架图
    doc.pose = savedPose();
    const out = {
        version: 2,
        kind: 'vnccs-free-pose',
        // editorKind：告诉宿主节点「这次出的是骨架图」→ 它会把 poseReference / poseSkeleton 两个
        // 字段都写成这张图，图2 类型不管是人偶图还是骨骼图，后端取到的都是这张，不会切了类型就换回旧图
        editorKind: 'skeleton',
        ...doc,
        width: Number(edited?.canvas_width || openposeJson?.width || doc.width) || doc.width,
        height: Number(edited?.canvas_height || openposeJson?.height || doc.height) || doc.height,
        camera: { ...cameraOf() },
        poseReference: skeleton,
        poseSkeleton: skeleton,
    };
    if (edited) out.poseOpenpose = edited;
    parent.postMessage({ type: 'fisher-apply', payload: { pose_json: JSON.stringify(out), extra_prompt: extraPrompt } }, location.origin);
}

window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const frame = $('#skeleton-frame');
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'openpose-ready') { skeletonReady = true; loadSkeletonEditor(); }
    else if (event.data?.type === 'openpose-apply') applySkeletonResult(event.data.payload || {});
    else if (event.data?.type === 'openpose-close') setSkeletonMode(false); // 编辑器自己的「关闭」= 回到人偶图
    else if (event.data?.type === 'openpose-settings-request') {
        // 内嵌骨架编辑器里的「⚙ 设置」：手上有一份就直接答，没有再向节点要
        if (sdposeSettings) frame.contentWindow.postMessage({ type: 'openpose-settings', payload: sdposeSettings }, location.origin);
        else parent.postMessage({ type: 'openpose-settings-request' }, location.origin);
    } else if (event.data?.type === 'openpose-settings-save') {
        // 编辑器里改完：留一份 + 转给节点存进 sdpose_settings
        sdposeSettings = event.data.payload || null;
        if (skeletonMode && skeletonReady) loadSkeletonEditor(); // 让新的「保留背景」立刻生效
        parent.postMessage({ type: 'openpose-settings-save', payload: sdposeSettings }, location.origin);
    }
});
{
    const chip = $('#view-mode');
    if (chip) chip.onclick = () => setSkeletonMode(!skeletonMode);
}
$('#reset-bone').onclick = () => { viewer.recordState(); viewer.resetSelectedBone(); refreshControls(); schedulePreview(); };
$('#reset-pose').onclick = () => { viewer.recordState(); resetPose(); doc.openpose = null; refreshFlips(); refreshControls(); schedulePreview(); };
$('#undo').onclick = () => viewer.undo();
$('#redo').onclick = () => viewer.redo();

function setSize(width, height) {
    doc.width = round16(width);
    doc.height = round16(height);
    updateCamera(false);
}
$('#output-width').onchange = event => setSize(Number(event.target.value) || doc.width, doc.height);
$('#output-height').onchange = event => setSize(doc.width, Number(event.target.value) || doc.height);
for (const button of document.querySelectorAll('#ratios button')) {
    button.onclick = () => {
        const [a, b] = button.dataset.ratio.split(':').map(Number);
        const longSide = Math.max(doc.width, doc.height);
        setSize(a >= b ? longSide : longSide * a / b, a >= b ? longSide * b / a : longSide);
    };
}

const bodyContainer = $('#body-sliders');
for (const [key, label, min, max, step] of BODY_SLIDERS) {
    bodyContainer.insertAdjacentHTML('beforeend', `<label class="slider-label">${label}<output id="body-${key}-value"></output></label><input id="body-${key}" type="range" min="${min}" max="${max}" step="${step}">`);
    $(`#body-${key}`).addEventListener('input', event => {
        doc.mesh = { ...doc.mesh, [key]: Number(event.target.value) };
        if (activeShapeName) { activeShapeName = null; renderShapes(); }
        refreshControls();
        clearTimeout(morphTimer);
        morphTimer = setTimeout(() => { loadModel(rotationsOnly(viewer.getPose())); updateCamera(false); }, 120);
    });
}
$('#reset-body').onclick = () => { doc.mesh = { ...DEFAULT_MESH }; loadModel(rotationsOnly(viewer.getPose())); updateCamera(false); };

const proportionContainer = $('#proportion-sliders');
for (const [key, label, min, max] of PROPORTIONS) {
    proportionContainer.insertAdjacentHTML('beforeend', `<label class="slider-label">${label}<output id="prop-${key}-value"></output></label><input id="prop-${key}" type="range" min="${min}" max="${max}" step="0.01">`);
    $(`#prop-${key}`).addEventListener('input', event => {
        setProportion(key, Number(event.target.value));
        refreshControls();
        schedulePreview();
    });
}
$('#reset-proportions').onclick = () => {
    for (const [key] of PROPORTIONS) setProportion(key, 1);
    refreshControls();
    schedulePreview();
};
const fitToggle = $('#fit-person');
if (fitToggle) {
    fitToggle.checked = fitPersonOn;
    fitToggle.onchange = () => {
        fitPersonOn = fitToggle.checked;
        try { localStorage.setItem('freepose.fitPerson', fitPersonOn ? '1' : '0'); } catch { /* 隐私模式记不住 */ }
        // 打开时立刻按已识别的骨架重匹配一次，方便对比开关效果（只对 SDPose 真人骨架有意义）
        if (!fitPersonOn || !doc.openpose?.points || !String(doc.openpose.key || '').startsWith('sdpose:')) return;
        try {
            const m = measurePerson(doc.openpose.points, null);
            const f = fitProportionsToPerson(m);
            applyOpenPose();
            if (f.scale > 0) fitScaleAndPositionToPerson(m, f.scale);
            refreshControls();
            schedulePreview();
            toast('已按真人匹配身材');
        } catch (error) { console.warn('[Fisher] 身材匹配失败', error); }
    };
}

for (const button of document.querySelectorAll('.panel-tabs button')) {
    button.onclick = () => {
        for (const other of document.querySelectorAll('.panel-tabs button')) other.classList.toggle('active', other === button);
        for (const tab of ['output', 'pose', 'body', 'proportion']) $(`#${tab}-panel`).hidden = tab !== button.dataset.tab;
    };
}
$('#extra-prompt').addEventListener('input', event => { extraPrompt = event.target.value; refreshControls(); });
$('#copy-description').onclick = async () => { try { await navigator.clipboard.writeText(promptText()); toast('已复制'); } catch { toast('复制失败'); } };

document.addEventListener('keydown', event => {
    if (event.target.closest?.('textarea, input[type=number], input[type=search]')) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); viewer.undo(); }
    else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); viewer.redo(); }
});
new ResizeObserver(() => viewer.resize(stage.clientWidth, stage.clientHeight)).observe(stage);

// --- Node bridge ------------------------------------------------------------

async function serialize() {
    await viewer.waitForCaptureReady();
    const poseReference = capture(doc.width, doc.height);
    updateCamera(false);
    doc.pose = savedPose();
    return JSON.stringify({ version: 2, kind: 'vnccs-free-pose', ...doc, camera: { ...cameraOf() }, poseReference });
}

// Shared by the node payload and 我的姿势: any saved editor state → a complete doc.
function docFrom(saved) {
    return {
        mesh: { ...DEFAULT_MESH, ...saved.mesh, breast_size: 0 }, pose: saved.pose || null, // flat chest is fixed
        proportions: { ...DEFAULT_PROPORTIONS, ...saved.proportions },
        transform: { ...NEUTRAL_TRANSFORM, ...saved.transform },
        // The mannequin size lives only here; the node's width/height are the separate output size.
        width: round16(Number(saved.width) || doc.width), height: round16(Number(saved.height) || doc.height),
        openpose: saved.openpose || null,
        camera: { ...DEFAULT_CAMERA, ...saved.camera }, // 拍摄机位随姿势一起存
    };
}

function applyPayload(payload) {
    const saved = JSON.parse(payload.pose_json || '{}');
    const restored = saved.kind === 'vnccs-free-pose';
    if (restored) doc = docFrom(saved);
    // 宿主存下来的 SDPose 关键点：「骨骼图」按钮要靠它才能用（一键转人偶 / 导入图转人偶 之后就有）
    openposeJson = openposeFromSaved(saved);
    if (skeletonMode && skeletonReady) loadSkeletonEditor(); // 换了骨架就把内嵌编辑器刷新一次
    refreshSkeletonChip();
    // 宿主节点传入的画布尺寸（如 SDPose 骨架图的宽高）优先于节点里的默认值
    if (Number(payload?.width) > 0) doc.width = round16(Number(payload.width));
    if (Number(payload?.height) > 0) doc.height = round16(Number(payload.height));
    // 宿主这次明确带了头部点就覆盖；这次没带（骨骼图没有脸部数据）要清空，
    // 否则会沿用上一次的朝向把头扭到错误的角度
    if (payload && 'headPoints' in payload) sdposeHead = payload.headPoints || null;
    extraPrompt = payload.extra_prompt || '';
    $('#extra-prompt').value = extraPrompt;
    if (payload.referencePreview) {
        $('#person-preview').src = payload.referencePreview;
        $('#person-preview-wrap').hidden = false;
    }
    // 宿主传的图1：供「叠加图1」对位用（换图/换人后跟着更新；本页手动选的背景图不受影响）
    if (payload && 'image1' in payload) {
        overlay.image1Url = payload.image1 || '';
        if (overlay.kind === 'image1') setOverlaySource(overlay.image1Url, 'image1');
        else refreshOverlayUI();
    }
    return restored;
}

let pendingPayload = null;
async function start(payload) {
    const restored = payload ? applyPayload(payload) : false;
    loadModel(doc.pose);
    setupInteraction();
    ready = true;
    if (restored) updateCamera(true);
    else fitFrame(true);
    refreshFlips();
    void loadLibrary();
    void loadSavedList();
    loadShapes();
    await viewer.waitForCaptureReady();
    refreshSkeletonChip(); // 人偶加载完再刷一次：有没有 SDPose 骨架决定「骨骼图」按钮能不能点
    // 宿主节点传入的骨架图（如 SDPose 一键骨架生成的黑底图）：
    // auto 时打开即摆好；之后按钮仍在，可随时重新按它摆姿
    if (payload?.openposeEntry) {
        sdposeEntry = payload.openposeEntry;
        refreshSdposeButton();
        const status = $('#import-status');
        // autoApply = 宿主点的「一键人偶姿势」：无条件摆姿并出图，不等用户操作
        const autoApply = !!payload.autoApply;
        if (!sdposeEntry.auto && !autoApply) {
            status.textContent = `已收到「${sdposeEntry.name}」骨架图，点上面的按钮即可摆姿。`;
        } else {
            sdposeEntry.auto = false;
            try {
                status.textContent = `正在按「${sdposeEntry.name}」摆姿…`;
                await importEntry(sdposeEntry);
                if (autoApply) {
                    // importEntry 自己吞异常，只置 failed：识别不出骨架就别拿默认姿势出图
                    if (sdposeEntry.failed) throw new Error(status.textContent || '骨架图无法识别');
                    status.textContent = '正在生成人偶图…';
                    await applyToNode();
                }
            } catch (error) {
                showError(error);
                if (autoApply) parent.postMessage({ type: 'fisher-error', message: String(error?.message || error) }, location.origin);
            }
        }
    }
    $('#loading').hidden = true;
    $('#apply-editor').disabled = false;
    $('#save-status').textContent = restored ? '已载入节点中的姿势' : '新姿势：可用左侧 OpenPose 图一键摆姿';
    schedulePreview();
}

window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin) return;
    // 宿主明确回报失败（没检测到人 / 上传失败 / 没接模型）：恢复按钮并写清原因，
    // 否则两个按钮一直卡在「识别中…」，看起来就像功能失效了
    if (event.data?.type === 'fisher-doll-failed') {
        resetOnekeyDoll();
        const reason = event.data?.payload?.message || event.data?.message || '请重试';
        const status = $('#import-status');
        if (status) status.textContent = `识别失败：${reason}`;
        return;
    }
    // 节点把 SDPose 设置发回来了（内嵌骨架编辑器的「⚙ 设置」要的）：转下去
    if (event.data?.type === 'openpose-settings') {
        sdposeSettings = event.data.payload || null;
        $('#skeleton-frame')?.contentWindow?.postMessage(event.data, location.origin);
        return;
    }
    if (event.data?.type !== 'fisher-load') return;
    // 节点上的 SDPose 设置（内嵌骨架编辑器的「保留图1 背景」等按它来）
    if (event.data.payload?.sdposeSettings) {
        sdposeSettings = event.data.payload.sdposeSettings;
        if (skeletonMode && skeletonReady) loadSkeletonEditor();
    }
    // 宿主已回应。若是本页发起的「一键人偶姿势」，摆完就恢复按钮 —— 结果留在编辑器里，不回传节点
    const wasOnekey = onekeyButtons.some(button => button.disabled);
    const settleOnekey = () => {
        if (!wasOnekey) return;
        resetOnekeyDoll();
        // 摆完就停在这里：提示用户继续微调，由他自己决定何时应用到节点
        const status = $('#import-status');
        if (status && !sdposeEntry?.failed) {
            status.textContent = onekeyFromImport
                ? '已按导入图的骨架摆好，微调后点右上角「应用到节点」。'
                : '已按图1 的骨架摆好，微调后点右上角「应用到节点」。';
        }
    };
    if (pack) start(event.data.payload).then(settleOnekey).catch(error => { settleOnekey(); showError(error); });
    else { pendingPayload = event.data.payload; settleOnekey(); }
});
$('#cancel-editor').onclick = () => parent.postMessage({ type: 'fisher-close' }, location.origin);
// 渲染人偶图并回传给宿主节点（即「应用到节点」）
async function applyToNode() {
    const pose_json = await serialize();
    parent.postMessage({ type: 'fisher-apply', payload: { pose_json, extra_prompt: extraPrompt } }, location.origin);
}
$('#apply-editor').onclick = async () => {
    // 骨骼图模式：让内嵌的骨架编辑器出图，它回 openpose-apply 后再由 applySkeletonResult 转给节点
    const frame = $('#skeleton-frame');
    if (skeletonMode && frame?.contentWindow) {
        frame.contentWindow.postMessage({ type: 'openpose-apply-request' }, location.origin);
        return;
    }
    $('#apply-editor').disabled = true;
    try { await applyToNode(); } catch (error) { showError(error); }
    finally { $('#apply-editor').disabled = false; refreshSkeletonChip(); }
};

function showError(error) {
    console.error(error);
    $('#loading-text').textContent = '加载失败：' + (error?.message || error);
    $('#loading').hidden = false;
}

if (!embedded) { $('#apply-editor').hidden = true; $('#cancel-editor').hidden = true; $('#view-mode').hidden = true; }
window.freePose = { viewer, get doc() { return doc; }, serialize, prompt: promptText, fitFrame, importEntry, addFiles, saveCurrentPose, loadSavedPose, deleteSavedPose };

(async () => {
    await viewer.init();
    if (!viewer.initialized) throw new Error('WebGL 初始化失败');
    // The official QI2.1 workflow runs with the skydome disabled; it would otherwise be captured.
    viewer.setDirectionalSkydomeVisible(false);
    refreshControls();
    if (embedded) parent.postMessage({ type: 'fisher-ready' }, location.origin);
    pack = await loadBodyPack();
    if (embedded && !pendingPayload) return; // start() runs when the node payload arrives
    await start(pendingPayload);
})().catch(showError);
