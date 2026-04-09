# Logo

The Valora logo is an indigo/cyan gradient hexagonal badge enclosing a tapered V shape, with the wordmark "VALORA" in a geometric sans-serif and a monospace tagline. See `assets/` for logo files.

---

## Creative Process

### 1. Starting Point: What Does Valora Do?

Before touching any shapes or colours, the first question was conceptual: _what is Valora, and how should it feel?_

Valora is a CLI tool for AI-assisted development workflow orchestration. That single sentence contains the seeds of the entire visual identity:

- **CLI tool** → precision, terminal aesthetics, monospace culture, dark interfaces
- **AI-assisted** → intelligence, neural networks, data flowing through a system
- **Workflow orchestration** → pipelines, convergence, multiple inputs becoming one coherent output

The goal was to find a mark that communicated all three without leaning on tired AI clichés — no brains, no sparkles, no generic purple gradients.

### 2. The Core Metaphor: Convergence

The most important idea behind the mark is **convergence**.

Orchestration is, at its heart, the act of taking many disparate things and bringing them into order. A V shape captures this perfectly: two independent streams descending from the top, meeting at a single point of resolution at the bottom. Every workflow Valora manages is that V — separate steps, unified outcome.

The V also works as the initial of the name, which gives it a natural mnemonic quality without feeling contrived.

### 3. The Mark: Anatomy

#### The Hexagon Frame

A hexagon was chosen over a circle or square for several reasons:

- **Geometric precision** — hexagons appear throughout nature and engineering as the most structurally efficient tessellating shape. They signal rigour.
- **Technical connotation** — the hex badge is a familiar motif in hardware documentation, circuit boards, and developer tooling.
- **Directionality** — a pointed-top hexagon has a natural vertical axis that reinforces the V's downward convergence.

The border uses a gradient that runs from electric cyan at the top-left through deep violet to a faded cyan at the bottom-right, giving the frame a sense of rotational energy without being literal about it.

#### The V Shape

The V is deliberately **tapered** — wider at the two entry points, narrowing to a point. This taper is intentional: it represents data being processed, reduced, distilled. A uniform-width V would feel static. The taper implies transformation.

The V fill uses the same cyan-to-violet gradient as the border, reinforcing colour system cohesion and giving the shape depth — the cyan at the top suggests input, the violet at the bottom suggests a synthesised output.

A thin inner-edge sheen (a low-opacity cyan stroke on the inside of the V) adds a sense of dimensionality, as if the shape has slight elevation off the surface.

#### Circuit Nodes

Three small circles are distributed along each arm of the V, decreasing slightly in opacity towards the apex. These serve two functions:

1. **Visual** — they break the arms into intervals, adding rhythm and preventing the shape from feeling like a blunt wedge.
2. **Conceptual** — they represent discrete pipeline stages. Each node is a step in the workflow being orchestrated, lit up as data passes through.

The top nodes are cyan (input state), the bottom nodes shift to violet (approaching resolution), reinforcing the gradient metaphor throughout the entire mark.

#### Pipeline Connectors

Thin horizontal lines extend from each side of the hexagon at the midpoint, terminating in small dots. These suggest that Valora sits _within_ a larger system — it is a node in an ecosystem, not a walled-off tool. The connectors are deliberately subtle so they support the mark without dominating it.

#### The Apex Node

The convergence point at the bottom of the V is marked with a glowing cyan disc and a white centre. This is the most important element in the mark: the moment of resolution. It is slightly larger than the arm nodes to signal that it is the destination, and it has a glow filter applied to make it feel energised.

In the animation, the apex is where everything culminates — the data particles arrive here, the shockwave rings expand from here, and the idle pulse radiates outwards from this point indefinitely.

### 4. Colour System

| Name      | Hex                 | Role                                            |
| --------- | ------------------- | ----------------------------------------------- |
| Abyss     | `#060b17`           | Page background — deep, near-void navy          |
| Deep Navy | `#0b1422`           | Hexagon interior — slightly lifted surface      |
| Surface   | `#121f38`           | Cards, secondary backgrounds                    |
| Quantum   | `#00d4ff`           | Primary accent — input, activity, energy        |
| Violet    | `#8b5cf6`           | Secondary accent — synthesis, intelligence      |
| Pipeline  | `#00d4ff → #8b5cf6` | The gradient — the journey from input to output |
| Ice White | `#eef4ff`           | Wordmark and text on dark backgrounds           |

The **cyan/violet pairing** was chosen deliberately over the common cyan/green (too "hacker") or blue/purple (too corporate). Cyan signals activity and liveness — it reads as electric, awake. Violet signals depth and cognition — it has an introspective quality that suits AI tooling. Together they form a gradient that feels like a system in motion.

The backgrounds are extremely dark navies rather than pure black. Pure black feels flat and graphical; dark navy retains a sense of depth and allows the glows to read as light rather than coloured shapes.

### 5. Typography

The wordmark **VALORA** uses a geometric sans-serif — specifically the Century Gothic / Gill Sans family — set at light weight (300) with generous letter-spacing (0.28em). The choices were guided by three constraints:

- **Geometric construction** mirrors the geometric mark. Circular letterforms such as the O and the A sit harmoniously next to a hexagonal icon.
- **Light weight** avoids visual competition with the mark. The icon carries the weight; the wordmark provides identity.
- **Wide tracking** gives the name room to breathe and reads as confident rather than compressed.

The wordmark uses a linear gradient matching the colour system, running from a light steel blue through near-white to ice cyan and soft violet, so even the text feels like it is alive with the same energy as the mark.

The tagline _AI Workflow Orchestration_ is set in a monospace face (`Courier New`) at a small size with extreme tracking. This choice directly references the CLI context — Valora lives in a terminal, and the tagline nods to that without being heavy-handed about it.

### 6. Animation: Telling the Story in Sequence

The animation was designed to unfold in the same order that a developer encounters Valora's architecture — from the frame, to the pipeline, to the convergence.

**Intro sequence (~5 seconds):**

1. **Hexagon background** fades in first, establishing the canvas.
2. **Border traces itself** — the stroke animates around the perimeter using a `stroke-dashoffset` technique. This communicates precision and construction; the tool is being assembled before your eyes.
3. **V reveals top to bottom** — a clip-path animation sweeps downward, as if data is filling the shape from the entry nodes towards the apex. This direction is important: top to bottom mirrors the natural reading of a pipeline.
4. **Circuit nodes spring into place** — staggered pop-ins with a spring-easing (overshoot then settle). The spring physics make them feel physical rather than merely graphical.
5. **Apex shockwave** — three concentric rings burst outward from the convergence point the instant the V is complete. This is the moment of synthesis; the system has initialised.
6. **Wordmark letters drop in** one at a time, each arriving with a subtle upward translation. The staggering avoids the word feeling like a block appearing, and instead gives each letter its own moment.
7. **Tagline fades in** last, quiet and understated.

**Idle loops (continuous after intro):**

Once the system is running, it stays alive. Data particles flow continuously down both arms and converge at the apex. The apex radiates slow pulse rings. The entry nodes breathe with a soft opacity oscillation. The hex border glows gently. Sixty-five background particles drift upward across the viewport — representing the ambient data activity of a running orchestration system.

The animation never stops, because Valora never stops.

### 7. Design Principles to Carry Forward

Any future extensions of this identity — light-mode variants, illustrations, documentation headers — should honour these underlying principles:

- **Convergence over complexity.** The mark communicates one idea with precision. Avoid adding elements that dilute the core metaphor.
- **Dark-first.** The identity was designed for dark surfaces. Light-mode variants should use the monochrome version of the mark (deep navy on white) rather than inverting the gradient, which loses the energy.
- **Gradients run input-to-output.** Cyan is always the starting state; violet is always the resolved state. Reversing the gradient direction would contradict the visual narrative.
- **Monospace for technical context.** Any instance of code, commands, or CLI output associated with the brand should use a monospace face, maintaining the terminal aesthetic.
