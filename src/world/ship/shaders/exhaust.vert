// The exhaust cones (see model.ts exhaustGeometry): the tip (aT = 1) is pushed back along +Z.
precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uLength; // in ship lengths

in vec3 position;
in float aT;

out float vT;

void main() {
  vec3 p = position + vec3(0.0, 0.0, aT * uLength);
  vT = aT;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
