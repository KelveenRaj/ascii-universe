// Your ship's mesh (see ShipPass.ts). Camera-relative: the camera sits at the origin, so world
// space here is view-aligned space shifted, and the direction to the eye is just −position.
precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec3 normal;
in float aPart;

out vec3 vNormal;
out vec3 vToEye;
flat out int vPart;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = mat3(modelMatrix) * normal; // rotation only (uniform scale 1)
  vToEye = -world.xyz;
  vPart = int(aPart + 0.5);
  gl_Position = projectionMatrix * viewMatrix * world;
}
