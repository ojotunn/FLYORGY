// O CLUBE: o cenario onde o enxame transa. Tudo geometria propria em three.js (caixas, cilindros,
// planos e texturas desenhadas em canvas na hora) - nenhum asset de terceiro, nada baixado.
//
// Custo: ~40 objetos e 4 luzes. Perto dos 3,7 milhoes de triangulos das 32 moscas isso e poeira,
// entao a sala nao muda o quadro por segundo. O que ela muda e a sensacao: fundo preto vazio virava
// "bicho flutuando no nada"; com chao molhado, parede, neon, fumaca e holofote girando, vira sala.
//
// Clube.montar(scene, {pares, raio}) devolve os pedacos que se mexem;
// Clube.animar(t, calor) gira o globo, varre os holofotes e pulsa o neon com o calor da sala (0..1).
window.Clube = (function () {
  const C = { globo: null, feixes: [], neon: [], luzes: [], fumaca: [], piso: null, raio: 26, brilho: 1, ceu: null };
  const COR_Q = 0xff2f2a, COR_R = 0xff4f96, COR_A = 0x4d6bff, COR_M = 0xffb43d;

  // ---------- texturas desenhadas na hora ----------
  function canvas(w, h, desenhar) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    desenhar(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  function texPiso() {   // chao molhado: escuro, com um halo quente no meio e riscos de luz
    return canvas(512, 512, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#4a1a1e'); g.addColorStop(0.45, '#27101a'); g.addColorStop(1, '#150a12');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.globalAlpha = 0.16; x.strokeStyle = '#ff8a68'; x.lineWidth = 2;
      for (let i = 0; i < 26; i++) { x.beginPath(); x.moveTo(Math.random() * w, 0); x.lineTo(Math.random() * w, h); x.stroke(); }
      x.globalAlpha = 1;
    });
  }

  function texParede() {  // veludo com listras verticais
    return canvas(256, 512, (x, w, h) => {
      x.fillStyle = '#2a1220'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 16) {
        x.fillStyle = i % 32 ? 'rgba(120,36,74,.6)' : 'rgba(52,16,36,.6)';
        x.fillRect(i, 0, 14, h);
      }
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
  }

  function placa(texto, cor, largura, altura, tamanho) {   // letreiro de neon
    const t = canvas(1024, 256, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.font = '700 ' + (tamanho || 150) + 'px Impact, "Arial Black", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = cor; x.shadowBlur = 55;
      x.fillStyle = cor;
      for (let i = 0; i < 4; i++) x.fillText(texto, w / 2, h / 2);
      x.shadowBlur = 12; x.fillStyle = '#fff6f2'; x.fillText(texto, w / 2, h / 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(largura, altura),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.renderOrder = 3; return m;
  }

  // ---------- pedacos da sala ----------
  function tuboNeon(cor, comprimento, raio) {
    const g = new THREE.CylinderGeometry(raio || 0.10, raio || 0.10, comprimento, 8, 1);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  }

  function feixe(cor) {   // holofote: cone aberto, aditivo, apontando para baixo
    const g = new THREE.ConeGeometry(3.2, 13, 22, 1, true);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: cor, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    m.renderOrder = 1; return m;
  }

  function montar(scene, opts) {
    const pares = (opts && opts.pares) || [];
    const R = C.raio = Math.max(17, ((opts && opts.raio) || 12) + 7.5);   // parede folgada em volta do anel de fora
    const ALT = 14;

    scene.fog = new THREE.FogExp2(0x1a0a12, 0.0092);      // fumaca: da profundidade e some com a borda da sala
    scene.background = new THREE.Color(0x07040a);

    // chao molhado
    const tp = texPiso(); tp.wrapS = tp.wrapT = THREE.RepeatWrapping; tp.repeat.set(3, 3);
    const piso = new THREE.Mesh(new THREE.CircleGeometry(R * 1.25, 64),
      new THREE.MeshStandardMaterial({ map: tp, roughness: 0.26, metalness: 0.45, color: 0xffffff }));
    piso.renderOrder = 1; scene.add(piso); C.piso = piso;

    // parede em volta (cilindro por dentro) e teto
    const tw = texParede(); tw.wrapS = THREE.RepeatWrapping; tw.repeat.set(10, 1);
    const parede = new THREE.Mesh(new THREE.CylinderGeometry(R, R, ALT, 48, 1, true),
      new THREE.MeshStandardMaterial({ map: tw, side: THREE.BackSide, roughness: 0.95, metalness: 0.0 }));
    parede.rotation.x = Math.PI / 2; parede.position.z = ALT / 2; scene.add(parede);
    const teto = new THREE.Mesh(new THREE.CircleGeometry(R, 48),
      new THREE.MeshStandardMaterial({ color: 0x0a0509, roughness: 1, side: THREE.DoubleSide }));
    teto.position.z = ALT; scene.add(teto);

    // fita de neon correndo na parede, em duas alturas
    for (const [z, cor] of [[2.2, COR_R], [ALT - 2.4, COR_A]]) {
      const anel = new THREE.Mesh(new THREE.TorusGeometry(R - 0.12, 0.085, 6, 90),
        new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      anel.position.z = z; scene.add(anel); C.neon.push(anel);
    }

    // letreiro FLY ORGY numa parede, e dois avisos menores nas outras
    const sinal = placa('FLY ORGY', '#ff3d2e', 15, 3.8, 150);
    sinal.position.set(0, -R + 0.5, 7.4); sinal.rotation.set(Math.PI / 2, 0, 0);
    scene.add(sinal); C.neon.push(sinal);
    const s2 = placa('MEMBERS ONLY', '#ff5f9e', 9, 2.2, 96);
    s2.position.set(R - 0.5, 0, 6.2); s2.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
    scene.add(s2); C.neon.push(s2);
    const s3 = placa('138,639 NEURONS', '#4d6bff', 11, 2.4, 84);
    s3.position.set(-R + 0.5, 0, 6.2); s3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    scene.add(s3); C.neon.push(s3);

    // bar no fundo: balcao, prateleira acesa e garrafas
    const bar = new THREE.Group();
    const balcao = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x1a0d14, roughness: 0.35, metalness: 0.4 }));
    balcao.position.set(0, 0, 1.3); bar.add(balcao);
    const tampo = new THREE.Mesh(new THREE.BoxGeometry(16.4, 1.9, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x3a1520, roughness: 0.15, metalness: 0.8 }));
    tampo.position.set(0, 0, 2.68); bar.add(tampo);
    const prateleira = new THREE.Mesh(new THREE.BoxGeometry(15, 0.25, 4.2),
      new THREE.MeshBasicMaterial({ color: 0x2a0a14 }));
    prateleira.position.set(0, 1.2, 4.4); bar.add(prateleira);
    const brilho = new THREE.Mesh(new THREE.PlaneGeometry(15, 4.2),
      new THREE.MeshBasicMaterial({ color: COR_Q, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    brilho.position.set(0, 1.25, 4.4); brilho.rotation.x = Math.PI / 2; bar.add(brilho); C.neon.push(brilho);
    for (let i = 0; i < 26; i++) {   // garrafas
      const h = 0.55 + (i % 5) * 0.16;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, h, 6),
        new THREE.MeshStandardMaterial({ color: [0x8a2f1a, 0x2f6a4a, 0x6a2f6a, 0xb08030][i % 4], roughness: 0.2, metalness: 0.3, emissive: 0x220a08 }));
      b.rotation.x = Math.PI / 2; b.position.set(-7 + i * 0.56, 1.1, 4.6 + h / 2); bar.add(b);
    }
    bar.position.set(0, R - 3.2, 0); bar.rotation.z = Math.PI; scene.add(bar);

    // sofas encostados na parede (bancos curvos de veludo)
    for (let k = 0; k < 5; k++) {
      const ang = -0.9 + k * 0.45 + Math.PI;
      const banco = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.1, 18, 1, false, 0, Math.PI * 0.9),
        new THREE.MeshStandardMaterial({ color: 0x4a1024, roughness: 0.9, metalness: 0.05 }));
      banco.rotation.x = Math.PI / 2; banco.rotation.y = ang;
      banco.position.set(Math.cos(ang) * (R - 3.4), Math.sin(ang) * (R - 3.4), 0.55);
      scene.add(banco);
    }

    // palco central e pedestais debaixo dos casais marcados
    const centrais = pares.filter(p => p.palco === 2);
    if (centrais.length) {
      const rc = Math.max(...centrais.map(p => Math.hypot(p.x, p.y))) + 2.4;
      const palco = new THREE.Mesh(new THREE.CylinderGeometry(rc, rc + 0.25, 1.55, 40),
        new THREE.MeshStandardMaterial({ color: 0x24101a, roughness: 0.5, metalness: 0.35 }));
      palco.rotation.x = Math.PI / 2; palco.position.z = 0.775; scene.add(palco);
      const borda = new THREE.Mesh(new THREE.TorusGeometry(rc + 0.1, 0.07, 6, 60),
        new THREE.MeshBasicMaterial({ color: COR_M, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      borda.position.z = 1.5; scene.add(borda); C.neon.push(borda);
    }
    for (const p of pares) {
      if (p.palco !== 1) continue;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, p.z, 22),
        new THREE.MeshStandardMaterial({ color: 0x1d0e18, roughness: 0.55, metalness: 0.3 }));
      ped.rotation.x = Math.PI / 2; ped.position.set(p.x, p.y, p.z / 2); scene.add(ped);
      const fita = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.055, 6, 30),
        new THREE.MeshBasicMaterial({ color: COR_R, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      fita.position.set(p.x, p.y, p.z - 0.06); scene.add(fita); C.neon.push(fita);
    }

    // globo espelhado
    const globo = new THREE.Group();
    const bola = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 2),
      new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 1, roughness: 0.12, flatShading: true }));
    globo.add(bola);
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6),
      new THREE.MeshBasicMaterial({ color: 0x2a2a33 }));
    haste.rotation.x = Math.PI / 2; haste.position.z = 2.3; globo.add(haste);
    globo.position.set(0, 0, ALT - 3.4); scene.add(globo); C.globo = globo;

    // holofotes: 4 cones girando, presos no teto
    const cores = [COR_Q, COR_R, COR_A, COR_M];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const f = feixe(cores[i]);
      f.position.z = -6.5; f.rotation.x = Math.PI;          // ponta em cima, boca para baixo
      g.add(f);
      g.position.set(Math.cos(i * Math.PI / 2) * (R * 0.55), Math.sin(i * Math.PI / 2) * (R * 0.55), ALT - 0.6);
      scene.add(g); C.feixes.push({ g, f, fase: i * 1.6 });
      const l = new THREE.PointLight(cores[i], 42, R * 1.6, 1.7);
      l.position.copy(g.position); scene.add(l); C.luzes.push(l);
    }

    // ambiente: fraco, cor de sala escura
    scene.add(C.ceu = new THREE.HemisphereLight(0x7a4a66, 0x1a1016, 1.15));
    const quente = new THREE.PointLight(COR_Q, 55, R * 1.8, 1.7);
    quente.position.set(0, 0, 6.5); scene.add(quente); C.luzes.push(quente);
    const frio = new THREE.PointLight(COR_A, 26, R * 1.6, 1.8);
    frio.position.set(0, -R * 0.5, 9.0); scene.add(frio); C.luzes.push(frio);

    return C;
  }

  // calor: 0 a 1, a media de libido da sala. Deixa o neon mais forte e o holofote mais rapido.
  function animar(t, calor) {
    const s = t / 1000, c = Math.max(0, Math.min(1, calor || 0));
    if (C.globo) C.globo.rotation.z = s * 0.55;
    for (let i = 0; i < C.feixes.length; i++) {
      const f = C.feixes[i];
      const v = 0.35 + 0.9 * c;
      f.g.rotation.z = s * v * (i % 2 ? 1 : -1) + f.fase;
      f.g.rotation.x = 0.34 + 0.16 * Math.sin(s * v * 1.7 + f.fase);
      f.f.material.opacity = (0.055 + 0.06 * c + 0.015 * Math.sin(s * 6 + f.fase)) * C.brilho;
    }
    const pulso = 0.72 + 0.28 * Math.sin(s * (2.2 + 4 * c));
    for (const x of C.neon) {
      const u = x.material.userData;
      if (u.base == null) u.base = x.material.opacity;
      x.material.opacity = Math.min(1, u.base * pulso * (0.75 + 0.5 * c));
    }
    for (const l of C.luzes) {
      if (l.userData.base == null) l.userData.base = l.intensity;
      l.intensity = l.userData.base * (0.7 + 0.6 * c) * C.brilho;
    }
    if (C.ceu) {
      if (C.ceu.userData.base == null) C.ceu.userData.base = C.ceu.intensity;
      C.ceu.intensity = C.ceu.userData.base * C.brilho;
    }
  }

  // brilho da sala, 0,5 a 2,2 (o visitante escolhe; fica salvo no navegador dele)
  function brilho(v) { C.brilho = Math.max(0.5, Math.min(2.2, v || 1)); return C.brilho; }

  return { montar, animar, brilho, estado: C };
})();
