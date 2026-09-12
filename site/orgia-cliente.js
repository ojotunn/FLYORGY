// Cliente do FLY ORGY: N moscas na mesma cena, em pares, desenhadas no navegador.
//
// O que muda em relacao ao SEX FLY (2 moscas, um Object3D por peca):
//   1. INSTANCIACAO. Sao 69 pecas de malha por mosca. Com 16 moscas + reflexo isso daria 2.208
//      chamadas de desenho por quadro e a placa do visitante morreria. Aqui cada peca vira UM
//      InstancedMesh com uma matriz por mosca: 69 chamadas, nao importa quantas moscas.
//   2. ATRASO POR MOSCA. O corpo (corpo/corpo.py) manda UM fluxo de pose, 30x por segundo. Guardo
//      os ultimos ~4 s num anel e cada mosca le num atraso diferente, entao elas nao ficam clones
//      congelados no mesmo passo de perna. E a mesma animacao anatomica, so que defasada.
//   3. RITMO POR PAR. Cada par tem libido, estado e frequencia proprios, vindos dos DOIS cerebros
//      dele (o mercado manda). O que voce ve bombando rapido e um par com libido alta de verdade.
//   4. AUTO-AJUSTE. Se o quadro cair abaixo de 40 fps ele desliga o reflexo; abaixo de 30, baixa a
//      resolucao. Sem isso um celular fraco viraria slideshow.
window.decodeDV = function (u8) {
  const out = new Uint32Array(u8.length); let n = 0, acc = 0, i = 0;
  while (i < u8.length) { let v = 0, s = 0, b; do { b = u8[i++]; v |= (b & 0x7F) << s; s += 7; } while ((b & 0x80) && i < u8.length); acc += v; out[n++] = acc; }
  return out.subarray(0, n);
};

window.Orgia = (function () {
  const ATRASO_MS = 50;              // renderiza atras do ultimo quadro para interpolar
  const ANEL = 150;                  // quadros de pose guardados (~5 s a 30 fps)
  const S = {
    pronto: false, ren: null, scene: null, cam: null, canvas: null, box: null,
    nq: 0, fovy: 45, corpos: [], juntas: [], geoms: [], raiz: -1, asas: {}, abd: [],
    inst: [], instE: [], locais: [], matriz: [], qtmp: null, qtmp2: null,
    anel: [], anelT: [], anelN: 0, ultimo: 0, erro: null,
    NF: 16, pares: [], moscas: [], reflexo: true, cal: null, calN: 0,
    fps: 60, fpsT: 0, fpsN: 0, degrau: 0, ruim: 0, aquece: 0,
    orbita: { az: 0.7, el: 0.30, dist: 26, alvo: [0, 0, 1.2], vel: 0.10 },
    aj: { raboBase: 0.45, raboAmp: 0.35, pitch: -0.15, alvo: 1.05 },   // mesma calibracao medida no SEX FLY
  };
  const M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), M3 = new THREE.Matrix4();
  const MI = new THREE.Matrix4(), MS = new THREE.Matrix4().makeScale(1, 1, -1);
  const Q = new THREE.Quaternion(), V = new THREE.Vector3(), UM = new THREE.Vector3(1, 1, 1);
  const RM = new THREE.Matrix4(), RQ = new THREE.Quaternion(), RE = new THREE.Euler();

  function TR(pos, quat, out) { return out.compose(V.set(pos[0], pos[1], pos[2]), Q.set(quat[1], quat[2], quat[3], quat[0]), UM); }

  // ---------- arranjo do enxame: pares em aneis, virados para dentro ----------
  function arranjar(nf) {
    const np = Math.floor(nf / 2); S.pares = []; S.moscas = [];
    for (let p = 0; p < np; p++) {
      const anel = p < 3 ? 0 : (p < 8 ? 1 : 2);
      const naAnel = anel === 0 ? Math.min(3, np) : (anel === 1 ? Math.min(5, np - 3) : np - 8);
      const iAnel = anel === 0 ? p : (anel === 1 ? p - 3 : p - 8);
      const r = [3.4, 7.6, 11.4][anel];
      const a = (iAnel / Math.max(1, naAnel)) * Math.PI * 2 + [0.0, 0.55, 1.1][anel];
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const yaw = a + Math.PI * 0.5 + (((p * 2654435761) % 1000) / 1000 - 0.5) * 0.9;   // meio de lado, sem sorteio a cada carga
      S.pares.push({
        p, x, y, yaw, atraso: (p * 137) % 3600,        // ms de atraso no anel de poses
        libido: 0, estado: 'idle', ritmo: 1.2, t0: performance.now(), t_est: performance.now(),
        empurrao: 0, fase: (p * 0.61803) % 1,
      });
      S.moscas.push({ par: p, papel: 'f' }, { par: p, papel: 'm' });
    }
    S.NF = S.moscas.length;
  }

  async function init(canvas, nf) {
    S.canvas = canvas; S.box = canvas.parentElement;
    arranjar(nf || 16);
    try {
      const [j, bin] = await Promise.all([
        fetch('/static/fly-model.json').then(r => r.json()),
        fetch('/static/fly-model.bin').then(r => r.arrayBuffer()),
      ]);
      montar(j, bin); S.pronto = true; requestAnimationFrame(loop);
    } catch (e) { S.erro = e; console.error('Orgia', e); }
  }

  function montar(j, bin) {
    S.nq = j.nq; S.fovy = (j.cam && j.cam.fovy) || 45;
    S.ren = new THREE.WebGLRenderer({ canvas: S.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    S.ren.setClearColor(0x000000, 1); S.ren.outputColorSpace = THREE.SRGBColorSpace;
    S.scene = new THREE.Scene(); S.scene.background = new THREE.Color(0x000000);
    S.cam = new THREE.PerspectiveCamera(S.fovy, 2, 0.3, 900); S.cam.up.set(0, 0, 1);
    S.scene.add(new THREE.HemisphereLight(0xffffff, 0x14141a, 0.85));
    const sol = new THREE.DirectionalLight(0xfff4e2, 1.5); sol.position.set(-3, -4, 10); S.scene.add(sol);
    const contra = new THREE.DirectionalLight(0xff7a4a, 0.45); contra.position.set(6, 3, 3); S.scene.add(contra);

    const texs = {}, mats = {}, matsE = {};
    for (const [k, m] of Object.entries(j.materiais)) {
      const reserva = m.tex ? new THREE.Color(0.52, 0.40, 0.28) : new THREE.Color(m.rgba[0], m.rgba[1], m.rgba[2]);
      const cor = new THREE.Color(m.rgba[0], m.rgba[1], m.rgba[2]); const a = m.rgba[3];
      mats[k] = new THREE.MeshStandardMaterial({ color: m.tex ? reserva : cor, transparent: a < 0.999, opacity: a, roughness: Math.max(0.3, 1 - 0.7 * (m.shininess || 0.3)), metalness: 0.0, side: THREE.DoubleSide });
      matsE[k] = new THREE.MeshBasicMaterial({ color: (m.tex ? reserva : cor).clone().multiplyScalar(0.5), transparent: true, opacity: 0.18 * a, side: THREE.DoubleSide, depthWrite: false });
      if (m.tex) {
        const aplicar = (t) => { for (const mm of [mats[k], matsE[k]]) { mm.map = t; mm.color.copy(mm === mats[k] ? cor : cor.clone().multiplyScalar(0.5)); mm.needsUpdate = true; } };
        if (texs[m.tex]) { const t = texs[m.tex]; if (t.image) aplicar(t); else t.__esperando.push(aplicar); }
        else {
          const loader = new THREE.TextureLoader();
          const t = loader.load('/static/fly-tex/' + m.tex + '.png', (tx) => { (tx.__esperando || []).forEach(f => f(tx)); tx.__esperando = []; }, undefined, () => console.warn('textura nao carregou:', m.tex));
          t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.__esperando = [aplicar]; texs[m.tex] = t;
        }
      }
    }
    const geos = j.malhas.map(ml => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, ml.off_pos, ml.nv * 3), 3));
      if (ml.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, ml.off_uv, ml.nv * 2), 2));
      g.setIndex(new THREE.BufferAttribute(ml.idx16 ? new Uint16Array(bin, ml.off_idx, ml.nf * 3) : new Uint32Array(bin, ml.off_idx, ml.nf * 3), 1));
      g.computeVertexNormals(); return g;
    });

    S.corpos = j.corpos; S.geoms = j.geoms;
    S.juntas = j.corpos.map(() => []); j.juntas.forEach(jt => S.juntas[jt.corpo].push(jt));
    S.matriz = j.corpos.map(() => new THREE.Matrix4());
    j.juntas.forEach(jt => { if (jt.tipo === 0) S.raiz = jt.qadr; if (jt.nome) S.asas[jt.nome] = jt.qadr; });
    S.abd = j.corpos.map((c, i) => [c.nome, i]).filter(x => ['A1A2', 'A3', 'A4', 'A5', 'A6'].includes(x[0])).map(x => x[1]);

    // uma malha instanciada por peca: 69 chamadas de desenho para o enxame inteiro
    for (const g of j.geoms) {
      const local = new THREE.Matrix4(); TR(g.pos, g.quat, local); S.locais.push(local);
      const im = new THREE.InstancedMesh(geos[g.malha], mats[g.mat], S.NF);
      im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.renderOrder = 2;
      S.scene.add(im); S.inst.push(im);
      const ime = new THREE.InstancedMesh(geos[g.malha], matsE[g.mat], S.NF);
      ime.frustumCulled = false; ime.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ime.renderOrder = 0;
      S.scene.add(ime); S.instE.push(ime);
    }
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.82, depthWrite: false }));
    chao.renderOrder = 1; S.scene.add(chao);

    S.qtmp = new Float32Array(S.nq); S.qtmp2 = new Float32Array(S.nq);
    for (let i = 0; i < ANEL; i++) { S.anel.push(null); S.anelT.push(0); }
    redimensionar(); new ResizeObserver(redimensionar).observe(S.box);
  }

  function redimensionar() {
    if (!S.ren) return;
    const r = S.box.getBoundingClientRect(); const w = Math.max(2, r.width), h = Math.max(2, r.height);
    const teto = S.degrau >= 2 ? 1.0 : 1.5;
    S.ren.setPixelRatio(Math.min(teto, window.devicePixelRatio || 1)); S.ren.setSize(w, h, false);
    S.cam.aspect = w / h; S.cam.updateProjectionMatrix();
  }

  // ---------- entrada ----------
  function quadro(j, bytes) {           // pose vinda de corpo/corpo.py
    const q = new Float32Array(bytes);
    if (!S.pronto || q.length !== S.nq) return;
    const i = S.anelN % ANEL;
    S.anel[i] = q; S.anelT[i] = performance.now(); S.anelN++; S.ultimo = S.anelT[i];
  }

  function sexo(m) {                     // estado dos pares, vindo do mercado (um por par)
    if (!m || !Array.isArray(m.pares)) return;
    for (const d of m.pares) {
      const p = S.pares[d.i]; if (!p) continue;
      if (d.estado && d.estado !== p.estado) { p.estado = d.estado; p.t_est = performance.now(); }
      if (d.libido != null) p.libido = d.libido;
      if (d.ritmo != null) p.ritmo = d.ritmo;
      if (d.empurrao != null) p.empurrao = d.empurrao;
    }
  }

  // ---------- pose atrasada: le o anel em (agora - atraso) e interpola ----------
  function poseEm(alvoMs, saida) {
    let a = -1, b = -1;
    for (let k = 0; k < ANEL; k++) {
      const i = (S.anelN - 1 - k + ANEL * 4) % ANEL;
      if (!S.anel[i]) continue;
      if (S.anelT[i] <= alvoMs) { a = i; break; }
      b = i;
    }
    if (a < 0) { const u = (S.anelN - 1 + ANEL * 4) % ANEL; return S.anel[u]; }
    if (b < 0) return S.anel[a];
    const t0 = S.anelT[a], t1 = S.anelT[b];
    const al = t1 > t0 ? Math.max(0, Math.min(1, (alvoMs - t0) / (t1 - t0))) : 0;
    const q0 = S.anel[a], q1 = S.anel[b];
    for (let i = 0; i < saida.length; i++) saida[i] = q0[i] + (q1[i] - q0[i]) * al;
    return saida;
  }

  // ---------- cinematica direta, escrevendo direto nas instancias ----------
  function aplicarInstancia(q, raizM, f, espelho) {
    const mat = S.matriz;
    for (let b = 0; b < S.corpos.length; b++) {
      const c = S.corpos[b], jl = S.juntas[b], W = mat[b];
      if (jl.length && jl[0].tipo === 0) { W.copy(raizM); }
      else {
        TR(c.pos, c.quat, W);
        for (const jt of jl) {
          const a = jt.qadr;
          if (jt.tipo === 3) { M.makeTranslation(jt.pos[0], jt.pos[1], jt.pos[2]); M2.makeRotationAxis(V.set(jt.eixo[0], jt.eixo[1], jt.eixo[2]), q[a]); M3.makeTranslation(-jt.pos[0], -jt.pos[1], -jt.pos[2]); W.multiply(M).multiply(M2).multiply(M3); }
          else if (jt.tipo === 2) { M.makeTranslation(jt.eixo[0] * q[a], jt.eixo[1] * q[a], jt.eixo[2] * q[a]); W.multiply(M); }
          else if (jt.tipo === 1) { M.makeTranslation(jt.pos[0], jt.pos[1], jt.pos[2]); M2.makeRotationFromQuaternion(Q.set(q[a + 1], q[a + 2], q[a + 3], q[a]).normalize()); M3.makeTranslation(-jt.pos[0], -jt.pos[1], -jt.pos[2]); W.multiply(M).multiply(M2).multiply(M3); }
        }
        if (c.pai >= 0) W.premultiply(mat[c.pai]);
      }
    }
    for (let g = 0; g < S.geoms.length; g++) {
      MI.multiplyMatrices(mat[S.geoms[g].corpo], S.locais[g]);
      S.inst[g].setMatrixAt(f, MI);
      if (espelho) { M2.multiplyMatrices(MS, MI); S.instE[g].setMatrixAt(f, M2); }
    }
  }

  function balancarRabo(ang) {          // curva o abdomen dele para baixo (a bombada)
    for (let k = 1; k < S.abd.length; k++) {
      const b = S.abd[k];
      RE.set(0, ang / (S.abd.length - 1), 0); RQ.setFromEuler(RE);
      M.makeRotationFromQuaternion(RQ); S.matriz[b].multiply(M);
    }
  }

  // ---------- camada sexual: o macho montado, a partir da pose dela ----------
  const POSES = {
    idle: { p: [-2.2, 1.5, 0.0], yaw: 0.5, pitch: 0 },
    courting: { p: [-1.55, 0.30, 0.0], yaw: 0.18, pitch: 0 },
    rejected: { p: [-2.9, 1.9, 0.0], yaw: 1.0, pitch: 0 },
    mating: { p: [-0.60, 0.0, 0.90], yaw: 0, pitch: -0.10 },
  };

  function poseMacho(q, par, tt, saida) {
    saida.set(q);
    const est = par.estado, lib = par.libido, ritmo = par.ritmo;
    const f = Math.sin(tt * 2 * Math.PI * ritmo + par.fase * 6.283);
    if (est === 'mating') {
      const ab = 0.22 + 0.12 * lib + 0.06 * Math.sin(tt * 2 * Math.PI * ritmo * 2);
      if (S.asas.joint_LWing_abre != null) {
        saida[S.asas.joint_LWing_abre] += ab; saida[S.asas.joint_RWing_abre] += ab;
        saida[S.asas.joint_LWing_bate] += 0.05 * Math.sin(tt * 2 * Math.PI * ritmo * 4);
        saida[S.asas.joint_RWing_bate] += 0.05 * Math.sin(tt * 2 * Math.PI * ritmo * 4);
      }
      if (S.asas.joint_Head != null) saida[S.asas.joint_Head] += 0.15 + 0.1 * Math.max(0, f);
      if (S.asas.joint_Proboscis != null) saida[S.asas.joint_Proboscis] += 0.5 * Math.max(0, Math.sin(tt * Math.PI * ritmo));
      for (const perna of ['LF', 'LM', 'LH', 'RF', 'RM', 'RH']) {
        const fe = S.asas['joint_' + perna + 'Femur'], ti = S.asas['joint_' + perna + 'Tibia'], cx = S.asas['joint_' + perna + 'Coxa'];
        const tipo = perna[1];
        if (tipo === 'F') { if (cx != null) saida[cx] -= 0.35; if (fe != null) saida[fe] -= 0.6; if (ti != null) saida[ti] += 1.0; }
        else if (tipo === 'M') { if (fe != null) saida[fe] -= 0.45; if (ti != null) saida[ti] += 0.9; }
        else { if (fe != null) saida[fe] -= 0.2; if (ti != null) saida[ti] += 0.9; }
      }
    } else if (est === 'courting') {
      const vib = Math.sin(tt * 2 * Math.PI * 24) * 0.22;
      if (S.asas.joint_LWing_abre != null) { saida[S.asas.joint_LWing_abre] += 1.15 + vib; saida[S.asas.joint_LWing_bate] += vib * 0.5; }
    } else if (est === 'rejected') {
      if (S.asas.joint_LWing_abre != null) { saida[S.asas.joint_LWing_abre] += 0.9; saida[S.asas.joint_RWing_abre] += 0.9; }
    }
    return f;
  }

  function raizDoPar(par, dz) {
    RE.set(0, 0, par.yaw); RQ.setFromEuler(RE);
    return RM.compose(V.set(par.x, par.y, dz || 0), RQ, UM);
  }

  // ---------- laco ----------
  function loop() {
    requestAnimationFrame(loop);
    if (!S.pronto || S.anelN === 0) return;
    const agora = performance.now();
    if (agora - S.ultimo > 8000) return;                 // corpo parado: nao gasta a placa do visitante
    medirFps(agora);

    for (let p = 0; p < S.pares.length; p++) {
      const par = S.pares[p];
      const qEla = poseEm(agora - ATRASO_MS - par.atraso, S.qtmp);
      if (!qEla) continue;
      const tt = (agora - par.t0) / 1000;
      const u = Math.min(1, (agora - par.t_est) / 700);

      // ela: raiz no lugar do par, asas quase fechadas quando montada (senao ele atravessa)
      if (par.estado === 'mating' && S.asas.joint_LWing_abre != null) {
        const ab = 0.04 + 0.03 * Math.sin(tt * 2 * Math.PI * par.ritmo);
        qEla[S.asas.joint_LWing_abre] += ab; qEla[S.asas.joint_RWing_abre] += ab;
      }
      const raizF = raizDoPar(par, 0).clone();
      aplicarInstancia(qEla, raizF, p * 2, S.reflexo);

      // ele: mesma malha, pose propria, montado nela
      const f = poseMacho(qEla, par, tt, S.qtmp2);
      const alvo = POSES[par.estado] || POSES.idle;
      let px = alvo.p[0], py = alvo.p[1], pz = alvo.p[2];
      const pitch = par.estado === 'mating' ? S.aj.pitch : alvo.pitch;
      if (par.estado === 'mating' && S.cal) { px += S.cal[0] * u; py += S.cal[1] * u; pz += S.cal[2] * u; }
      if (par.estado === 'idle') py += 0.05 * Math.sin(tt * 2 * Math.PI * 0.3);
      RE.set(0, pitch, par.yaw + alvo.yaw); RQ.setFromEuler(RE);
      const cy = Math.cos(par.yaw), sy = Math.sin(par.yaw);
      RM.compose(V.set(par.x + px * cy - py * sy, par.y + px * sy + py * cy, pz), RQ, UM);
      aplicarInstancia(S.qtmp2, RM, p * 2 + 1, S.reflexo);
      if (par.estado === 'mating') {          // a bombada: curva o abdomen dele e reescreve as pecas
        const ang = S.aj.raboBase + S.aj.raboAmp * (0.5 + 0.5 * f) + 0.2 * par.libido;
        balancarRabo(ang);
        for (let g = 0; g < S.geoms.length; g++) {
          MI.multiplyMatrices(S.matriz[S.geoms[g].corpo], S.locais[g]);
          S.inst[g].setMatrixAt(p * 2 + 1, MI);
          if (S.reflexo) { M2.multiplyMatrices(MS, MI); S.instE[g].setMatrixAt(p * 2 + 1, M2); }
        }
      }
    }
    for (let g = 0; g < S.geoms.length; g++) {
      S.inst[g].instanceMatrix.needsUpdate = true;
      S.instE[g].visible = S.reflexo;
      if (S.reflexo) S.instE[g].instanceMatrix.needsUpdate = true;
    }

    const o = S.orbita; o.az += o.vel * (1 / 60);
    const a = o.alvo;
    S.cam.position.set(a[0] + o.dist * Math.cos(o.el) * Math.cos(o.az), a[1] + o.dist * Math.cos(o.el) * Math.sin(o.az), a[2] + o.dist * Math.sin(o.el));
    S.cam.lookAt(a[0], a[1], a[2]);
    S.ren.render(S.scene, S.cam);
  }

  // desliga enfeite sozinho se a placa do visitante nao aguentar
  function medirFps(agora) {
    S.fpsN++;
    if (!S.fpsT) { S.fpsT = agora; S.aquece = agora + 6000; return; }   // 6 s de aquecimento: textura, compilacao de shader
    if (agora - S.fpsT < 2000) return;
    S.fps = S.fpsN / ((agora - S.fpsT) / 1000); S.fpsN = 0; S.fpsT = agora;
    if (agora < S.aquece) return;
    S.ruim = S.fps < 40 ? S.ruim + 1 : 0;                               // duas janelas ruins seguidas, nao uma
    if (S.ruim < 2) return;
    if (S.degrau === 0) { S.degrau = 1; S.reflexo = false; S.ruim = 0; console.warn('orgia: reflexo off,', S.fps.toFixed(0), 'fps'); }
    else if (S.degrau === 1 && S.fps < 30) { S.degrau = 2; S.ruim = 0; redimensionar(); console.warn('orgia: resolucao menor,', S.fps.toFixed(0), 'fps'); }
  }

  // calibracao do encaixe (ponta do abdomen dele na dela): uma vez a cada 60 quadros, sobre a pose
  // base - o modelo e o mesmo para todas, entao a correcao serve para o enxame inteiro
  function calibrar() {
    if (!S.pronto || S.anelN === 0 || S.pares.length === 0) return;
    const par = S.pares[0], q = poseEm(performance.now() - ATRASO_MS, S.qtmp);
    if (!q) return;
    const raizF = raizDoPar(par, 0).clone();
    aplicarInstancia(q, raizF, 0, false);
    const i5 = S.abd[S.abd.length - 2], i6 = S.abd[S.abd.length - 1];
    const a5 = new THREE.Vector3().setFromMatrixPosition(S.matriz[i5]);
    const a6 = new THREE.Vector3().setFromMatrixPosition(S.matriz[i6]);
    const pontaEla = a6.clone().add(a6.clone().sub(a5)).sub(new THREE.Vector3(par.x, par.y, 0));
    const pico = Object.assign({}, par, { estado: 'mating', libido: 1 });
    poseMacho(q, pico, 0.25 / Math.max(0.1, par.ritmo), S.qtmp2);
    const alvo = POSES.mating;
    RE.set(0, S.aj.pitch, par.yaw); RQ.setFromEuler(RE);
    const cy = Math.cos(par.yaw), sy = Math.sin(par.yaw);
    RM.compose(V.set(par.x + alvo.p[0] * cy, par.y + alvo.p[0] * sy, alvo.p[2]), RQ, UM);
    aplicarInstancia(S.qtmp2, RM, 1, false);
    balancarRabo(S.aj.raboBase + S.aj.raboAmp + 0.2);
    const b5 = new THREE.Vector3().setFromMatrixPosition(S.matriz[i5]);
    const b6 = new THREE.Vector3().setFromMatrixPosition(S.matriz[i6]);
    const pontaEle = b6.clone().add(b6.clone().sub(b5)).sub(new THREE.Vector3(par.x, par.y, 0));
    const d = pontaEla.clone().multiplyScalar(S.aj.alvo).sub(pontaEle);
    const dx = d.x * cy + d.y * sy, dy = -d.x * sy + d.y * cy;    // volta ao referencial dela
    S.cal = [dx, dy, d.z];
  }
  setInterval(calibrar, 2000);

  return {
    init, quadro, sexo, calibrar,
    estado: () => ({ fps: S.fps, moscas: S.NF, pares: S.pares.length, reflexo: S.reflexo, erro: S.erro }),
    camera: (o) => Object.assign(S.orbita, o || {}),
  };
})();
