# Multiplication in Galois Fields

An interactive visualization of the fractional linear map

$$z \mapsto \frac{az + b}{cz + d}$$

over the finite fields $`\mathbb{F}_p`$ and $`\mathbb{F}_{p^2}`$. The elements
of $`\mathbb{F}_p`$ are points of a circle, the elements of
$`\mathbb{F}_{p^2}`$ are points of a torus; a line joins an element to its
image.

Live demo: [evgkch.github.io/galois](https://evgkch.github.io/galois/).
Русская версия: [README.ru.md](README.ru.md).

| [![Chords of the times-two map](screenshots/fp-times2.png)](https://evgkch.github.io/galois/) | [![Chords of the inversion](screenshots/fp-inversion.png)](https://evgkch.github.io/galois/?a=0&b=1&c=1&d=0) | [![Chords of the times-two map on the torus](screenshots/fp2-torus.png)](https://evgkch.github.io/galois/?mode=fp2) |
| :--: | :--: | :--: |
| The map $x \mapsto 2x$ at $p = 257$: the envelope of the chords is a cardioid ([open](https://evgkch.github.io/galois/)). | The inversion $x \mapsto x^{-1}$ at $p = 257$: chords join mutually inverse elements ([open](https://evgkch.github.io/galois/?a=0&b=1&c=1&d=0)). | The map $z \mapsto 2z$ in $`\mathbb{F}_{257^2}`$: transition segments and their extensions ([open](https://evgkch.github.io/galois/?mode=fp2)). |

## The circle: the field 𝔽p

The field $`\mathbb{F}_p`$ is the residues $\{0, 1, \dots, p-1\}$ modulo a
prime $p$. Its elements are points of a circle in $\mathbb{R}^2$, placed in
the order $0, 1, \dots, p-1$. The map

$$x \mapsto \frac{ax + b}{cx + d} \pmod{p}$$

is drawn as lines: a segment joins the point $x$ to its image.

Division is multiplication by the inverse element: for example, in
$`\mathbb{F}_7`$ the inverse of $3$ is $5$, because $3 \cdot 5 \equiv 1$.

The $p$ segments together depict the whole map; the classical
"multiplication table on a circle" is the special case $x \mapsto ax$. At
$a = 2$ the envelope of the segments is a cardioid, at $a = 3$ a nephroid;
for larger $a$, epicycloids with $a - 1$ cusps ([$a = 5$](https://evgkch.github.io/galois/?a=5)).
Why these are epicycloids is shown in the next section.

The pole $`x_0 = -d/c`$ goes to the infinity of the projective line
$`\mathbb{P}^1(\mathbb{F}_p) = \mathbb{F}_p \cup \{\infty\}`$; its segment is
not drawn. At $ad - bc \equiv 0$ the map is degenerate — every image
coincides.

## The caustic and the source

The same picture is an optical scene. The circle is a mirror: it reflects
from inside, and from outside it is transparent and does not refract. The
chord from $x$ to $f(x)$ is a ray that arrived at the point $x$, was
reflected and left for $f(x)$. Where it came from the law of reflection
sets, so every chord has its light before the reflection, and the
question is how this light is arranged. The answer: all incoming rays
touch one curve, the caustic of the incoming light; for $x \mapsto 2x$ it is a point on the rim, for $x \mapsto 3x$
infinity, for the other multiplications an epicycloid or a hypocycloid
with $|a - 1|$ cusps. The proof takes four steps.

**The incoming ray.** Let $P(\theta) = R e^{i\theta}$, with the element
$x$ placed at $P(2\pi x/p)$. The angle between a chord and the tangent
equals half the arc it subtends, and by the law of reflection the angles
of the incoming and outgoing chords with the tangent are equal, hence so
are the arcs: a ray arriving at $P(\gamma)$ from $P(\alpha)$ leaves for
$P(2\gamma - \alpha)$. So the chord $[P(\theta), P(a\theta + \beta)]$,
$\beta = 2\pi b/p$, is the reflection of the chord from
$P(m\theta - \beta)$, where $m = 2 - a$; for the elements the incoming ray
runs from $mx - b$ to $x$. The incoming ray is computed from the chord,
not chosen, so the scene's reflected rays coincide with the chords by
construction; the substance is only that they have a simple source.

**The caustic of the incoming light.** A family of rays focuses where neighbouring rays
cross; the set of such points is the caustic, the envelope of the
family. The incoming rays pass through $P(\theta)$ and $P(m\theta)$, and a
rotation through $`c_0 = \beta/(m - 1)`$ removes the shift $\beta$. The
line through $P(\theta)$ and $P(m\theta)$ has the equation
$x\cos\varphi + y\sin\varphi = R\cos\delta$, $\varphi = (m+1)\theta/2$,
$\delta = (m-1)\theta/2$; its crossing with the neighbouring line also
satisfies the derivative in $\theta$, and the solution of the system is

$$E(\theta) = \frac{R}{m + 1}\left(m e^{i\theta} + e^{im\theta}\right).$$

Every incoming ray touches $E$ at one point, and $E$ is the only such
curve. This is the caustic of the incoming light and in that sense its
source: light travels along the tangents of $E$. What emits it is
discussed below.

**The rolling wheel.** The formula for $E$ is a sum of two arms: a long one,
$`r_1 = mR/(m+1)`$, turned through $\theta$, and a short one,
$`r_2 = R/(m+1)`$, turned through $m\theta$. This is how a point on the rim
of a wheel of radius $`|r_2|`$ moves when the wheel's centre moves round
a circle of radius $`|r_1|`$ and the wheel itself rotates $m$ times faster. The wheel
rolls without slipping exactly when the rim point is at rest at the
moment of contact. The point's velocity

$$E'(\theta) = i\,r_1 e^{i\theta} + i\,m r_2 e^{im\theta}$$

is a sum of vectors of lengths $`|r_1|`$ and $`|m|\,|r_2|`$; it vanishes
only when $`|r_1| = |m|\,|r_2|`$, and that is an identity. So $E$ is the
track of a point on a rolling wheel. For $m > 1$ the arms turn the same
way and the wheel rolls round the outside of the fixed circle: an
epicycloid. For $m < -1$ they turn opposite ways and the wheel rolls
inside: a hypocycloid. The stops of the point are the cusps; per turn of
the long arm the wheel makes $m - 1$ turns relative to it, so there are
$|m - 1| = |a - 1|$ cusps, and they lie on the circle of radius
$`|r_1 - r_2| = R\,|m - 1|/|m + 1|`$. For $m = 2$ this is a cardioid, for
$m = 3$ a nephroid, for $m = -2$ a deltoid with cusps at $3R$.

**Where the caustic lies.** The incoming light reaches $x$ from inside the
disk, so $E$ lies either inside the circle or behind the mirror. In the
first case light diverges from the curve along its tangents, in the
second it
converges towards the curve and the mirror intercepts it before the
focus. The sign of $m$ tells the cases apart.

| $a$ | $m$ | The curve $E$ | Light |
| --- | --- | --- | --- |
| $2$ | $0$ | a point on the rim, the element $-b$ | a point source |
| $3$ | $-1$ | at infinity | a parallel beam from both sides |
| $\ge 4$ | $\le -2$ | a hypocycloid with $a - 1$ cusps outside the circle, cusps on the radius $R\,\frac{a-1}{a-3}$ | converges towards the curve behind the mirror |
| $\le 0$ | $\ge 2$ | an epicycloid with $1 - a$ cusps inside the circle | diverges from the curve |

The emitter is the wavefront $W$ with its cusps on the mirror, an
involute of $E$, discussed below. For $a \ge 4$ it lies inside the disk
and the light runs from it straight to the mirror; for $a \le 0$ it lies
outside, the light enters through the wall at $mx - b$ and touches $E$ on
the way. After the reflection the light runs along the chord to $ax + b$
and leaves through the wall. For $a \le -2$ the reflected rays diverge
from a hypocycloid behind the mirror, the virtual image of the emitter;
the backward extensions of the chords that the algebra draws lead to it.

**Caustic and wavefront.** Rays are the normals of the wavefront, and the
wavefronts are the involutes of the caustic, the lines of constant
optical path. The mirror maps one caustic to the other: the incoming
light focuses on $E$, the reflected light on the envelope of the chords.
The same formula with $m$ replaced by $a$ gives the envelope of the
chords $\theta \to a\theta$, and the same wheel an epicycloid with $a - 1$
cusps: the cardioid at $a = 2$, the nephroid at $a = 3$. $E$ itself is
not a wavefront: the wavefronts of the incoming light are the involutes
of $E$, parallel curves of each other. One of them is a curve of the same
kind, similar to $E$ with the ratio $|a - 3|/|a - 1|$ and turned through
half a cusp step; its cusps lie on the mirror, at the points where $E$
touches the circle, that is at the fixed points of the map
$x \mapsto mx$. This front is the emitter the scene shows.

**What emits the light.** $E$ itself emits nothing: it is a caustic, the
place where the incoming rays touch one another. A curve shining in all
directions from each of its points would give a two-parameter family of
rays and a uniform glow without caustics; the incoming rays are a
one-parameter family. The source depends on the level of description.

| Level | Source |
| --- | --- |
| rays, finite $p$ | $p$ directed beams along the tangents of $E$; the emitter of each stands anywhere on its line |
| rays, $p \to \infty$ | a wavefront, any involute of $E$; it emits along its normal, not in all directions |
| wave | a coherent sum of point sources with phases: the points of one front with a common phase, or the points of the mirror with the phases of the optical path, spaced at most $\lambda/2$ apart |

There are no isotropic point sources giving exactly these rays, apart
from $a = 2$ and $a = 3$. The condition "the point $Q$ lies on a line of
the family" is a trigonometric polynomial in $\theta/2$ of degree
$|m| + 1 = |a - 2| + 1$, so at most $|a - 2| + 1$ lines of the family pass
through $Q$, for $a \ge 3$ that is $a - 1$, the number of cusps. Isotropic sources at the cusps would give, for $a \ge 4$, a picture
$2$–$3\%$ of the radius away from the exact one, for $a \le 0$ a
different picture. An incoherent sum of point sources gives no directed
rays. The scene draws the emitter, the wavefront with its cusps on the
mirror, and its light before the mirror and after the reflection.

**Finite $p$.** The chords of the field are the members of the family at
$\theta = 2\pi x/p$, so for finite $p$ the incoming light is $p$ rays
touching $E$ at the points $`E(2\pi x/p - c_0)`$; as $p \to \infty$ the
points of tangency fill the curve. The
number $a$ here is the representative in $(-p/2, p/2]$: the maps
$\times a$ and $\times (a - p)$ have the same chords, but chords of
neighbouring $x$ are neighbours only in the family with the smallest $|a|$.

[![The light whose reflection gives the chords of the times-four map](screenshots/fp-optics.png)](https://evgkch.github.io/galois/?a=4&src=1&chords=0&points=0&rays=257&zoom=0.33&glow=1.5)

The map $x \mapsto 4x$, the elements' chords hidden. The emitter is the
deltoid inscribed in the mirror; the light leaves it along its normals
and converges towards the deltoid behind the mirror, every ray touching
it; the mirror reflects it first, and inside the
circle the reflected rays give the envelope of the chords, their
continuations outside being the light after it leaves ([open](https://evgkch.github.io/galois/?a=4&src=1&chords=0&points=0&rays=257&zoom=0.33&glow=1.5)).

**Fractional linear maps.** For $c \ne 0$ the images of neighbouring
elements $x$ and $x + 1$ differ by $\det/((cx + d)(cx + c + d))$, an
arbitrary residue: on the circle laid out by value the map is
discontinuous, and its chords have no envelope. But it is conjugate to a
multiplication or a rotation. With two fixed points
$`u, v \in \mathbb{F}_p`$, in the coordinate $y = (x - u)/(x - v)$ it has
the form $y \mapsto Ky$; with one fixed point $u$, in the coordinate
$y = 1/(x - u)$ the form $y \mapsto y + \tau$; with fixed points in $`\mathbb{F}_{p^2}`$ the
coordinate $y = (x - u)/(x - \bar u)$ has norm $1$ and the map is a
rotation of the $p + 1$ elements of norm one. Laid out by $y$, the chords
again form a continuous family: for a multiplication with the curve $E$
of $\times K$, for a rotation through $\alpha$ with a caustic circle of
radius $R\cos(\alpha/2)$. For example, the inversion $x \mapsto x^{-1}$
has the fixed points $\pm 1$, equals $y \mapsto -y$ in the coordinate
$y = (x - 1)/(x + 1)$, all its chords are parallel, and the caustic of its
incoming light is a nephroid of radius $R/2$ ([open](https://evgkch.github.io/galois/?a=0&b=1&c=1&d=0&src=1&frame=eigen&ext=0)).

**The wave.** In the wave mode the field is built after Huygens: the
sources are the points of the mirror, each re-emitting the wave it
receives with the phase of its optical path from the emitter, for the
multiplications
$f(\theta) = \frac{2R}{|a - 1|}\left|\sin\frac{(a - 1)\theta + \beta}{2}\right|$,
the field at a point is the sum of these waves, the brightness is the
square of its modulus, and the colour follows the wavelength. The
reflected rays, the caustic and the fringes beside it are the stationary
points of this sum.

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

The elements of $`\mathbb{F}_{p^2}`$ are points of a torus in $\mathbb{R}^3$:
the coordinates $x$ and $y$ run along the two loops of the torus, both
periodic with period $p$. The map is drawn as lines in $\mathbb{R}^3$: a
segment joins the point $z$ to its image. The same surface arises
from the $p \times p$ multiplication table by gluing its opposite edges.

The choice of the non-residue $\nu$ fixes the basis $\{1, i\}$ and with it
the coordinates: one and the same abstract map is drawn differently for
different $\nu$. Affine maps with coefficients in the prime subfield do not
depend on $\nu$; the inversion $z \mapsto z^{-1}$ does ([$\nu = 3$](https://evgkch.github.io/galois/?mode=fp2&a0=0&b0=1&c0=1&d0=0), [$\nu = 5$](https://evgkch.github.io/galois/?mode=fp2&a0=0&b0=1&c0=1&d0=0&ns=5)).

## Geometric progressions

The multiplicative group $`\mathbb{F}_q^{\times}`$ (here $q = p$ or $p^2$) is
cyclic: for a generator $g$, every nonzero element is uniquely $g^k$,
$0 \le k < q - 1$. For example, in $`\mathbb{F}_7`$ the generator is three:
its powers $3, 2, 6, 4, 5, 1$ run through all nonzero residues.

**Exponential form**: a coefficient is given by the exponent $k$ in the
form $g^k$; the zero element is not a power of $g$. The animation step in
this form multiplies the coefficient by $g$ — the coefficient runs through
the geometric progression $g^k, g^{k+1}, \dots$

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
$`\mathrm{PGL}_2(\mathbb{F}_q)`$ and never passes through degenerate maps;
the coef path may cross the set $ad - bc \equiv 0$. The discriminant

$$\Delta = (\mathrm{tr}\, S)^2 - 4 \det S$$

determines the type of the step $S$: hyperbolic — $\Delta$ a square, two
fixed points on the line; parabolic — $\Delta = 0$, one; elliptic —
$\Delta$ a non-square, no fixed points on the line, they lie in the
quadratic extension. For example, the step $z \mapsto -1/z$ at
$p \equiv 3 \pmod 4$ is elliptic: its fixed points are the roots of
$z^2 = -1$, and those exist only in $`\mathbb{F}_{p^2}`$ ([example](https://evgkch.github.io/galois/?p=103&step=T&t=0,102,1,0&play=1)). The panel shows the
type and the order of the step: after that many steps the animation
returns to the initial map.

The "phase" control picks how the fraction between steps is drawn: arc —
the chord's end slides along an arc towards the next image; fade — the two
neighboring diagrams are drawn with weights $1 - t$ and $t$. There are no
intermediate maps inside a finite field: arc interpolates the embedding,
fade shows nothing but the maps themselves. For translations the arc
interpolation coincides with the exact flow.

[![The panel with coefficients as powers of the generator](screenshots/fp2-exp.png)](https://evgkch.github.io/galois/?mode=fp2&form=exp)

Coefficients in the $g^k$ form: $a = g^{37152} = 2$, the denominator is
$g^0 = 1$; the generator is $g = 1 + 5i$ ([open](https://evgkch.github.io/galois/?mode=fp2&form=exp)).

## Controls

| Control     | Action                                                                   |
| ----------- | ------------------------------------------------------------------------ |
| 𝔽p / 𝔽p²   | switches between the circle and the torus                                |
| p           | field characteristic; ‹ › step through primes, the maximum is shown beside |
| i²          | the quadratic non-residue $\nu$ defining $i$ ($`\mathbb{F}_{p^2}`$ only)   |
| g           | generator of $`\mathbb{F}_q^{\times}`$ (the $g^k$ form and the g·z step)   |
| form        | coefficient form: $x + yi$ or $g^k$                                      |
| dot in a coefficient row | picks which coefficient the transport drives (coef step)    |
| step        | what a step does: coef, z+1, g·z, T or $M^n$                             |
| phase       | how the fraction between steps is drawn: arc or cross-fade               |
| ⏮ ▶ ⏭       | step $-1$, play and pause (Space), step $+1$                             |
| speed       | steps per second; the strip under the transport is the transition phase  |
| presets     | a·x and 1/x on the circle; a·z, i·z and 1/z on the torus                 |
| number beside a slider | an input field: the exact coefficient, reduced modulo $p$      |
| frame       | element layout: by value, or by the map's own coordinate in which it is a multiplication or a rotation ($`\mathbb{F}_p`$ only) |
| view        | chords; points; extensions — the lines beyond the circle for the chords, the light before entry, after exit and the virtual continuation towards the caustic for the scene; glow; zoom |
| sources     | the optics scene: the emitter — the wavefront with its cusps on the mirror — and its light before the mirror and after the reflection ($`\mathbb{F}_p`$ only) |
| incoming    | the light before the mirror; switch it off to compare the reflected light with the chords |
| wave, λ     | the wave field of the emitter and its wavelength in units of the radius; the field's colour follows the wavelength, violet to red along the λ scale |
| reset all   | every setting back to its default                                        |
| mouse       | wheel — zoom ×0.1–×10; drag the torus — it rotates; double click — zoom ×1 |
| top-left corner | frame time: fps and milliseconds                                     |

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
| frame=eigen         | layout by the map's own coordinate                |
| src=1               | the optics scene                                  |
| in=0                | hides the light before the mirror                 |
| wave=0.02           | the wave field with its wavelength, together with src |
| rays=257            | number of rays in the optics scene                |
| chords=0, points=0, ext=0 | hide the chords, the points and the extensions |
| glow=1.5            | tone-map exposure                                 |
| zoom=0.7            | zoom                                              |
| play=1, speed=0.5   | autostart of the animation and its speed          |

Example: `?mode=fp2&p=101&a1=1&step=mul&play=1`.

## Run

```
npm install
npm run dev
```

## Reference

V. I. Arnold. Dynamics, statistics and projective geometry of Galois
fields. — Moscow: MCCME, 2005. — 72 p. — In Russian:
[pdf at mccme.ru](https://old.mccme.ru/free-books/arnold/VIA-Galua.pdf).
