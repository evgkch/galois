import { LitElement, html, css } from 'lit';
import type { Mode } from './bus';

// Floating caption over the canvas: the symbolic map in arrow notation.
// Field construction details (i² ≡ ns) live in the panel's Field section.
// Inline <math> inside a right-aligned block — block-level MathML centers
// itself and ignores text-align.
export class MapFormula extends LitElement {
  static properties = {
    mode: { type: String },
  };

  declare mode: Mode;

  constructor() {
    super();
    this.mode = 'fp';
  }

  render() {
    if (this.mode === 'fp2') {
      return html`
        <div class="sym">
          <math>
            <mrow>
              <mi>z</mi><mo>&#x21A6;</mo>
              <mfrac>
                <mrow><mi>a</mi><mo>&#x2062;</mo><mi>z</mi><mo>+</mo><mi>b</mi></mrow>
                <mrow><mi>c</mi><mo>&#x2062;</mo><mi>z</mi><mo>+</mo><mi>d</mi></mrow>
              </mfrac>
              <mspace width="0.4em"></mspace>
              <mtext>in</mtext>
              <mspace width="0.25em"></mspace>
              <msub><mi>𝔽</mi><msup><mi>p</mi><mn>2</mn></msup></msub>
            </mrow>
          </math>
        </div>
      `;
    }
    return html`
      <div class="sym">
        <math>
          <mrow>
            <mi>x</mi><mo>&#x21A6;</mo>
            <mfrac>
              <mrow><mi>a</mi><mo>&#x2062;</mo><mi>x</mi><mo>+</mo><mi>b</mi></mrow>
              <mrow><mi>c</mi><mo>&#x2062;</mo><mi>x</mi><mo>+</mo><mi>d</mi></mrow>
            </mfrac>
            <mspace width="0.4em"></mspace><mi>mod</mi>
            <mspace width="0.25em"></mspace><mi>p</mi>
          </mrow>
        </math>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      text-align: right;
      pointer-events: none;
      font-family: var(--sans, system-ui, sans-serif);
    }

    math {
      text-shadow: 0 1px 10px rgba(4, 6, 10, 0.9);
    }

    .sym {
      font-size: 21px;
      color: var(--ink, #e7eaef);
    }
  `;
}

customElements.define('map-formula', MapFormula);
