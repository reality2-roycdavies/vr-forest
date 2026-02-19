# Development Methodology: Spec-Driven, AI-Assisted Software Creation

## What This Document Is

This describes a way of building software that inverts the traditional model. Instead of writing code and documenting it afterwards, you write a **specification first** and treat code as generated output — disposable, reproducible, cheap.

This approach was developed through real-world practice, refined across multiple projects, and tested by rebuilding the same system on different platforms from the same spec. This VR Forest project is your opportunity to experience the methodology firsthand.

---

## The Core Idea

**Specifications are the product. Code is a compilation step.**

In traditional development:
1. You have a vague idea
2. You write code until it works
3. You document what you built (maybe)
4. Knowledge lives in the code — lose the developer, lose the understanding

In this approach:
1. You write a precise specification — what the system **does**, not how to code it
2. An AI generates code from the spec
3. You test the code against the spec
4. If it's wrong, you fix the **spec**, not the code — then regenerate

The code is a conjecture. The spec is the theory. The tests are the experiments.

---

## Why This Works Now

This approach wasn't practical five years ago. Two things changed:

1. **AI can generate code from specifications.** Not perfectly, not every time — but fast enough that regenerating is cheaper than debugging. If the AI hallucinates, you don't debug its output. You improve the spec's clarity and try again.

2. **The bottleneck shifted.** Writing code used to be the slow, expensive part. Now the slow, expensive part is **knowing what to build** — the thinking, the design decisions, the trade-offs. Specs capture exactly that.

The developer's role changes from *typist* to *technical director*. You need domain expertise, architectural judgement, and the ability to articulate what "right" looks like. You don't need to memorise API syntax.

---

## The Process

### Step 1: Specify

Write down what the system should do with enough precision that someone (or something) could build it without asking you questions.

This is harder than it sounds. The VR Forest specification describes terrain generation algorithms, audio synthesis chains, weather state machines, and performance budgets. Every numerical parameter is documented. Every design decision is explained — not just the *what*, but the *why*.

Good specs are:
- **Platform-independent** — describe behaviour, not implementation
- **Precise about parameters** — "the terrain uses 4-octave simplex noise with persistence 0.45" not "the terrain looks natural"
- **Honest about subjectivity** — where something is an aesthetic judgement, say so, and describe what *wrong* looks like
- **Testable** — for each claim, there should be a way to verify it

### Step 2: Design Test Vectors

Before generating any code, define what "correct" means.

Some things are deterministic and easy to test:
- Terrain height at coordinates (100, 200) with seed 42 → expected value
- Sun position at a given timestamp and latitude → expected azimuth and elevation
- Star catalog: Southern Cross RA/Dec → expected screen position at a given time

Some things are behavioural:
- Weather transitions take 3–8 minutes between states
- Birds avoid flying below 12m above terrain
- Rain intensity scales linearly with weather intensity value

Some things are subjective — and that's OK:
- "The forest should feel natural, not synthetic"
- "Thunder should have reverb and character, not sound like filtered noise"

For subjective qualities, the spec should describe **known failure modes** — what it looks like when it's wrong. The VR Forest creation process documents many of these: the bear growl that sounded like flatulence, the rain that looked like fast snow, the water that sounded indistinguishable from wind. These are your test vectors for the subjective cases.

### Step 3: Generate

Give the spec (or relevant sections) to an AI and ask it to implement. Use whatever platform you're targeting — Godot, Unity, Unreal, raw OpenGL, whatever.

Key principles:
- **Give the AI the spec, not the reference code.** The whole point is that the spec should be sufficient. If you need to show the AI the Three.js source, the spec has a gap.
- **Generate in sections.** Don't try to build everything at once. Start with terrain, verify it works, then add water, then trees, etc.
- **Don't debug AI output for too long.** If the generated code is fundamentally wrong, the problem is usually the spec — it was ambiguous, incomplete, or the AI misunderstood. Clarify the spec and regenerate.

### Step 4: Test

Run your test vectors. Compare your implementation against the reference (the live VR Forest demo).

Three possible outcomes for each discrepancy:

| Outcome | Meaning | Action |
|---------|---------|--------|
| **Your code is wrong** | The spec was clear, you (or the AI) just got it wrong | Fix your code |
| **The spec was ambiguous** | The spec could be read two ways | Clarify the spec, regenerate |
| **The spec was incomplete** | Something important wasn't specified at all | Add it to the spec |

The second and third outcomes are the interesting ones. They improve the spec for the next person.

### Step 5: Refine the Spec

This is the crucial step that most people skip. When your implementation diverges from the reference:

1. **Document the discrepancy** — what did you expect? What happened?
2. **Diagnose the cause** — was the spec wrong, ambiguous, or incomplete?
3. **Fix the spec** — not just your code
4. **Verify** — does the improved spec prevent the same problem for someone else?

The spec earns confidence by surviving these attempts to break it — like a scientific theory that gains credibility each time an experiment fails to disprove it. A spec that has been rebuilt on three different platforms and survived is more trustworthy than one nobody has tested.

---

## The Roles

### Human: Creative Director

In the VR Forest project, the human never wrote a line of code. They:
- Defined the vision ("an endless, randomly generated forest you can explore in VR")
- Tested in the headset and gave experiential feedback
- Made aesthetic judgements ("sounds like someone farting" → rework the audio)
- Decided when to push harder and when to cut a feature

This is the role you play as a spec author. You decide **what** matters. The AI figures out **how**.

### AI: Development Studio

The AI handles:
- Architecture and implementation
- Debugging and iteration
- Translation from human intent to working code
- Exploring options you wouldn't have time to try manually

The AI is fast but not infallible. It will hallucinate. It will misunderstand. That's fine — regeneration is cheap. Your job is to detect when the output is wrong and improve the input (the spec).

### The Feedback Loop

The VR Forest was built through rapid iteration:

```
Human describes what they want
    → AI implements it
        → Human tests it
            → "The birds look like pterodactyls"
                → AI adjusts
                    → Human tests again
                        → "Better, but they're too much in formation"
                            → AI adjusts
                                → "Good."
```

This loop ran hundreds of times over seven days. Each cycle took minutes, not hours. The speed of iteration is what makes AI-assisted development powerful — you can afford to be wrong because recovery is fast.

---

## Conjecture and Refutation

The philosophical foundation of this approach comes from Karl Popper's theory of scientific knowledge:

- A **conjecture** is a bold claim about how something should work
- It gains credibility not by being "proven" but by **surviving attempts to disprove it**
- A theory that has withstood many rigorous tests is more trustworthy than one that hasn't been tested at all

Applied to software specifications:

- Your spec is a conjecture: "this is a complete and correct description of the VR Forest"
- Each rebuild attempt on a new platform is a **refutation attempt**
- Where the rebuild succeeds, the spec gains confidence
- Where it fails, the spec is **falsified** — and that's valuable, because now you can fix it

A spec that has survived three independent implementations is battle-tested. A spec that nobody has tried to build from is untested — its confidence is unknown, no matter how well-written it looks.

### What Falsification Looks Like

When rebuilding from the spec, you will encounter moments like:

> "The spec says 'terrain follows the player with a gentle bob' but doesn't specify the bob frequency or amplitude. I guessed 1Hz and 5cm and it made people sick."

That's a falsification. The spec was incomplete — it didn't specify the parameters, and a reasonable guess produced a bad result. Fix: add the exact bob parameters (2.2 Hz, 2.5cm — matching the reference).

> "The spec says 'procedural water sounds' but my implementation sounds like wind. I can't tell what's wrong."

That's a harder falsification. The spec described the *what* but not the *why it works*. Fix: add the insight that water sound requires a **rhythmic temporal pattern** (lapping waves with attack-sustain-release), not just frequency filtering of continuous noise. Describe what wrong sounds like.

> "My terrain generates correctly but there are visible seams at chunk boundaries."

The spec mentioned chunks but didn't specify how normals are computed across boundaries. Fix: add a section on cross-chunk normal interpolation.

Every falsification makes the spec better. **Failures are the point, not the problem.**

---

## What Makes a Good Spec

### Precise Where It Matters

Bad: "The terrain has rolling hills and mountains."
Good: "The terrain uses 4-octave simplex noise (scale 0.008, persistence 0.45, lacunarity 2.2, height range 0–8m). Mountains are added using ridge noise with domain warping (see §4.3). The ridge function uses `1 - raw²` for smooth peaks, not `1 - |raw|` which produces knife-edge ridges."

### Honest About Subjectivity

Bad: "The audio should sound realistic."
Good: "Cricket chirps use a 4-voice sine chorus at 4200–5400 Hz, fading in at dusk and out at dawn. This worked first time. Footsteps required five complete rewrites — the key insight is that each surface needs distinct spectral layers: grass = low-pass thud + high-pass swish; rock = bandpass tap + sine ping; water = noise splash + filtered slosh. If your footsteps sound like drums, you're using oscillators where you need noise."

### Platform-Independent

Bad: "Use Three.js MeshPhongMaterial with onBeforeCompile to inject wind displacement."
Good: "Apply sinusoidal vertex displacement in the vertex shader: `displacement = sin(time * 1.5 + worldPosition.x * 0.3) * windStrength * heightAboveGround`. The displacement should only affect vertices above ground level, and the amplitude should scale with the vertex height so roots stay planted."

### Describes Failure Modes

Bad: "Rain particles should look like rain."
Good: "Rain particles must be rendered as tall, thin vertical streaks — not round points. The aspect ratio should be approximately 12:1 (height:width). If your rain looks like snow, the particles are too round. If it looks like static, they're too small. Initial attempts used round billboard sprites, which read as snow regardless of colour."

---

## The Assignment

Your task for the VR Forest project:

1. **Read SPECIFICATION.md** — this is the conjecture
2. **Try the reference** — visit the live demo in a VR headset (or desktop browser)
3. **Pick your platform** — Godot, Unity, Unreal, or anything else
4. **Rebuild from the spec alone** — do not read the Three.js source code
5. **Document every discrepancy** — where your build differs from the reference
6. **Diagnose each one** — your bug, spec ambiguity, or spec gap?
7. **Fix the spec** — submit improvements for the gaps you found
8. **Reflect** — what did the process teach you about specification writing?

The goal is not a pixel-perfect clone. The goal is to discover where the spec fails and make it better. Your contribution is the improved specification, not the code.

---

## Reading List

If you want to understand the intellectual foundations:

- **CREATION_PROCESS.md** — how the VR Forest was actually built, including all the failures and iterations. Read this to understand what the spec is trying to capture.
- **GUIDE.md** — technical primer on VR, procedural generation, shaders, and spatial audio. Read this if you're new to the domain.
- **Karl Popper, "Conjectures and Refutations" (1963)** — the philosophical foundation. Chapter 1 is sufficient.
- **The Pragmatic Programmer, Hunt & Thomas** — "Don't Repeat Yourself" and "Tell, Don't Ask" apply to specs as much as code.

---

## FAQ

**Q: What if my platform can't do something the spec describes?**
A: Document it. "Godot's audio system doesn't support ConvolverNode-style reverb" is a valid finding. The spec should note platform-specific constraints, or provide alternative approaches.

**Q: What if I think the spec is wrong, not just incomplete?**
A: Even better. A falsification that reveals a genuine spec error is the most valuable kind. Document what the spec says, what you observed, and what you think it should say instead.

**Q: Can I look at the Three.js source code?**
A: Only after you've attempted your implementation from the spec alone and documented the gaps. The source code is the answer key — looking at it before attempting the problem defeats the purpose.

**Q: What if the AI generates terrible code?**
A: Is the spec clear enough? Try giving the AI just the relevant section of the spec and asking it to implement that. If the spec is clear and the AI still gets it wrong, that's an AI limitation, not a spec problem — note it and move on. Don't spend hours debugging generated code; regenerate or implement manually.

**Q: How do I know when I'm done?**
A: When someone else could pick up your improved spec and have a significantly easier time rebuilding than you did. The spec should capture everything you learned the hard way.
