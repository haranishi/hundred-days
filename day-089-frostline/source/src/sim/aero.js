/** Air force magnitude in N; zero wind in the first model. */
export function dragForce(speed, crouch, p) {
  return 0.5 * p.airDensity * (p.cdA + (p.cdATuck - p.cdA) * crouch) * speed * speed;
}
