# FLY ORGY

Sixteen whole fruit-fly brains in one room, on one GPU, mating to the rhythm of a token's order flow.

Same engine as [sexfly](https://github.com/ojotunn/sexfly) — but where that ran **two** brains in two
processes, this runs **sixteen** in one, as a batch.

## The trick

A connectome is expensive because of the synapse matrix: 15,091,983 synapses. That matrix is *the same
matrix* for every fly. So the swarm shares one copy of it and each fly is a row of the state tensor.

Measured on an RX 7900 XT, 12/09/2026 (`brain/enxame.py` header):

| batch | steps/s per fly | fly-steps/s | VRAM |
|------:|----------------:|------------:|-----:|
| 1     | 800             | 800         | 0.20 GB |
| 16    | 161             | 2,572       | 0.60 GB |
| 32    | 85              | 2,716       | 1.03 GB |

Membrane state is 27 MB per fly. Sixteen brains cost less VRAM than one brain did before, and each one
runs faster than the two of SEX FLY (which are capped at 120 steps/s).

## What is real

- **The brains.** 138,639 neurons, leaky integrate-and-fire, FlyWire v783 wiring, 0.1 ms steps.
  Independent per fly: stimulate fly 5 and only fly 5 fires (proof in the commit log).
- **The stimuli.** Every buy on the curve is injected into real neurons. Each thrust fires `JO`
  (Johnston's organ, 209 mechanosensory neurons) in both brains of that pair, `pC1` (10, female
  receptivity) in hers, and `PAM` dopamine (307) every fourth thrust. A big sell fires `DNp13 + oviDN`
  in the hottest female and she kicks him off.
- **The bodies.** NeuroMechFly v2 anatomy, one kinematic pose stream, read at a different delay by each
  fly, with its pair's own mating rhythm on top. Not sixteen physics simulations — and the site says so.

## What is off

**Plasticity.** Hebbian learning would modify the shared synapse matrix, which means the *swarm* learning,
not each fly. `FLY_PLASTICIDADE=1` turns it on if you want that; the default is off and the page says so.

## Running it

```
START-Windows.bat
```

Brings up `brain/servidor.py` (the swarm, port 8438), `corpo/corpo.py` (the body) and
`mercado/mercado.py` (the token). Open http://localhost:8438.

Needs the FlyWire data in `brain/data/flywire/` and a Python env in `py/` — both junctions to the
[flybrain](https://github.com/ojotunn/flybrain) checkout, both out of git.

| variable | default | what it does |
|---|---|---|
| `FLY_MOSCAS` | 16 | swarm size (even: half female, half male) |
| `FLY_PASSOS_S` | 120 | brain steps per second ceiling; `brain/data/passos_s.txt` overrides it live |
| `FLY_PLASTICIDADE` | 0 | 1 = collective hebbian learning on the shared matrix |
| `FLY_MOSCAS`/pairs | — | pair `p` = fly `2p` (female) and `2p+1` (male), same math in the browser |

## Layout

```
brain/enxame.py      N brains as one batch: per-fly stimuli, per-fly seizure reset, per-fly frame
brain/servidor.py    serves the site, one WS frame with a summary per fly + one spike cloud per fly
corpo/corpo.py       the body: 30 pose frames/s, 396 bytes each
mercado/mercado.py   reads the Pons curve (or the pool after graduation), drives the pairs
site/orgia-cliente.js  the room: 69 InstancedMesh, 16 flies, 69 draw calls
site/publico.html    the page
relay/servidor.py    the public relay (Railway)
brand/gerar_arte.py  logo, og and X art, composed from renders of the same 3D model
```

Connectome: FlyWire (Dorkenwald et al. 2024, CC BY-NC). Model after Shiu et al., *Nature* 2024.
Body: NeuroMechFly v2. LIF implementation from `fly-brain` (MIT), see `brain/vendor/`.
