# Multiplication in Galois Fields

An interactive visualization of the fractional linear map

$$z \mapsto \frac{az + b}{cz + d}$$

over the finite fields $\mathbb{F}_p$ and $\mathbb{F}_{p^2}$. The elements
of $\mathbb{F}_p$ are points of a circle, the elements of
$\mathbb{F}_{p^2}$ are points of a torus; a line joins an element to its
image.

Live demo: [evgkch.github.io/galois](https://evgkch.github.io/galois/).
Русская версия: [README.ru.md](README.ru.md).

| [![Chords of the times-two map](screenshots/fp-times2.png)](https://evgkch.github.io/galois/) | [![Chords of the inversion](screenshots/fp-inversion.png)](https://evgkch.github.io/galois/?a=0&b=1&c=1&d=0) | [![Chords of the times-two map on the torus](screenshots/fp2-torus.png)](https://evgkch.github.io/galois/?mode=fp2) |
| :--: | :--: | :--: |
| The map $x \mapsto 2x$ at $p = 257$: the envelope of the chords is a cardioid ([open](https://evgkch.github.io/galois/)). | The inversion $x \mapsto x^{-1}$ at $p = 257$: chords join mutually inverse elements ([open](https://evgkch.github.io/galois/?a=0&b=1&c=1&d=0)). | The map $z \mapsto 2z$ in $\mathbb{F}_{257^2}$: transition segments and their extensions ([open](https://evgkch.github.io/galois/?mode=fp2)). |

## The circle: the field 𝔽p

The field $\mathbb{F}_p$ is the residues $\{0, 1, \dots, p-1\}$ modulo a
prime $p$. Its elements are points of a circle in $\mathbb{R}^2$, placed in
the order $0, 1, \dots, p-1$. The map

$$x \mapsto \frac{ax + b}{cx + d} \pmod{p}$$

is drawn as lines: a segment joins the point $x$ to its image.

Division is multiplication by the inverse element: for example, in
$\mathbb{F}_7$ the inverse of $3$ is $5$, because $3 \cdot 5 \equiv 1$.

The $p$ segments together depict the whole map; the classical
"multiplication table on a circle" is the special case $x \mapsto ax$. At
$a = 2$ the envelope of the segments is a cardioid, at $a = 3$ a nephroid;
for larger $a$, epicycloids with $a - 1$ cusps ([$a = 5$](https://evgkch.github.io/galois/?a=5)).

The pole $x_0 = -d/c$ goes to the infinity of the projective line
$\mathbb{P}^1(\mathbb{F}_p) = \mathbb{F}_p \cup \{\infty\}$; its segment is
not drawn. At $ad - bc \equiv 0$ the map is degenerate — every image
coincides.

## The torus: the field 𝔽p²

The quadratic extension is built by adjoining a root of an irreducible
polynomial:

$$\mathbb{F}_{p^2} = \mathbb{F}_p[i]/(i^2 - \nu),$$

where $\nu$ is a quadratic non-residue modulo $p$. For example, at $p = 7$
the squares of the nonzero residues are $\{1, 2, 4\}$, and one can take
$\nu = 3$. Every element is uniquely written as $z = x + yi$;
multiplication expands by the rule $i^2 = \nu$. The inverse element is
expressed through the norm:

$$z^{-1} = \frac{\bar z}{N(z)}, \qquad N(z) = z\bar z = x^2 - \nu y^2, \qquad \bar z = x - yi.$$

The norm vanishes only at $z = 0$, because $\nu$ is not a square; hence
every nonzero element is invertible.

The elements of $\mathbb{F}_{p^2}$ are points of a torus in $\mathbb{R}^3$:
the coordinates $x$ and $y$ run along the two loops of the torus, both
periodic with period $p$. The map is drawn as lines in $\mathbb{R}^3$: a
segment joins the point $z$ to its image. The same surface arises
from the $p \times p$ multiplication table by gluing its opposite edges.

The choice of the non-residue $\nu$ fixes the basis $\{1, i\}$ and with it
the coordinates: one and the same abstract map is drawn differently for
different $\nu$. Affine maps with coefficients in the prime subfield do not
depend on $\nu$; the inversion $z \mapsto z^{-1}$ does ([$\nu = 3$](https://evgkch.github.io/galois/?mode=fp2&a0=0&b0=1&c0=1&d0=0), [$\nu = 5$](https://evgkch.github.io/galois/?mode=fp2&a0=0&b0=1&c0=1&d0=0&ns=5)).

## Geometric progressions and the logarithmic layout

The multiplicative group $\mathbb{F}_q^{\times}$ (here $q = p$ or $p^2$) is
cyclic: for a generator $g$, every nonzero element is uniquely $g^k$,
$0 \le k < q - 1$. For example, in $\mathbb{F}_7$ the generator is three:
its powers $3, 2, 6, 4, 5, 1$ run through all nonzero residues.

**Exponential form**: a coefficient is given by the exponent $k$ in the
form $g^k$; the zero element is not a power of $g$. The animation step in
this form multiplies the coefficient by $g$ — the coefficient runs through
the geometric progression $g^k, g^{k+1}, \dots$

**Logarithmic layout**: the nonzero elements lie on a ring in the order of
the exponents $k$, with zero at the center. Multiplication by $g$ in this
layout is a one-notch rotation of the ring ([example](https://evgkch.github.io/galois/?layout=log&step=mul&play=1)), and all chords of the map
$x \mapsto ax$ subtend arcs of one and the same length.

In the logarithmic scale a geometric progression is uniform, while in the
scale of values it is distributed like a random sequence (the same powers
of three: $3, 2, 6, 4, 5, 1$). In the logarithmic layout the picture
changes with the choice of the generator $g$.

## Animation

The "step" control picks what one transport step does:

| Step  | Action                                                                       |
| ----- | ----------------------------------------------------------------------------- |
| coef  | $+1$ to the component armed with the dot; in the $g^k$ form, multiply it by $g$ |
| z+1   | the whole map: $M \mapsto SM$ with the translation $S\colon z \mapsto z + 1$   |
| g·z   | the whole map: $M \mapsto SM$ with the homothety $S\colon z \mapsto gz$        |
| T     | the whole map: $M \mapsto TM$ with the matrix $T$ from four input fields       |
| $M^n$ | iteration of the map itself: the $n$-th step shows $M^n$ ([example](https://evgkch.github.io/galois/?step=iter&play=1)) |

The steps z+1, g·z, T and $M^n$ are invertible, so the path stays inside
$\mathrm{PGL}_2(\mathbb{F}_q)$ and never passes through degenerate maps;
the coef path may cross the set $ad - bc \equiv 0$. The discriminant

$$\Delta = (\mathrm{tr}\, S)^2 - 4 \det S$$

determines the type of the step $S$: hyperbolic — $\Delta$ a square, two
fixed points on the line; parabolic — $\Delta = 0$, one; elliptic —
$\Delta$ a non-square, no fixed points on the line — they lie in the
quadratic extension. For example, the step $z \mapsto -1/z$ at
$p \equiv 3 \pmod 4$ is elliptic: its fixed points are the roots of
$z^2 = -1$, and those exist only in $\mathbb{F}_{p^2}$ ([example](https://evgkch.github.io/galois/?p=103&step=T&t=0,102,1,0&play=1)). The panel shows the
type and the order of the step: after that many steps the animation
returns to the initial map.

The "phase" control picks how the fraction between steps is drawn: arc —
the chord's end slides along an arc towards the next image; fade — the two
neighboring diagrams are drawn with weights $1 - t$ and $t$. There are no
intermediate maps inside a finite field: arc interpolates the embedding,
fade shows nothing but the maps themselves. For translations, and in the
logarithmic layout also for g·z, the arc interpolation coincides with the
exact flow.

[![The panel with coefficients as powers of the generator](screenshots/fp2-exp.png)](https://evgkch.github.io/galois/?mode=fp2&form=exp)

Coefficients in the $g^k$ form: $a = g^{37152} = 2$, the denominator is
$g^0 = 1$; the generator is $g = 1 + 5i$ ([open](https://evgkch.github.io/galois/?mode=fp2&form=exp)).

## Controls

| Control     | Action                                                                   |
| ----------- | ------------------------------------------------------------------------ |
| 𝔽p / 𝔽p²   | switches between the circle and the torus                                |
| p           | field characteristic; ‹ › step through primes, the maximum is shown beside |
| i²          | the quadratic non-residue $\nu$ defining $i$ ($\mathbb{F}_{p^2}$ only)   |
| g           | generator of $\mathbb{F}_q^{\times}$ (the $g^k$ form and the g·z step)   |
| form        | coefficient form: $x + yi$ or $g^k$                                      |
| dot in a coefficient row | picks which coefficient the transport drives (coef step)    |
| step        | what a step does: coef, z+1, g·z, T or $M^n$                             |
| phase       | how the fraction between steps is drawn: arc or cross-fade               |
| layout      | element order: by value or by discrete log                               |
| ⏮ ▶ ⏭       | step $-1$, play and pause (Space), step $+1$                             |
| speed       | steps per second; the strip under the transport is the transition phase  |
| presets     | a·x and 1/x on the circle; a·z, i·z and 1/z on the torus                 |
| view        | points; chord extensions; glow; zoom                                     |
| mouse       | wheel — zoom ×0.1–×10; drag the torus — it rotates; double click — reset |

## URL parameters

| Parameter           | Meaning                                           |
| ------------------- | ------------------------------------------------- |
| mode=fp2            | start on the torus                                |
| p=257               | field characteristic                              |
| a…d, a0…d1          | coefficients of the corresponding mode            |
| form=exp            | coefficients in the $g^k$ form                    |
| ns=5                | quadratic non-residue for $i^2$ (validated)       |
| g=1,5               | generator as a pair $u,v$ (validated)             |
| step=add\|mul\|T\|iter | animation step mode                            |
| t=2,3,1,4           | the step matrix T                                 |
| arm=b0              | the coefficient armed for the coef step           |
| phase=fade          | cross-fade instead of the arc interpolation       |
| layout=log          | layout by discrete log                            |
| points=0, ext=0     | hide the points and the chord extensions          |
| glow=1.5            | tone-map exposure                                 |
| zoom=0.7            | zoom                                              |
| play=1, speed=0.5   | autostart of the animation and its speed          |

Example: `?mode=fp2&p=101&a1=1&step=mul&layout=log&play=1`.

## Run

```
npm install
npm run dev
```

## Reference

V. I. Arnold. Dynamics, statistics and projective geometry of Galois
fields. — Moscow: MCCME, 2005. — 72 p. — In Russian:
[pdf at mccme.ru](https://old.mccme.ru/free-books/arnold/VIA-Galua.pdf).
