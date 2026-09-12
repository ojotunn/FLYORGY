// Cliente do FLY ORGY: N moscas na mesma cena, em pares, desenhadas no navegador.
//
// O que muda em relacao ao SEX FLY (2 moscas, um Object3D por peca):
//   1. INSTANCIACAO. Sao 69 pecas de malha por mosca. Com 32 moscas isso daria 2.208 chamadas de
//      desenho por quadro e a placa do visitante morreria. Aqui cada peca vira UM InstancedMesh com
//      uma matriz por mosca: 69 chamadas, nao importa quantas moscas.
//   2. ATRASO POR MOSCA. O corpo (corpo/corpo.py) manda UM fluxo de pose, 30x por segundo. Guardo os
//      ultimos ~5 s num anel e cada mosca le num atraso diferente, entao elas nao ficam clones
//      congelados no mesmo passo de perna. E a mesma animacao anatomica, so que defasada.
//   3. RITMO POR PAR. Cada par tem libido, estado e frequencia proprios, vindos dos DOIS cerebros
//      dele (o mercado manda). O que voce ve bombando rapido e um par com libido alta de verdade.
//   4. AUTO-AJUSTE. Se o quadro cair abaixo de 40 fps ele desliga o reflexo; abaixo de 30, baixa a
//      resolucao. Sem isso um celular fraco viraria slideshow.
//
// A MONTADA e a do SEX FLY, portada inteira (12/09): onda de estocada rapida na ida e lenta na volta,
// o CORPO dele avancando (nao so o abdomen dobrando), o abdomen girando em torno do encaixe no torax,
// o empurrao nela um quadro depois, e a calibracao que poe a ponta dele na dela sem atravessar.
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
    nq: 0, fovy: 45, corpos: [], juntas: [], geoms: [], raiz: -1, asas: {}, abd: [], abdBase: -1,
    inst: [], instE: [], locais: [], matriz: [], matrizM: [], matrizC: [], qtmp: null, qEla: null, qEle: null,
    anel: [], anelT: [], anelN: 0, ultimo: 0, erro: null,
    NF: 0, pares: [], moscas: [], reflexo: true, raioMax: 0, clube: null, distLarga: 18,
    brilho: 1, fill: null, fill2: null, parSugerido: -1,
    fps: 60, fpsT: 0, fpsN: 0, degrau: 0, ruim: 0, aquece: 0,
    orbita: { az: 0.7, el: 0.30, dist: 26, alvo: [0, 0, 1.2], vel: 0.10 },
    // a camera PASSEIA: fica em cima de um casal por 13 s (da para ver a bombada) e abre a sala por 7 s.
    // De longe, com 16 casais, o vaivem e 4% do corpo da mosca e some na tela - foi o que o Michel viu.
    tour: { perto: false, par: 0, ate: 0 },
    aj: { raboBase: 0.45, raboAmp: 0.35, pitch: -0.15, alvo: 1.05 },   // calibracao medida no SEX FLY
  };
  const M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), M3 = new THREE.Matrix4();
  const MI = new THREE.Matrix4(), MS = new THREE.Matrix4().makeScale(1, 1, -1);
  const Q = new THREE.Quaternion(), V = new THREE.Vector3(), UM = new THREE.Vector3(1, 1, 1);
  const RM = new THREE.Matrix4(), RO = new THREE.Matrix4(), RQ = new THREE.Quaternion(), RE = new THREE.Euler();
  const HER = new THREE.Matrix4(), SLOT = new THREE.Matrix4(), TL = new THREE.Matrix4(), RP = new THREE.Matrix4();
  const PV = new THREE.Vector3(), EX = new THREE.Vector3(), RB = new THREE.Matrix4(), T1 = new THREE.Matrix4(), T2 = new THREE.Matrix4();
  const PA = new THREE.Vector3(), PB = new THREE.Vector3(), PC = new THREE.Vector3(), PD = new THREE.Vector3();
  const MENOR = new THREE.Vector3(0.9, 0.9, 0.9);   // ele e um pouco menor que ela, como no SEX FLY

  function TR(pos, quat, out) { return out.compose(V.set(pos[0], pos[1], pos[2]), Q.set(quat[1], quat[2], quat[3], quat[0]), UM); }

  const POSES = {   // deslocamento dele em relacao a ela [x para tras, y para o lado, z para cima]
    idle: { p: [-2.6, 1.3, 0.0], yaw: 0.45, pitch: 0.0 },
    courting: { p: [-2.1, 0.9, 0.0], yaw: 0.25, pitch: 0.0 },
    mating: { p: [-0.60, 0.0, 0.90], yaw: 0.0, pitch: -0.10 },
    rejected: { p: [-3.4, -1.4, 0.0], yaw: -0.6, pitch: 0.0 },
  };

  // ---------- arranjo do enxame: pares em aneis, virados para dentro ----------
  function arranjar(nf) {
    const np = Math.floor(nf / 2); S.pares = []; S.moscas = []; S.raioMax = 0;
    const CAPS = [3, 5, 8, 12], RAIOS = [3.4, 7.6, 11.4, 15.6], GIROS = [0.0, 0.55, 1.1, 1.7];
    for (let p = 0; p < np; p++) {
      let anel = 0, ini = 0;
      while (anel < 3 && p >= ini + CAPS[anel]) { ini += CAPS[anel]; anel++; }
      const naAnel = Math.min(CAPS[anel], np - ini);
      const a = ((p - ini) / Math.max(1, naAnel)) * Math.PI * 2 + GIROS[anel];
      const r = RAIOS[anel];
      S.raioMax = Math.max(S.raioMax, r);
      // onde o casal fica no clube: anel de dentro no palco, alguns do anel de fora em pedestal,
      // o resto no chao. O clube.js constroi o movel debaixo de cada um.
      const palco = anel === 0 ? 2 : (anel >= 2 && (p % 2 === 0) ? 1 : 0);
      const z = palco === 2 ? 1.55 : (palco === 1 ? 1.10 : 0);
      S.pares.push({
        p, x: Math.cos(a) * r, y: Math.sin(a) * r, z, palco,
        yaw: a + Math.PI * 0.5 + (((p * 2654435761) % 1000) / 1000 - 0.5) * 0.9,
        atraso: (p * 137) % 3600,                       // ms de atraso no anel de poses
        libido: 0, estado: 'idle', ritmo: 1.2, t0: performance.now(), t_est: performance.now(),
        pose: null, empurrao: 0, rabo: 0, cal: [0, 0, 0], calN: 0, dnEle: 0,
      });
      S.moscas.push({ par: p, papel: 'f' }, { par: p, papel: 'm' });
    }
    S.NF = S.moscas.length;
    S.distLarga = Math.min(((S.raioMax || 3.4) + 7.5) * 0.82, 12 + (S.raioMax || 3.4) * 1.2);  // por dentro da parede
    S.orbita.dist = S.distLarga;
    S.reflexo = S.NF <= 16;
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
    S.ren.toneMapping = THREE.ACESFilmicToneMapping; S.ren.toneMappingExposure = 1.25 * S.brilho;
    S.scene = new THREE.Scene(); S.scene.background = new THREE.Color(0x000000);
    S.cam = new THREE.PerspectiveCamera(S.fovy, 2, 0.3, 900); S.cam.up.set(0, 0, 1);
    // com o clube quem ilumina e o clube (holofote, neon, luz do bar). Sem ele, o palco branco de antes.
    if (window.Clube) {
      S.fill = new THREE.DirectionalLight(0xffd9c8, 0.62); S.fill.position.set(-3, -4, 10); S.scene.add(S.fill);
      S.fill2 = new THREE.DirectionalLight(0xbfd0ff, 0.30); S.fill2.position.set(5, 4, 6); S.scene.add(S.fill2);
    } else {
      S.scene.add(new THREE.HemisphereLight(0xffffff, 0x14141a, 0.85));
      const sol = new THREE.DirectionalLight(0xfff4e2, 1.5); sol.position.set(-3, -4, 10); S.scene.add(sol);
      const contra = new THREE.DirectionalLight(0xff7a4a, 0.45); contra.position.set(6, 3, 3); S.scene.add(contra);
    }

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
          const t = new THREE.TextureLoader().load('/static/fly-tex/' + m.tex + '.png',
            (tx) => { (tx.__esperando || []).forEach(f => f(tx)); tx.__esperando = []; }, undefined,
            () => console.warn('textura nao carregou:', m.tex));
          t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.__esperando = [aplicar]; texs[m.tex] = t;
        }
      }
    }
    // acabamento de bicho: quitina com brilho e micro-relevo, olho composto, asa com nervura e
    // iridescencia, perna opaca. Tem que ser AQUI, antes das malhas pegarem o material.
    if (window.Pele) { window.Pele.melhorar(mats, matsE, j.materiais); window.Pele.ambiente(S.ren, S.scene); }

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
    S.matrizM = j.corpos.map(() => new THREE.Matrix4());
    S.matrizC = j.corpos.map(() => new THREE.Matrix4());
    j.juntas.forEach(jt => { if (jt.tipo === 0) S.raiz = jt.qadr; if (jt.nome) S.asas[jt.nome] = jt.qadr; });
    S.abd = j.corpos.map((c, i) => [c.nome, i]).filter(x => ['A1A2', 'A3', 'A4', 'A5', 'A6'].includes(x[0])).map(x => x[1]);
    S.abdBase = S.abd.length ? S.abd[0] : -1;

    for (const g of j.geoms) {
      const local = new THREE.Matrix4(); TR(g.pos, g.quat, local); S.locais.push(local);
      const im = new THREE.InstancedMesh(geos[g.malha], mats[g.mat], S.NF);
      im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.renderOrder = 2;
      S.scene.add(im); S.inst.push(im);
      const ime = new THREE.InstancedMesh(geos[g.malha], matsE[g.mat], S.NF);
      ime.frustumCulled = false; ime.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ime.renderOrder = 0;
      S.scene.add(ime); S.instE.push(ime);
    }
    // o clube: chao molhado, parede de veludo, neon, bar, sofas, palco, globo e holofotes
    if (window.Clube) S.clube = window.Clube.montar(S.scene, { pares: S.pares, raio: S.raioMax });

    S.qtmp = new Float32Array(S.nq); S.qEla = new Float32Array(S.nq); S.qEle = new Float32Array(S.nq);
    for (let i = 0; i < ANEL; i++) { S.anel.push(null); S.anelT.push(0); }
    redimensionar(); new ResizeObserver(redimensionar).observe(S.box);
  }

  function redimensionar() {
    if (!S.ren) return;
    const r = S.box.getBoundingClientRect(); const w = Math.max(2, r.width), h = Math.max(2, r.height);
    S.ren.setPixelRatio(Math.min(S.degrau >= 2 ? 1.0 : 1.5, window.devicePixelRatio || 1));
    S.ren.setSize(w, h, false);
    S.cam.aspect = w / h; S.cam.updateProjectionMatrix();
  }

  // ---------- entrada ----------
  function quadro(j, bytes) {
    const q = new Float32Array(bytes);
    if (!S.pronto || q.length !== S.nq) return;
    const i = S.anelN % ANEL;
    S.anel[i] = q; S.anelT[i] = performance.now(); S.anelN++; S.ultimo = S.anelT[i];
  }

  function sexo(m) {
    if (!m || !Array.isArray(m.pares)) return;
    for (const d of m.pares) {
      const par = S.pares[d.i]; if (!par) continue;
      if (d.estado && d.estado !== par.estado) { par.estado = d.estado; par.t_est = performance.now(); par.calN = 0; }
      if (typeof d.libido === 'number') par.libido = d.libido;
      if (d.ritmo && d.ritmo !== par.ritmo) {     // troca o ritmo sem pular a fase da estocada
        const ag = performance.now();
        const ph = ((((ag - par.t0) / 1000) * par.ritmo) % 1 + 1) % 1;
        par.ritmo = d.ritmo; par.t0 = ag - ph / par.ritmo * 1000;
      }
    }
  }

  function dn(lista) {   // taxa dos neuronios de andar do MACHO de cada par: acelera a estocada dele
    if (!Array.isArray(lista)) return;
    for (let p = 0; p < S.pares.length; p++) {
      const m = lista[p * 2 + 1];
      if (m && m.dn) S.pares[p].dnEle = m.dn.forward || 0;
    }
  }

  // ---------- pose atrasada ----------
  function poseEm(alvoMs, saida) {
    let a = -1, b = -1;
    for (let k = 0; k < ANEL; k++) {
      const i = (S.anelN - 1 - k + ANEL * 4) % ANEL;
      if (!S.anel[i]) continue;
      if (S.anelT[i] <= alvoMs) { a = i; break; }
      b = i;
    }
    if (a < 0) return S.anel[(S.anelN - 1 + ANEL * 4) % ANEL];
    if (b < 0) return S.anel[a];
    const t0 = S.anelT[a], t1 = S.anelT[b];
    const al = t1 > t0 ? Math.max(0, Math.min(1, (alvoMs - t0) / (t1 - t0))) : 0;
    const q0 = S.anel[a], q1 = S.anel[b];
    for (let i = 0; i < saida.length; i++) saida[i] = q0[i] + (q1[i] - q0[i]) * al;
    return saida;
  }

  // ---------- cinematica direta em cima de uma raiz dada ----------
  function calcular(q, raizM, mat) {
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
  }

  function escrever(mat, f, espelho) {
    for (let g = 0; g < S.geoms.length; g++) {
      MI.multiplyMatrices(mat[S.geoms[g].corpo], S.locais[g]);
      S.inst[g].setMatrixAt(f, MI);
      if (espelho) { M2.multiplyMatrices(MS, MI); S.instE[g].setMatrixAt(f, M2); }
    }
  }

  // gira o abdomen INTEIRO dele em torno do encaixe no torax, em volta do eixo lateral do corpo dele
  function balancarRabo(ang, raiz, mat) {
    if (S.abdBase < 0) return;
    PV.setFromMatrixPosition(mat[S.abdBase]);
    EX.set(raiz.elements[4], raiz.elements[5], raiz.elements[6]).normalize();
    RB.makeRotationAxis(EX, -ang);
    T1.makeTranslation(PV.x, PV.y, PV.z); T2.makeTranslation(-PV.x, -PV.y, -PV.z);
    for (const b of S.abd) mat[b].premultiply(T2).premultiply(RB).premultiply(T1);
  }

  // raiz dela: o lugar do par na sala x a raiz que veio do corpo (altura e inclinacao dela sao reais)
  function raizDela(q, par, empurrao) {
    const a = S.raiz;
    RE.set(0, 0, par.yaw); RQ.setFromEuler(RE);
    SLOT.compose(V.set(par.x, par.y, par.z || 0), RQ, UM);
    HER.compose(V.set(0, 0, q[a + 2]), Q.set(q[a + 4], q[a + 5], q[a + 6], q[a + 3]).normalize(), UM);
    HER.premultiply(SLOT);
    if (empurrao) { TL.makeTranslation(empurrao, 0, 0); HER.multiply(TL); }   // ela e empurrada para a frente
    return HER;
  }

  // raiz dele = raiz dela x deslocamento, no referencial dela (x para a frente, z para cima)
  function raizDele(raizF, alvo, px, py, pz, roll, pitch, yaw) {
    alvo.copy(raizF);
    RO.compose(V.set(px, py, pz), RQ.setFromEuler(RE.set(roll, pitch, yaw, 'ZYX')), MENOR);
    return alvo.multiply(RO);
  }

  // pose dele nas juntas (asas, cabeca, tromba, pernas) conforme o estado
  function juntasDele(q, par, tt, f, saida) {
    saida.set(q);
    const est = par.estado, lib = par.libido, ritmo = ritmoDe(par);
    if (est === 'mating') {
      const ab = 0.22 + 0.12 * lib + 0.06 * Math.sin(tt * 2 * Math.PI * ritmo * 2);
      if (S.asas.joint_LWing_abre != null) {
        saida[S.asas.joint_LWing_abre] += ab; saida[S.asas.joint_RWing_abre] += ab;
        saida[S.asas.joint_LWing_bate] += 0.05 * Math.sin(tt * 2 * Math.PI * ritmo * 4);
        saida[S.asas.joint_RWing_bate] += 0.05 * Math.sin(tt * 2 * Math.PI * ritmo * 4);
      }
      if (S.asas.joint_Head != null) saida[S.asas.joint_Head] += 0.15 + 0.1 * Math.max(0, f);
      if (S.asas.joint_Proboscis != null) saida[S.asas.joint_Proboscis] += 0.5 * Math.max(0, Math.sin(tt * 2 * Math.PI * ritmo * 0.5));
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
    } else if (S.asas.joint_Head != null) {
      saida[S.asas.joint_Head] += 0.08 * Math.sin(tt * 2 * Math.PI * 0.5);
    }
    return saida;
  }

  const ritmoDe = par => par.ritmo * (1 + 0.25 * Math.min(1, (par.dnEle || 0) / 120));
  // onda da estocada: 30% do ciclo indo (rapido) e 70% voltando (lento). f=1 e o pico.
  function ondaEstocada(tt, ritmo) {
    const ph = ((tt * ritmo) % 1 + 1) % 1;
    return ph < 0.3 ? Math.sin(ph / 0.3 * Math.PI / 2) : Math.cos((ph - 0.3) / 0.7 * Math.PI / 2);
  }

  // ---------- laco ----------
  function loop() {
    requestAnimationFrame(loop);
    if (!S.pronto || S.anelN === 0) return;
    const agora = performance.now();
    if (agora - S.ultimo > 8000) return;
    medirFps(agora);
    const k = 1 - Math.pow(0.001, 1 / 60);

    for (let p = 0; p < S.pares.length; p++) {
      const par = S.pares[p];
      const q = poseEm(agora - ATRASO_MS - par.atraso, S.qtmp);
      if (!q) continue;
      const tt = (agora - par.t0) / 1000;
      const est = par.estado, lib = par.libido, ritmo = ritmoDe(par);
      const u = Math.min(1, (agora - par.t_est) / 700);

      // alvo do deslocamento dele, alcancado suavemente (trocar de estado nao teleporta)
      const alvo = POSES[est] || POSES.idle;
      const pitchAlvo = est === 'mating' ? S.aj.pitch : alvo.pitch;
      if (!par.pose) par.pose = { p: alvo.p.slice(), yaw: alvo.yaw, pitch: pitchAlvo };
      for (let i = 0; i < 3; i++) par.pose.p[i] += (alvo.p[i] - par.pose.p[i]) * k * 1.4;
      par.pose.yaw += (alvo.yaw - par.pose.yaw) * k * 1.4;
      par.pose.pitch += (pitchAlvo - par.pose.pitch) * k * 1.4;

      let px = par.pose.p[0], py = par.pose.p[1], pz = par.pose.p[2];
      let yaw = par.pose.yaw, pitch = par.pose.pitch, roll = 0, f = 0;

      // ---- ela ----
      const qEla = S.qEla;
      qEla.set(q);
      if (est === 'mating' && S.asas.joint_LWing_abre != null) {
        const ab = 0.04 + 0.03 * Math.sin(tt * 2 * Math.PI * ritmo);   // asas quase fechadas: ele nao atravessa
        qEla[S.asas.joint_LWing_abre] += ab; qEla[S.asas.joint_RWing_abre] += ab;
      }
      const raizF = raizDela(qEla, par, est === 'mating' ? par.empurrao : 0);
      calcular(qEla, raizF, S.matriz);
      escrever(S.matriz, p * 2, S.reflexo);

      // ---- ele ----
      if (est === 'mating') {
        f = ondaEstocada(tt, ritmo);
        const amp = 0.10 * (0.4 + 0.6 * lib);
        px += amp * f; pz += 0.03 * f; pitch += -0.06 * f;      // O CORPO DELE AVANCA: era isto que faltava
        roll = 0.03 * Math.sin(tt * 2 * Math.PI * ritmo * 0.5);
        par.empurrao = amp * f * 0.5;                            // ela sente no quadro seguinte
        par.rabo = S.aj.raboBase + (S.aj.raboAmp + 0.2 * lib) * f;
        calibrarEncaixe(q, par, lib, raizF);
        px += par.cal[0] * u; py += par.cal[1] * u; pz += par.cal[2] * u;
      } else {
        par.empurrao = 0; par.rabo = 0;
        if (est === 'courting') {
          px += 0.15 * Math.sin(tt * 2 * Math.PI * 0.6); py += 0.25 * Math.sin(tt * 2 * Math.PI * 0.35);
          yaw += 0.15 * Math.sin(tt * 2 * Math.PI * 0.4);
        } else if (est === 'rejected') {
          const w = Math.min(1, u * 1.6);
          pz += 1.8 * Math.sin(Math.PI * w); roll = 2 * Math.PI * w * 1.5; pitch += Math.PI * w * 0.3;
        } else {
          py += 0.05 * Math.sin(tt * 2 * Math.PI * 0.3);
        }
      }
      const qEle = juntasDele(q, par, tt, f, S.qEle);
      const raizM = raizDele(raizF, RM, px, py, pz, roll, pitch, yaw);
      calcular(qEle, raizM, S.matrizM);
      if (est === 'mating') balancarRabo(par.rabo, raizM, S.matrizM);
      escrever(S.matrizM, p * 2 + 1, S.reflexo);
    }

    for (let g = 0; g < S.geoms.length; g++) {
      S.inst[g].instanceMatrix.needsUpdate = true;
      S.instE[g].visible = S.reflexo;
      if (S.reflexo) S.instE[g].instanceMatrix.needsUpdate = true;
    }

    if (S.clube) {                       // o clube pulsa com o calor da sala (media da libido)
      let soma = 0;
      for (const x of S.pares) soma += x.libido;
      window.Clube.animar(agora, soma / Math.max(1, S.pares.length));
    }
    passear(agora, k);
    const o = S.orbita, a = o.alvo;
    S.cam.position.set(a[0] + o.dist * Math.cos(o.el) * Math.cos(o.az), a[1] + o.dist * Math.cos(o.el) * Math.sin(o.az), a[2] + o.dist * Math.sin(o.el));
    S.cam.lookAt(a[0], a[1], a[2]);
    S.ren.render(S.scene, S.cam);
  }

  // Encaixe: no PICO da estocada (f=1) a ponta do abdomen dele encosta na dela, sem atravessar.
  // Mede num passo extra (pose no pico) e guarda o ajuste no referencial dela. A cada 20 quadros, por par.
  function calibrarEncaixe(q, par, lib, raizF) {
    if (S.abd.length < 5) return;
    par.calN = (par.calN || 0) + 1;
    if (par.calN % 20 !== 1) return;
    const ampP = 0.10 * (0.4 + 0.6 * lib);
    const raizP = raizDele(raizF, RP, par.pose.p[0] + ampP + par.cal[0], par.pose.p[1] + par.cal[1],
                           par.pose.p[2] + 0.03 + par.cal[2], 0, par.pose.pitch - 0.06, par.pose.yaw);
    const qP = juntasDele(q, par, 0.3 / Math.max(0.1, par.ritmo), 1, S.qEle);
    calcular(qP, raizP, S.matrizC);
    balancarRabo(S.aj.raboBase + S.aj.raboAmp + 0.2 * lib, raizP, S.matrizC);
    const a5 = S.abd[3], a6 = S.abd[4];
    PA.setFromMatrixPosition(S.matrizC[a6]); PB.setFromMatrixPosition(S.matrizC[a5]);
    PB.sub(PA); PA.addScaledVector(PB, -1.0);                       // ponta dele = A6 + (A6-A5)
    PC.setFromMatrixPosition(S.matriz[a6]); PD.setFromMatrixPosition(S.matriz[a5]);
    PD.sub(PC); PC.addScaledVector(PD, -S.aj.alvo);                 // alvo: quase a ponta dela
    PC.sub(PA);
    Q.setFromRotationMatrix(raizF).invert(); PC.applyQuaternion(Q); // no referencial dela
    par.cal[0] += PC.x; par.cal[1] += PC.y * 0.5; par.cal[2] += PC.z;
  }

  // passeio da camera: perto de um casal, depois a sala inteira, e vai trocando de casal
  function passear(agora, k) {
    const o = S.orbita, C = S.tour;
    if (agora >= C.ate) {
      C.perto = !C.perto;
      if (C.perto && S.pares.length) {
        // vai para o casal que o servidor esta olhando (o cerebro mais ativo da hora); se nao houver
        // sugestao, anda 3 casas para nao ficar so no anel de dentro
        C.par = S.parSugerido >= 0 ? S.parSugerido % S.pares.length : (C.par + 3) % S.pares.length;
      }
      C.ate = agora + (C.perto ? 13000 : 7000);
    }
    const par = S.pares[C.par] || { x: 0, y: 0, z: 0 };
    const aX = C.perto ? par.x : 0, aY = C.perto ? par.y : 0;
    const aZ = C.perto ? (par.z || 0) + 1.45 : 3.4;                 // de longe olha a sala, nao o chao
    const dist = C.perto ? 5.4 : (S.distLarga || 18);
    const el = C.perto ? 0.14 : 0.34;
    const kk = k * 1.1;
    o.alvo[0] += (aX - o.alvo[0]) * kk; o.alvo[1] += (aY - o.alvo[1]) * kk; o.alvo[2] += (aZ - o.alvo[2]) * kk;
    o.dist += (dist - o.dist) * kk;
    o.el += (el - o.el) * kk;
    o.az += o.vel * (1 / 60) * (C.perto ? 1.7 : 1.0);
  }

  function medirFps(agora) {
    S.fpsN++;
    if (!S.fpsT) { S.fpsT = agora; S.aquece = agora + 6000; return; }
    if (agora - S.fpsT < 2000) return;
    S.fps = S.fpsN / ((agora - S.fpsT) / 1000); S.fpsN = 0; S.fpsT = agora;
    if (agora < S.aquece) return;
    S.ruim = S.fps < 40 ? S.ruim + 1 : 0;
    if (S.ruim < 2) return;
    if (S.degrau === 0) { S.degrau = 1; S.reflexo = false; S.ruim = 0; console.warn('orgia: reflexo off,', S.fps.toFixed(0), 'fps'); }
    else if (S.degrau === 1 && S.fps < 30) { S.degrau = 2; S.ruim = 0; redimensionar(); console.warn('orgia: resolucao menor,', S.fps.toFixed(0), 'fps'); }
  }

  // brilho: 0,5 a 2,2. Mexe na exposicao, nas luzes de preenchimento e no clube.
  function brilho(v) {
    S.brilho = Math.max(0.5, Math.min(2.2, +v || 1));
    if (S.ren) S.ren.toneMappingExposure = 1.25 * S.brilho;
    if (S.fill) S.fill.intensity = 0.62 * S.brilho;
    if (S.fill2) S.fill2.intensity = 0.30 * S.brilho;
    if (window.Clube) window.Clube.brilho(S.brilho);
    return S.brilho;
  }

  return {
    init, quadro, sexo, dn, brilho,
    sugerirPar: (p) => { S.parSugerido = p; },
    parNaCamera: () => S.tour.par,
    perto: () => S.tour.perto,
    estado: () => ({ fps: S.fps, moscas: S.NF, pares: S.pares.length, reflexo: S.reflexo, erro: S.erro,
                     estados: S.pares.map(x => x.estado), cal: S.pares[0] && S.pares[0].cal }),
    camera: (o) => Object.assign(S.orbita, o || {}),
    olhar: (p) => { S.tour.par = p % Math.max(1, S.pares.length); S.tour.perto = true; S.tour.ate = performance.now() + 13000; },
    interno: S,
  };
})();
