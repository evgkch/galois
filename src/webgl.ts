// Compiles a shader pair and links a program. A compile or link failure
// throws with the driver log.
export function createProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader returned null');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile error');
    }
    return sh;
  };

  const prog = gl.createProgram();
  if (!prog) throw new Error('createProgram returned null');
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? 'program link error');
  }
  return prog;
}
