import { LitElement, html, css, mathml } from 'lit';
import { live } from 'lit/directives/live.js';
import { ui, type Mode, type CoefForm, type StepMode, type PhaseMode, type Layout } from './bus';

export type { Mode } from './bus';
export const FP_KEYS = ['a', 'b', 'c', 'd'] as const;
export const FP2_KEYS = ['a0', 'a1', 'b0', 'b1', 'c0', 'c1', 'd0', 'd1'] as const;

const ICON_BACK = html`<svg viewBox="0 0 12 12" aria-hidden="true">
  <path d="M2 1h1.5v10H2zM10.5 1v10L4.5 6z" />
</svg>`;
const ICON_FWD = html`<svg viewBox="0 0 12 12" aria-hidden="true">
  <path d="M8.5 1H10v10H8.5zM1.5 1v10l6-5z" />
</svg>`;
const ICON_PLAY = html`<svg viewBox="0 0 12 12" aria-hidden="true">
  <path d="M2.5 1l8 5-8 5z" />
</svg>`;
const ICON_PAUSE = html`<svg viewBox="0 0 12 12" aria-hidden="true">
  <path d="M2.5 1H5v10H2.5zM7 1h2.5v10H7z" />
</svg>`;

// Presentation only: the panel renders state passed in through properties and
// sends every user intent into the chanjs ui channel. Field arithmetic lives
// in main, which owns the receiving side.
export class ControlPanel extends LitElement {
  static properties = {
    mode: { type: String },
    p: { type: Number },
    pMax: { type: Number },
    coefs: { attribute: false },
    animKey: { type: String },
    animValue: { type: Number },
    playing: { type: Boolean },
    speed: { type: Number },
    showPoints: { type: Boolean },
    showExt: { type: Boolean },
    zoom: { type: Number },
    exposure: { type: Number },
    detText: { type: String },
    detWarn: { type: Boolean },
    pole: { type: String },
    pNote: { type: String },
    i2: { type: Number },
    coefForm: { type: String },
    gDisp: { type: String },
    exps: { attribute: false },
    expMax: { type: Number },
    stepMode: { type: String },
    phaseMode: { type: String },
    layout: { type: String },
    T: { attribute: false },
    tInfo: { type: String },
    tWarn: { type: Boolean },
  };

  declare mode: Mode;
  declare p: number;
  declare pMax: number;
  declare coefs: Record<string, number>;
  declare animKey: string;
  declare animValue: number;
  declare playing: boolean;
  declare speed: number;
  declare showPoints: boolean;
  declare showExt: boolean;
  declare zoom: number;
  declare exposure: number;
  declare detText: string;
  declare detWarn: boolean;
  declare pole: string;
  declare pNote: string;
  declare i2: number;
  declare coefForm: CoefForm;
  declare gDisp: string;
  declare exps: Record<string, number | null>;
  declare expMax: number;
  declare stepMode: StepMode;
  declare phaseMode: PhaseMode;
  declare layout: Layout;
  declare T: Record<string, number>;
  declare tInfo: string;
  declare tWarn: boolean;

  constructor() {
    super();
    this.mode = 'fp';
    this.p = 257;
    this.pMax = 20011;
    this.coefs = { a: 2, b: 0, c: 0, d: 1 };
    this.animKey = 'a';
    this.animValue = 2;
    this.playing = false;
    this.speed = 0.5;
    this.showPoints = true;
    this.showExt = true;
    this.zoom = 1;
    this.exposure = 1;
    this.detText = '';
    this.detWarn = false;
    this.pole = '';
    this.pNote = '';
    this.i2 = 0;
    this.coefForm = 'cart';
    this.gDisp = '';
    this.exps = {};
    this.expMax = 1;
    this.stepMode = 'coef';
    this.phaseMode = 'arc';
    this.layout = 'geom';
    this.T = { a: 1, b: 1, c: 0, d: 1 };
    this.tInfo = '';
    this.tWarn = false;
  }

  private keys(): readonly string[] {
    return this.mode === 'fp2' ? FP2_KEYS : FP_KEYS;
  }

  private keyLabel(key: string) {
    return key.length === 1
      ? html`<math><mi>${key}</mi></math>`
      : html`<math><msub><mi>${key[0]}</mi><mn>${key[1]}</mn></msub></math>`;
  }

  // A coefficient of F_{p²} rendered compactly: 2, 3i, i, (2+3i). The
  // fragments use the mathml template tag: parsed as html they would land in
  // the HTML namespace and MathML would not render them.
  private cnum(re: number, im: number) {
    if (im === 0) return mathml`<mn>${re}</mn>`;
    const it =
      im === 1
        ? mathml`<mi>i</mi>`
        : mathml`<mn>${im}</mn><mo>&#x2062;</mo><mi>i</mi>`;
    if (re === 0) return mathml`<mrow>${it}</mrow>`;
    return mathml`<mrow><mo>(</mo><mn>${re}</mn><mo>+</mo>${it}<mo>)</mo></mrow>`;
  }

  // A coefficient in exponential form: gᵏ, or 0 for the zero element.
  private gnum(k: number | null | undefined) {
    if (k === null || k === undefined) return mathml`<mn>0</mn>`;
    return mathml`<msup><mi>g</mi><mn>${k}</mn></msup>`;
  }

  private liveFormula() {
    const c = this.coefs;
    if (this.mode === 'fp2') {
      const ex = this.coefForm === 'exp';
      const A = ex ? this.gnum(this.exps.a) : this.cnum(c.a0, c.a1);
      const B = ex ? this.gnum(this.exps.b) : this.cnum(c.b0, c.b1);
      const C = ex ? this.gnum(this.exps.c) : this.cnum(c.c0, c.c1);
      const D = ex ? this.gnum(this.exps.d) : this.cnum(c.d0, c.d1);
      return html`
        <math>
          <mrow>
            <mi>z</mi><mo>&#x21A6;</mo>
            <mfrac>
              <mrow>${A}<mo>&#x2062;</mo><mi>z</mi><mo>+</mo>${B}</mrow>
              <mrow>${C}<mo>&#x2062;</mo><mi>z</mi><mo>+</mo>${D}</mrow>
            </mfrac>
          </mrow>
        </math>
      `;
    }
    return html`
      <math>
        <mrow>
          <mi>x</mi><mo>&#x21A6;</mo>
          <mfrac>
            <mrow><mn>${c.a}</mn><mo>&#x2062;</mo><mi>x</mi><mo>+</mo><mn>${c.b}</mn></mrow>
            <mrow><mn>${c.c}</mn><mo>&#x2062;</mo><mi>x</mi><mo>+</mo><mn>${c.d}</mn></mrow>
          </mfrac>
          <mspace width="0.4em"></mspace><mi>mod</mi>
          <mspace width="0.25em"></mspace><mn>${this.p}</mn>
        </mrow>
      </math>
    `;
  }

  private coefRow(k: string) {
    // A coefficient is a field element: always an integer. The transition
    // phase between steps is the progress strip in the Animation section.
    const shown = String(this.coefs[k] ?? 0);
    // Real and i-part rows of one coefficient sit as a tight pair.
    const pair = k.length === 2 ? (k[1] === '0' ? 'pair-start' : 'pair-end') : '';
    return html`
      <div class="row coef ${pair}">
        <input
          type="radio"
          name="arm"
          class="arm"
          title="Animate this coefficient"
          aria-label=${`Animate ${k}`}
          ?disabled=${this.stepMode !== 'coef'}
          .checked=${live(this.animKey === k)}
          @change=${() => ui.tx.send(':anim', k)}
        />
        <span class="lbl">${this.keyLabel(k)}</span>
        <input
          type="range"
          min="0"
          max=${this.p - 1}
          step="1"
          .value=${live(String(this.coefs[k] ?? 0))}
          aria-label=${`Coefficient ${k}`}
          @input=${(e: Event) =>
            ui.tx.send(':coef', k, Number((e.target as HTMLInputElement).value))}
        />
        <span class="val">${shown}</span>
      </div>
    `;
  }

  // A coefficient row in exponential form: one slider drives the exponent k
  // of gᵏ; the 0 button toggles the zero element, which is not a power of g.
  private expRow(k: string) {
    const kv = (this.exps[k] ?? null) as number | null;
    const zero = kv === null;
    return html`
      <div class="row coef">
        <input
          type="radio"
          name="arm"
          class="arm"
          title="Animate this coefficient"
          aria-label=${`Animate ${k}`}
          ?disabled=${this.stepMode !== 'coef'}
          .checked=${live(this.animKey === k)}
          @change=${() => ui.tx.send(':anim', k)}
        />
        <span class="lbl">${this.keyLabel(k)}</span>
        <input
          type="range"
          min="0"
          max=${this.expMax}
          step="1"
          .value=${live(String(kv ?? 0))}
          aria-label=${`Exponent of ${k}`}
          title=${zero ? 'Moving the slider sets the coefficient to gᵏ' : ''}
          @input=${(e: Event) =>
            ui.tx.send(':exp', k, Number((e.target as HTMLInputElement).value))}
        />
        <span class="val">${zero ? '—' : kv}</span>
        <button
          type="button"
          class="quiet zbtn ${zero ? 'on' : ''}"
          title=${zero ? 'Set to g⁰ = 1' : 'Set to zero'}
          @click=${() => ui.tx.send(':exp-zero', k)}
        >0</button>
      </div>
    `;
  }

  private presetButtons() {
    if (this.mode === 'fp2') {
      const id = { a0: 0, a1: 0, b0: 0, b1: 0, c0: 0, c1: 0, d0: 1, d1: 0 };
      return html`
        <button type="button" @click=${() => ui.tx.send(':preset', { ...id, a0: 2 })}>
          a·z
        </button>
        <button type="button" @click=${() => ui.tx.send(':preset', { ...id, a1: 1 })}>
          i·z
        </button>
        <button
          type="button"
          @click=${() =>
            ui.tx.send(':preset', { a0: 0, a1: 0, b0: 1, b1: 0, c0: 1, c1: 0, d0: 0, d1: 0 })}
        >
          1/z
        </button>
      `;
    }
    return html`
      <button type="button" @click=${() => ui.tx.send(':preset', { a: 2, b: 0, c: 0, d: 1 })}>
        a·x &mdash; times table
      </button>
      <button type="button" @click=${() => ui.tx.send(':preset', { a: 0, b: 1, c: 1, d: 0 })}>
        1/x &mdash; inversion
      </button>
    `;
  }

  render() {
    return html`
      <div class="seg mode" role="radiogroup" aria-label="Field">
        <label>
          <input
            type="radio"
            name="mode"
            value="fp"
            .checked=${live(this.mode === 'fp')}
            @change=${() => ui.tx.send(':mode', 'fp')}
          />
          <span class="upright"><math><msub><mi>𝔽</mi><mi>p</mi></msub></math></span>
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="fp2"
            .checked=${live(this.mode === 'fp2')}
            @change=${() => ui.tx.send(':mode', 'fp2')}
          />
          <span class="upright"><math><msub><mi>𝔽</mi><msup><mi>p</mi><mn>2</mn></msup></msub></math></span>
        </label>
      </div>

      <section>
        <div class="row">
          <span class="lbl"><math><mi>p</mi></math></span>
          <input
            type="number"
            min=${this.mode === 'fp' ? 2 : 3}
            max=${this.pMax}
            step="1"
            .value=${live(String(this.p))}
            aria-label="Field characteristic p"
            @change=${(e: Event) =>
              ui.tx.send(':p-raw', Number((e.target as HTMLInputElement).value))}
          />
          <span class="stepper">
            <button
              type="button"
              title="Previous prime"
              aria-label="Previous prime"
              @click=${() => ui.tx.send(':p-step', -1)}
            >&lsaquo;</button>
            <button
              type="button"
              title="Next prime"
              aria-label="Next prime"
              @click=${() => ui.tx.send(':p-step', 1)}
            >&rsaquo;</button>
          </span>
          <span class="pmax" title="Largest prime this mode accepts">&le; ${this.pMax}</span>
        </div>
        ${this.mode === 'fp2' && this.i2 > 0
          ? html`
              <div
                class="row"
                title="Quadratic non-residue defining i — the torus coordinates depend on it"
              >
                <span class="lbl"><math><msup><mi>i</mi><mn>2</mn></msup></math></span>
                <span class="readout">${this.i2}</span>
                <span class="stepper">
                  <button
                    type="button"
                    aria-label="Previous non-residue"
                    @click=${() => ui.tx.send(':ns-step', -1)}
                  >&lsaquo;</button>
                  <button
                    type="button"
                    aria-label="Next non-residue"
                    @click=${() => ui.tx.send(':ns-step', 1)}
                  >&rsaquo;</button>
                </span>
              </div>
            `
          : ''}
        ${(this.mode === 'fp2' && this.coefForm === 'exp') || this.stepMode === 'mul'
          ? html`
              <div
                class="row"
                title="Generator of the multiplicative group — the ×g animation step depends on it"
              >
                <span class="lbl"><math><mi>g</mi></math></span>
                <span class="readout">${this.gDisp}</span>
                <span class="stepper">
                  <button
                    type="button"
                    aria-label="Previous generator"
                    @click=${() => ui.tx.send(':g-step', -1)}
                  >&lsaquo;</button>
                  <button
                    type="button"
                    aria-label="Next generator"
                    @click=${() => ui.tx.send(':g-step', 1)}
                  >&rsaquo;</button>
                </span>
              </div>
            `
          : ''}
        ${this.pNote ? html`<p class="status">${this.pNote}</p>` : ''}
      </section>

      <section>
        <h2>Animation</h2>
        <div class="row">
          <span class="lbl-wide">step</span>
          <div class="seg" role="radiogroup" aria-label="Animation step">
            ${(['coef', 'add', 'mul', 'T', 'iter'] as const).map(
              (mm) => html`
                <label>
                  <input
                    type="radio"
                    name="stepmode"
                    value=${mm}
                    .checked=${live(this.stepMode === mm)}
                    @change=${() => ui.tx.send(':step-mode', mm)}
                  />
                  <span class="upright">${mm === 'coef'
                    ? 'coef'
                    : mm === 'add'
                      ? html`<math><mrow><mi>z</mi><mo>+</mo><mn>1</mn></mrow></math>`
                      : mm === 'mul'
                        ? html`<math><mrow><mi>g</mi><mo>&#xB7;</mo><mi>z</mi></mrow></math>`
                        : mm === 'T'
                          ? html`<math><mi>T</mi></math>`
                          : html`<math><msup><mi>M</mi><mi>n</mi></msup></math>`}</span>
                </label>
              `,
            )}
          </div>
        </div>
        ${this.stepMode === 'T'
          ? html`
              <div class="row" title="Step matrix T over the prime field: M ← T·M">
                <span class="lbl"><math><mi>T</mi></math></span>
                ${(['a', 'b', 'c', 'd'] as const).map(
                  (k) => html`
                    <input
                      type="number"
                      class="tnum"
                      min="0"
                      max=${this.p - 1}
                      step="1"
                      .value=${live(String(this.T[k] ?? 0))}
                      aria-label=${`T ${k}`}
                      @change=${(e: Event) =>
                        ui.tx.send(':tset', k, Number((e.target as HTMLInputElement).value))}
                    />
                  `,
                )}
              </div>
            `
          : ''}
        ${this.tInfo
          ? html`<p class="status ${this.tWarn ? 'warn' : ''}">${this.tInfo}</p>`
          : ''}
        <div class="transport-row">
          <span
            class="anim-target"
            title=${this.stepMode === 'coef'
              ? 'Animated coefficient — arm one with the dot beside its slider'
              : 'The whole map steps: M ← S·M'}
          >
            ${this.stepMode === 'coef'
              ? this.keyLabel(this.animKey)
              : this.stepMode === 'add'
                ? html`<math><mrow><mi>z</mi><mo>+</mo><mn>1</mn></mrow></math>`
                : this.stepMode === 'mul'
                  ? html`<math><mrow><mi>g</mi><mo>&#xB7;</mo><mi>z</mi></mrow></math>`
                  : this.stepMode === 'T'
                    ? html`<math><mi>T</mi></math>`
                    : html`<math><msup><mi>M</mi><mi>n</mi></msup></math>`}
          </span>
          <span class="transport">
            <button
              type="button"
              title="Step −1"
              aria-label="Step back"
              @click=${() => ui.tx.send(':step', -1)}
            >${ICON_BACK}</button>
            <button
              type="button"
              title="Play / pause (Space)"
              aria-label=${this.playing ? 'Pause' : 'Play'}
              @click=${() => ui.tx.send(':play')}
            >${this.playing ? ICON_PAUSE : ICON_PLAY}</button>
            <button
              type="button"
              title="Step +1"
              aria-label="Step forward"
              @click=${() => ui.tx.send(':step', 1)}
            >${ICON_FWD}</button>
          </span>
          <input
            type="range"
            min="0.05"
            max="4"
            step="0.05"
            .value=${live(String(this.speed))}
            title="Speed, steps per second"
            aria-label="Speed, steps per second"
            @input=${(e: Event) =>
              ui.tx.send(':speed', Number((e.target as HTMLInputElement).value))}
          />
          <span class="val">${this.speed.toFixed(2)}</span>
        </div>
        <div
          class="phase"
          title="Phase of the transition from the current value of the animated coefficient to +1"
        >
          <div class="phase-fill" style="width: ${(this.animValue % 1) * 100}%"></div>
        </div>
      </section>

      <section>
        <h2>Map</h2>
        ${this.mode === 'fp2'
          ? html`
              <div class="row">
                <span class="lbl-wide">form</span>
                <div class="seg" role="radiogroup" aria-label="Coefficient form">
                  <label>
                    <input
                      type="radio"
                      name="form"
                      value="cart"
                      .checked=${live(this.coefForm === 'cart')}
                      @change=${() => ui.tx.send(':form', 'cart')}
                    />
                    <span><math><mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>&#x2062;</mo><mi>i</mi></mrow></math></span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="form"
                      value="exp"
                      .checked=${live(this.coefForm === 'exp')}
                      @change=${() => ui.tx.send(':form', 'exp')}
                    />
                    <span><math><msup><mi>g</mi><mi>k</mi></msup></math></span>
                  </label>
                </div>
              </div>
            `
          : ''}
        <div class="formula" aria-label="Current map">${this.liveFormula()}</div>
        ${this.mode === 'fp2' && this.coefForm === 'exp'
          ? FP_KEYS.map((k) => this.expRow(k))
          : this.keys().map((k) => this.coefRow(k))}
        <p class="status ${this.detWarn ? 'warn' : ''}">${this.detText}</p>
        <p class="status">${this.pole}</p>
        <div class="presets">${this.presetButtons()}</div>
      </section>

      <section>
        <h2>View</h2>
        <div class="row" title="Element order: by value, or by discrete log over g">
          <span class="lbl-wide">layout</span>
          <div class="seg" role="radiogroup" aria-label="Layout">
            <label>
              <input
                type="radio"
                name="layout"
                value="geom"
                .checked=${live(this.layout === 'geom')}
                @change=${() => ui.tx.send(':layout', 'geom')}
              />
              <span class="upright">${this.mode === 'fp' ? 'circle' : 'torus'}</span>
            </label>
            <label>
              <input
                type="radio"
                name="layout"
                value="log"
                .checked=${live(this.layout === 'log')}
                @change=${() => ui.tx.send(':layout', 'log')}
              />
              <span class="upright"><math><msup><mi>g</mi><mi>k</mi></msup></math>&nbsp;ring</span>
            </label>
          </div>
        </div>
        <div class="row">
          <span class="lbl-wide">phase</span>
          <div class="seg" role="radiogroup" aria-label="Phase rendering">
            ${(['arc', 'fade'] as const).map(
              (mm) => html`
                <label>
                  <input
                    type="radio"
                    name="phasemode"
                    value=${mm}
                    .checked=${live(this.phaseMode === mm)}
                    @change=${() => ui.tx.send(':phase-mode', mm)}
                  />
                  <span class="upright">${mm}</span>
                </label>
              `,
            )}
          </div>
        </div>
        <div class="row checks">
          <label class="check">
            <input
              type="checkbox"
              .checked=${live(this.showPoints)}
              @change=${(e: Event) =>
                ui.tx.send(':view', 'showPoints', (e.target as HTMLInputElement).checked)}
            />
            points
          </label>
          <label class="check" title="Extend each chord's line beyond the ${this.mode === 'fp' ? 'circle' : 'torus'}">
            <input
              type="checkbox"
              .checked=${live(this.showExt)}
              @change=${(e: Event) =>
                ui.tx.send(':view', 'showExt', (e.target as HTMLInputElement).checked)}
            />
            extensions
          </label>
        </div>
        <div class="row" title="Brightness compression of dense line crossings">
          <span class="lbl-wide">glow</span>
          <input
            type="range"
            min="0.2"
            max="2.5"
            step="0.05"
            .value=${live(String(this.exposure))}
            aria-label="Glow exposure"
            @input=${(e: Event) =>
              ui.tx.send(':exposure', Number((e.target as HTMLInputElement).value))}
          />
          <span class="val">${this.exposure.toFixed(2)}</span>
        </div>
        <div class="row" title="Mouse wheel over the canvas zooms; double-click resets">
          <span class="lbl-wide">zoom</span>
          <span class="val">×${this.zoom.toFixed(2)}</span>
          <button
            type="button"
            class="quiet"
            ?disabled=${this.zoom === 1}
            @click=${() => ui.tx.send(':zoom-reset')}
          >reset</button>
        </div>
      </section>
    `;
  }

  static styles = css`
    /* The page-level box-sizing reset does not cross the shadow boundary. */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* Glassmorphism card: translucent ground, backdrop blur, hairline edge.
       The canvas runs underneath, so chord extensions read through the glass. */
    :host {
      display: block;
      width: 300px;
      padding: 20px;
      overflow-y: auto;
      background: var(--glass, rgba(15, 19, 27, 0.55));
      backdrop-filter: blur(24px) saturate(1.25);
      -webkit-backdrop-filter: blur(24px) saturate(1.25);
      border: 1px solid var(--glass-border, rgba(231, 234, 239, 0.08));
      border-radius: 22px;
      corner-shape: superellipse(1.25);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
      color: var(--ink, #e7eaef);
      font: 13px/1.5 var(--sans, system-ui, sans-serif);
    }

    h2 {
      font-size: 10.5px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--faint, #5c636d);
      margin: 0 0 10px;
    }

    section {
      padding: 13px 0;
      border-top: 1px solid var(--hairline, #1c2027);
    }

    section:first-of-type {
      border-top: none;
    }

    .formula {
      font-size: 15px;
      color: var(--ink, #e7eaef);
      margin: 2px 0 10px;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 8px 0;
    }

    .row.coef {
      margin: 6px 0;
    }

    /* a₀ / a₁ read as one coefficient: tight inside the pair, air between. */
    .row.coef.pair-start {
      margin-bottom: 1px;
    }

    .row.coef.pair-end {
      margin-top: 1px;
      margin-bottom: 12px;
    }

    /* DAW-style arm dot: the transport animates the armed coefficient. */
    .arm {
      appearance: none;
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      flex: none;
      margin: 0;
      border: 1px solid var(--faint, #5c636d);
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
    }

    .arm:hover {
      border-color: var(--muted, #8a919c);
    }

    .arm:checked {
      background: var(--thumb, #c7ced9);
      border-color: var(--thumb, #c7ced9);
    }

    .anim-target {
      min-width: 30px;
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      font-size: 14px;
      color: var(--ink, #e7eaef);
    }

    .seg span math,
    .anim-target math {
      line-height: 1;
    }

    /* Morph phase between the map at the current coefficient and at +1.
       A rendering parameter, not a field element — hence a strip, not a
       fractional readout. */
    .phase {
      height: 2px;
      margin-top: 10px;
      background: var(--hairline-strong, #262b33);
      border-radius: 1px;
      overflow: hidden;
    }

    .phase-fill {
      height: 100%;
      width: 0;
      background: var(--thumb, #c7ced9);
    }

    .lbl {
      width: 20px;
      flex: none;
      font-size: 14px;
      color: var(--muted, #8a919c);
    }

    .lbl-wide {
      flex: none;
      color: var(--muted, #8a919c);
    }

    .val {
      width: 44px;
      flex: none;
      text-align: right;
      font-family: var(--mono, ui-monospace, monospace);
      font-variant-numeric: tabular-nums;
      color: var(--ink, #e7eaef);
    }

    .status {
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 11.5px;
      color: var(--muted, #8a919c);
      margin: 6px 0 0;
      min-height: 1.2em;
    }

    .status.warn {
      color: var(--warn, #d8a657);
    }

    input[type='range'] {
      -webkit-appearance: none;
      appearance: none;
      flex: 1;
      min-width: 0;
      height: 24px;
      margin: 0;
      background: transparent;
      cursor: pointer;
    }

    input[type='range']::-webkit-slider-runnable-track {
      height: 2px;
      background: var(--hairline-strong, #262b33);
    }

    input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      margin-top: -5px;
      border-radius: 50%;
      border: none;
      background: var(--thumb, #c7ced9);
    }

    input[type='range']::-moz-range-track {
      height: 2px;
      background: var(--hairline-strong, #262b33);
    }

    input[type='range']::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border: none;
      border-radius: 50%;
      background: var(--thumb, #c7ced9);
    }

    input[type='number'] {
      width: 76px;
      height: 28px;
      padding: 0 8px;
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 13px;
      color: var(--ink, #e7eaef);
      background: var(--ground, #0a0c10);
      border: 1px solid var(--hairline-strong, #262b33);
      border-radius: 7px;
      corner-shape: superellipse(1.25);
    }

    .stepper {
      display: inline-flex;
    }

    .stepper button {
      width: 28px;
      height: 28px;
      padding: 0;
      font-size: 14px;
      line-height: 1;
      color: var(--muted, #8a919c);
      background: transparent;
      border: 1px solid var(--hairline-strong, #262b33);
      cursor: pointer;
    }

    .stepper button:first-child {
      border-radius: 7px 0 0 7px;
      corner-shape: superellipse(1.25);
      border-right: none;
    }

    .stepper button:last-child {
      border-radius: 0 7px 7px 0;
      corner-shape: superellipse(1.25);
    }

    .stepper button:hover {
      background: var(--hover, #161a21);
      color: var(--ink, #e7eaef);
    }

    .pmax {
      margin-left: auto;
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 11px;
      color: var(--faint, #5c636d);
    }

    .readout {
      flex: none;
      min-width: 52px;
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 13px;
      color: var(--ink, #e7eaef);
    }

    .zbtn {
      margin-left: 0;
      padding: 0 7px;
    }

    .tnum {
      width: 46px;
      min-width: 0;
      height: 28px;
      padding: 0 6px;
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 12px;
      color: var(--ink, #e7eaef);
      background: var(--ground, #0a0c10);
      border: 1px solid var(--hairline-strong, #262b33);
      border-radius: 7px;
      corner-shape: superellipse(1.25);
    }

    .steplbl {
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 12px;
    }

    .arm:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .zbtn.on {
      background: var(--hairline, #1c2027);
      color: var(--ink, #e7eaef);
    }

    .presets {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .presets button {
      flex: 1;
      height: 28px;
      padding: 0 6px;
      white-space: nowrap;
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 11px;
      color: var(--muted, #8a919c);
      background: transparent;
      border: 1px solid var(--hairline-strong, #262b33);
      border-radius: 7px;
      corner-shape: superellipse(1.25);
      cursor: pointer;
    }

    .presets button:hover {
      background: var(--hover, #161a21);
      color: var(--ink, #e7eaef);
    }

    .seg {
      display: flex;
      flex: 1;
    }

    .seg.mode {
      margin-bottom: 16px;
    }

    .seg label {
      flex: 1;
      position: relative;
    }

    .seg input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .seg span {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      padding: 0;
      line-height: 1;
      font-size: 13px;
      font-style: italic;
      color: var(--muted, #8a919c);
      border: 1px solid var(--hairline-strong, #262b33);
      border-right: none;
      cursor: pointer;
      user-select: none;
    }

    .seg span.upright {
      font-style: normal;
    }

    .seg label:first-child span {
      border-radius: 7px 0 0 7px;
      corner-shape: superellipse(1.25);
    }

    .seg label:last-child span {
      border-right: 1px solid var(--hairline-strong, #262b33);
      border-radius: 0 7px 7px 0;
      corner-shape: superellipse(1.25);
    }

    .seg input:checked + span {
      background: var(--hairline, #1c2027);
      color: var(--ink, #e7eaef);
    }

    .seg input:focus-visible + span {
      outline: 1px solid var(--muted, #8a919c);
      outline-offset: 1px;
    }

    .transport-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }

    .transport {
      display: inline-flex;
      gap: 6px;
    }

    .transport button {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--hairline-strong, #262b33);
      border-radius: 7px;
      corner-shape: superellipse(1.25);
      cursor: pointer;
    }

    .transport button:hover {
      background: var(--hover, #161a21);
    }

    .transport svg {
      width: 11px;
      height: 11px;
      fill: var(--muted, #8a919c);
    }

    .transport button:hover svg {
      fill: var(--ink, #e7eaef);
    }

    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0;
      color: var(--muted, #8a919c);
      cursor: pointer;
    }

    .check input {
      accent-color: var(--thumb, #c7ced9);
      margin: 0;
    }

    .row.checks {
      gap: 18px;
    }

    .quiet {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      font-family: var(--mono, ui-monospace, monospace);
      font-size: 11px;
      color: var(--muted, #8a919c);
      background: transparent;
      border: 1px solid var(--hairline-strong, #262b33);
      border-radius: 7px;
      corner-shape: superellipse(1.25);
      cursor: pointer;
    }

    .quiet:hover:not(:disabled) {
      background: var(--hover, #161a21);
      color: var(--ink, #e7eaef);
    }

    .quiet:disabled {
      opacity: 0.4;
      cursor: default;
    }

    button:focus-visible,
    input[type='number']:focus-visible,
    input[type='range']:focus-visible,
    input[type='checkbox']:focus-visible {
      outline: 1px solid var(--muted, #8a919c);
      outline-offset: 2px;
    }
  `;
}

customElements.define('control-panel', ControlPanel);
